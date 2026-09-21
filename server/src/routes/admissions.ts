import { Router, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import pool from "../db/pool";
import { readClinicProfile } from "../config/reader";
import { accrueBedCharges } from "../utils/admissionBilling";
import { getAdmissionBalance, evaluateClearance, settleOutstandingItems, applyHeldDeposits, applyHeldDepositsToItems } from "../utils/patientBalance";
import { generateNumber } from "../utils/numbering";

const router = Router();

function getTenantId(): string {
  return readClinicProfile().GLOBAL_SAAS_TENANT_ID;
}

// A Specialist only sees admissions for patients referred to them personally or
// to their department. Everyone else (Doctor/Nurse/Admin) sees all admissions.
async function resolveAdmissionScope(req: Request, tenantId: string): Promise<{ scoped: boolean; staffId: string | null; departmentId: string | null }> {
  const role = String(req.headers['x-user-role'] || '');
  if (role !== 'Specialist') return { scoped: false, staffId: null, departmentId: null };
  const staffId = String(req.query.staff_id || '') || null;
  let departmentId: string | null = null;
  if (staffId) {
    const r = await pool.query('SELECT department_id FROM staff_users WHERE id = $1 AND tenant_id = $2', [staffId, tenantId]).catch(() => ({ rows: [] as any[] }));
    departmentId = r.rows[0]?.department_id || null;
  }
  return { scoped: true, staffId, departmentId };
}

function admissionScopeClause(scope: { scoped: boolean; staffId: string | null; departmentId: string | null }, startIdx: number): { sql: string; params: any[] } {
  if (!scope.scoped) return { sql: '', params: [] };
  if (!scope.staffId) return { sql: ' AND false', params: [] };
  return {
    sql: ` AND EXISTS (SELECT 1 FROM referrals r_scope
             WHERE r_scope.tenant_id = a.tenant_id
               AND r_scope.patient_id = a.patient_id
               AND (r_scope.to_consultant_id = $${startIdx}
                    OR ($${startIdx + 1}::uuid IS NOT NULL AND r_scope.to_department_id = $${startIdx + 1}::uuid)))`,
    params: [scope.staffId, scope.departmentId],
  };
}

router.get("/api/wards", async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    // Disabled wards are hidden unless an admin explicitly asks for them (the
    // management pages need them in order to re-enable).
    const includeInactive = String(req.query.include_inactive || "") === "true" && isAdminRequest(req);
    const result = await pool.query(
      `SELECT w.*,
              (SELECT i.price FROM inventory_items i
               WHERE i.ward_id = w.id AND i.service_key = 'BED_DAY' AND i.is_active = true
               ORDER BY i.created_at DESC LIMIT 1) as bed_rate,
              (SELECT COUNT(*)::int FROM admissions a WHERE a.ward_id = w.id AND a.status = 'active') as occupied_count,
              (SELECT COUNT(*)::int FROM admissions a WHERE a.ward_id = w.id) as admission_count
       FROM wards w
       WHERE w.tenant_id = $1 ${includeInactive ? "" : "AND w.is_active = true"}
       ORDER BY w.name`,
      [tenantId]
    );
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

function isAdminRequest(req: Request): boolean {
  const role = String(req.headers["x-user-role"] || "");
  return role === "" || role === "Admin" || role === "SuperAdmin";
}

// Deleting a ward is reserved for the Super Admin (not even hospital Admin).
// A Super Admin who has "entered" a hospital carries role 'Admin' plus
// user_type 'superadmin', so both signals are honoured.
function isSuperAdminRequest(req: Request): boolean {
  const role = String(req.headers["x-user-role"] || "");
  const userType = String(req.headers["x-user-type"] || "");
  return role === "SuperAdmin" || userType === "superadmin";
}

// Short unique ward code, e.g. "Renal Ward" -> RW, then RW1, RW2...
async function generateWardCode(tenantId: string, name: string): Promise<string> {
  const cleaned = String(name || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const words = String(name || "").toUpperCase().split(/\s+/).filter(Boolean);
  let base = words.map((w) => w.replace(/[^A-Z0-9]/g, "")[0] || "").join("").slice(0, 4);
  if (base.length < 2) base = cleaned.slice(0, 4);
  if (!base) base = "WARD";
  for (let i = 0; i < 1000; i++) {
    const candidate = (i === 0 ? base : `${base}${i}`).slice(0, 20);
    const exists = await pool.query(
      "SELECT 1 FROM wards WHERE tenant_id = $1 AND code = $2 LIMIT 1",
      [tenantId, candidate]
    );
    if (exists.rows.length === 0) return candidate;
  }
  return `${base}${Date.now()}`.slice(0, 20);
}

// POST /api/wards -- create a ward AND its linked per-night inventory item
// (service_key 'BED_DAY'), so Paypoint/accrual always resolve by ID.
router.post("/api/wards", async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    if (!isAdminRequest(req)) {
      res.status(403).json({ error: true, message: "Only administrators can create wards" });
      return;
    }
    const { name, code, description, price } = req.body;
    if (!name || !String(name).trim()) {
      res.status(400).json({ error: true, message: "Ward name is required" });
      return;
    }
    const cleanName = String(name).trim();
    const dup = await pool.query(
      "SELECT id FROM wards WHERE tenant_id = $1 AND LOWER(name) = LOWER($2)",
      [tenantId, cleanName]
    );
    if (dup.rows.length > 0) {
      res.status(409).json({ error: true, message: "A ward with this name already exists" });
      return;
    }
    const rate = parseFloat(price);
    if (isNaN(rate) || rate < 0) {
      res.status(400).json({ error: true, message: "Bed price per night must be a non-negative number" });
      return;
    }

    // Code may be typed in, or left blank to auto-generate. It is immutable
    // after creation.
    let wardCode: string;
    const typedCode = String(code || "").trim().toUpperCase();
    if (typedCode) {
      if (!/^[A-Z0-9][A-Z0-9\-_]{0,19}$/.test(typedCode)) {
        res.status(400).json({ error: true, message: "Code may only contain letters, numbers, dash and underscore (max 20)." });
        return;
      }
      const codeDup = await pool.query(
        "SELECT 1 FROM wards WHERE tenant_id = $1 AND code = $2 LIMIT 1",
        [tenantId, typedCode]
      );
      if (codeDup.rows.length > 0) {
        res.status(409).json({ error: true, message: `Ward code "${typedCode}" is already in use.` });
        return;
      }
      wardCode = typedCode;
    } else {
      wardCode = await generateWardCode(tenantId, cleanName);
    }

    const wardId = uuidv4();
    const itemId = uuidv4();

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO wards (id, tenant_id, name, code, description, is_active)
         VALUES ($1, $2, $3, $4, $5, true)`,
        [wardId, tenantId, cleanName, wardCode, description || null]
      );
      await client.query(
        `INSERT INTO inventory_items (id, tenant_id, drug_name, category, price, cost_price, amount_type, is_active, ward_id, service_key)
         VALUES ($1, $2, $3, 'general', $4, 0, 'units', true, $5, 'BED_DAY')`,
        [itemId, tenantId, `${cleanName} Admission (Per Night)`, rate, wardId]
      );
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }

    res.status(201).json({
      ward: { id: wardId, name: cleanName, code: wardCode, description: description || null, is_active: true },
      item: { id: itemId, name: `${cleanName} Admission (Per Night)`, price: rate, service_key: 'BED_DAY' },
    });
  } catch (err: any) {
    if (err.code === "23505") {
      res.status(409).json({ error: true, message: "A ward with this code already exists" });
      return;
    }
    res.status(500).json({ error: true, message: err.message });
  }
});

// PUT /api/wards/:id -- update nightly price, description, or enable/disable.
// A ward with patients currently admitted cannot be edited or disabled, and the
// code is immutable after creation.
router.put("/api/wards/:id", async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    if (!isAdminRequest(req)) {
      res.status(403).json({ error: true, message: "Only administrators can update wards" });
      return;
    }
    const wardId = String(req.params.id);
    const ward = await pool.query(
      "SELECT * FROM wards WHERE id = $1 AND tenant_id = $2",
      [wardId, tenantId]
    );
    if (ward.rows.length === 0) {
      res.status(404).json({ error: true, message: "Ward not found" });
      return;
    }
    const oldWard = ward.rows[0];

    // Locked while patients are currently admitted.
    const occupied = await pool.query(
      "SELECT COUNT(*)::int AS n FROM admissions WHERE ward_id = $1 AND status = 'active'",
      [wardId]
    );
    if ((occupied.rows[0]?.n || 0) > 0) {
      res.status(409).json({ error: true, message: "This ward currently has admitted patients and cannot be edited or disabled." });
      return;
    }

    // Nightly price is optional on update; when sent, it updates the linked item.
    const hasPrice = req.body.price !== undefined && req.body.price !== null && req.body.price !== "";
    if (hasPrice) {
      const rate = parseFloat(req.body.price);
      if (isNaN(rate) || rate < 0) {
        res.status(400).json({ error: true, message: "Bed price per night must be a non-negative number" });
        return;
      }
      const linked = await pool.query(
        `SELECT id FROM inventory_items
         WHERE tenant_id = $1 AND ward_id = $2 AND service_key = 'BED_DAY' AND is_active = true
         ORDER BY created_at DESC LIMIT 1`,
        [tenantId, wardId]
      );
      if (linked.rows.length > 0) {
        await pool.query("UPDATE inventory_items SET price = $1 WHERE id = $2", [rate, linked.rows[0].id]);
      } else {
        await pool.query(
          `INSERT INTO inventory_items (id, tenant_id, drug_name, category, price, cost_price, amount_type, is_active, ward_id, service_key)
           VALUES ($1, $2, $3, 'general', $4, 0, 'units', true, $5, 'BED_DAY')`,
          [uuidv4(), tenantId, `${oldWard.name} Admission (Per Night)`, rate, wardId]
        );
      }
    }

    const hasActive = typeof req.body.is_active === "boolean";
    const result = await pool.query(
      `UPDATE wards SET
         description = COALESCE($1, description),
         is_active = COALESCE($2, is_active)
       WHERE id = $3 AND tenant_id = $4
       RETURNING *`,
      [req.body.description || null, hasActive ? req.body.is_active : null, wardId, tenantId]
    );
    const newWard = result.rows[0];

    const bedItem = await pool.query(
      `SELECT price FROM inventory_items
        WHERE tenant_id = $1 AND ward_id = $2 AND service_key = 'BED_DAY' AND is_active = true
        ORDER BY created_at DESC LIMIT 1`,
      [tenantId, wardId]
    );

    await pool.query(
      `INSERT INTO audit_logs (tenant_id, action, table_name, record_id, performed_by, old_data, new_data)
       VALUES ($1, 'UPDATE', 'wards', $2, $3, $4, $5)`,
      [tenantId, wardId, req.body.performed_by || null, JSON.stringify(oldWard), JSON.stringify(newWard)]
    );
    res.json({ ...newWard, bed_rate: bedItem.rows[0] ? parseFloat(bedItem.rows[0].price) : 0 });
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// DELETE /api/wards/:id -- delete a ward, its beds (FK cascade) and its linked
// per-night inventory item. Blocked when the ward has admission records so
// clinical history is never destroyed.
router.delete("/api/wards/:id", async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    // Only the Super Admin may delete a ward. Everyone else can disable it.
    if (!isSuperAdminRequest(req)) {
      res.status(403).json({ error: true, message: "Only the Super Admin can delete a ward. Disable it instead." });
      return;
    }
    const wardId = String(req.params.id);
    const ward = await pool.query("SELECT * FROM wards WHERE id = $1 AND tenant_id = $2", [wardId, tenantId]);
    if (ward.rows.length === 0) {
      res.status(404).json({ error: true, message: "Ward not found" });
      return;
    }

    const used = await pool.query("SELECT COUNT(*)::int AS n FROM admissions WHERE ward_id = $1", [wardId]);
    if ((used.rows[0]?.n || 0) > 0) {
      res.status(409).json({ error: true, message: "This ward has admission records and cannot be deleted. Transfer or clear those admissions first." });
      return;
    }

    const linked = await pool.query(
      "SELECT id FROM inventory_items WHERE tenant_id = $1 AND ward_id = $2",
      [tenantId, wardId]
    );

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      // Clean insurance rules tied to the nightly item (no FK on those tables).
      for (const row of linked.rows) {
        await client.query("DELETE FROM insurance_provider_coverage_rules WHERE inventory_item_id = $1", [row.id]);
        await client.query("DELETE FROM insurance_provider_service_prices WHERE inventory_item_id = $1", [row.id]);
      }
      await client.query("DELETE FROM inventory_items WHERE tenant_id = $1 AND ward_id = $2", [tenantId, wardId]);
      await client.query("DELETE FROM wards WHERE id = $1 AND tenant_id = $2", [wardId, tenantId]);
      await client.query(
        `INSERT INTO audit_logs (tenant_id, action, table_name, record_id, performed_by, old_data, new_data)
         VALUES ($1, 'DELETE', 'wards', $2, $3, $4, $5)`,
        [tenantId, wardId, req.body?.performed_by || null, JSON.stringify(ward.rows[0]), null]
      );
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }

    res.json({ message: "Ward deleted" });
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.get("/api/admissions", async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    try { await accrueBedCharges(tenantId); } catch {}
    const { patient_id, status, exclude_status, search, ward_name, date_from, date_to, page, limit } = req.query;
    let query = `SELECT a.*, w.name as ward_name, s.name as admitted_by_name, sd.name as discharged_by_name,
                 p.full_name as patient_name, p.hospital_number
                 FROM admissions a
                 JOIN wards w ON w.id = a.ward_id
                 JOIN patients p ON p.id = a.patient_id
                 LEFT JOIN staff_users s ON s.id = a.admitted_by
                 LEFT JOIN staff_users sd ON sd.id = a.discharged_by
                 WHERE a.tenant_id = $1 AND p.folder_activated IS DISTINCT FROM false`;
    const params: any[] = [tenantId];
    let idx = 2;

    if (patient_id) {
      query += ` AND a.patient_id = \$${idx}`;
      params.push(patient_id);
      idx++;
    }
    if (status) {
      query += ` AND a.status = \$${idx}`;
      params.push(status);
      idx++;
    }
    if (exclude_status) {
      const excluded = String(exclude_status).split(',').map((s) => s.trim()).filter(Boolean);
      if (excluded.length > 0) {
        query += ` AND a.status <> ALL(\$${idx}::text[])`;
        params.push(excluded);
        idx++;
      }
    }
    if (search) {
      query += ` AND (p.full_name ILIKE \$${idx} OR p.hospital_number ILIKE \$${idx})`;
      params.push(`%${search}%`);
      idx++;
    }
    if (ward_name) {
      query += ` AND w.name = \$${idx}`;
      params.push(ward_name);
      idx++;
    }
    if (date_from) {
      query += ` AND a.admitted_at >= \$${idx}::date`;
      params.push(date_from);
      idx++;
    }
    if (date_to) {
      query += ` AND a.admitted_at < (\$${idx}::date + INTERVAL '1 day')`;
      params.push(date_to);
      idx++;
    }

    // Specialists only see admissions for patients referred to them / their dept.
    const scope = await resolveAdmissionScope(req, tenantId);
    const scopeClause = admissionScopeClause(scope, idx);
    if (scopeClause.sql) { query += scopeClause.sql; params.push(...scopeClause.params); idx += scopeClause.params.length; }

    // Opt-in server-side pagination keeps the history tab light. Without a
    // `page` param the endpoint keeps returning a plain array for existing
    // callers (Doctor Dashboard, Patient Chart, etc.).
    if (page) {
      const pageNum = parseInt(page as string) || 1;
      const limitNum = parseInt(limit as string) || 25;
      const offset = (pageNum - 1) * limitNum;
      const countQuery = query.replace(/^[\s\S]*?FROM admissions a\b/, 'SELECT COUNT(*) as total FROM admissions a');
      const countRes = await pool.query(countQuery, params);
      const total = parseInt(countRes.rows[0]?.total) || 0;
      const paged = await pool.query(query + ` ORDER BY a.admitted_at DESC LIMIT \$${idx++} OFFSET \$${idx++}`, [...params, limitNum, offset]);
      res.json({ rows: paged.rows, total, page: pageNum, limit: limitNum });
      return;
    }

    query += " ORDER BY a.admitted_at DESC";
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.post("/api/admissions", async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const { patient_id, ward_id, notes, admitted_by } = req.body;
    if (!patient_id || !ward_id) {
      res.status(400).json({ error: true, message: "patient_id and ward_id are required" });
      return;
    }
    // A disabled ward is not usable.
    const wardCheck = await pool.query(
      "SELECT is_active FROM wards WHERE id = $1 AND tenant_id = $2",
      [ward_id, tenantId]
    );
    if (wardCheck.rows.length === 0) {
      res.status(404).json({ error: true, message: "Ward not found" });
      return;
    }
    if (wardCheck.rows[0].is_active === false) {
      res.status(409).json({ error: true, message: "This ward is disabled and cannot be used for new admissions." });
      return;
    }
    if (!admitted_by) {
      res.status(400).json({ error: true, message: "The admitting doctor is required" });
      return;
    }

    // Only active Doctors and Admins may admit; doctors can only admit patients
    // that are assigned to them or that they claimed.
    const staff = await pool.query(
      "SELECT role FROM staff_users WHERE id = $1 AND tenant_id = $2 AND status = $3",
      [admitted_by, tenantId, "active"]
    );
    if (staff.rows.length === 0) {
      res.status(403).json({ error: true, message: "Admitting staff not found or inactive" });
      return;
    }
    const role = staff.rows[0].role;
    if (role !== "Doctor" && role !== "Admin") {
      res.status(403).json({ error: true, message: "Only doctors and administrators can admit patients to a ward" });
      return;
    }
    if (role === "Doctor") {
      const pat = await pool.query(
        "SELECT assigned_doctor_id FROM patients WHERE id = $1 AND tenant_id = $2",
        [patient_id, tenantId]
      );
      if (pat.rows.length === 0) {
        res.status(404).json({ error: true, message: "Patient not found" });
        return;
      }
      if (!pat.rows[0].assigned_doctor_id || pat.rows[0].assigned_doctor_id !== admitted_by) {
        res.status(403).json({ error: true, message: "Doctors can only admit patients assigned to them or that they claimed" });
        return;
      }
    }

    const active = await pool.query("SELECT id FROM admissions WHERE patient_id = $1 AND status = $2 AND tenant_id = $3", [patient_id, "active", tenantId]);
    if (active.rows.length > 0) {
      res.status(409).json({ error: true, message: "Patient already has an active admission" });
      return;
    }

    // Admission time defaults to now; the admitting doctor may adjust the time of
    // the day (date is fixed to the current day on the client).
    let admittedAt: Date;
    if (req.body.admitted_at === undefined || req.body.admitted_at === null || req.body.admitted_at === "") {
      admittedAt = new Date();
    } else {
      admittedAt = new Date(String(req.body.admitted_at));
      if (isNaN(admittedAt.getTime())) {
        res.status(400).json({ error: true, message: "admitted_at must be a valid date/time" });
        return;
      }
    }
    if (admittedAt.getTime() > Date.now() + 60000) {
      res.status(400).json({ error: true, message: "Admission time cannot be in the future" });
      return;
    }

    const id = uuidv4();
    let result;
    try {
      result = await pool.query(
        `INSERT INTO admissions (id, tenant_id, patient_id, ward_id, notes, admitted_by, admitted_at) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [id, tenantId, patient_id, ward_id, notes || null, admitted_by, admittedAt]
      );
    } catch (e: any) {
      // Backstop against a race between the check above and this insert.
      if (e?.code === "23505") {
        res.status(409).json({ error: true, message: "Patient already has an active admission" });
        return;
      }
      throw e;
    }

    // Open the first ward stay so bed-day billing (and transfers) have a
    // segment with a start time.
    await pool.query(
      `INSERT INTO admission_ward_stays (tenant_id, admission_id, ward_id, bed_number, started_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [tenantId, id, ward_id, null, admittedAt]
    );

    const ward = await pool.query("SELECT name FROM wards WHERE id = $1", [ward_id]);
    let admittedByName = "";
    if (admitted_by) {
      const s = await pool.query("SELECT name FROM staff_users WHERE id = $1", [admitted_by]);
      admittedByName = s.rows[0]?.name || "";
    }

    // Start day 1 charge immediately when the ward has a daily rate configured.
    try { await accrueBedCharges(tenantId, id); } catch {}

    res.status(201).json({ ...result.rows[0], ward_name: ward.rows[0]?.name || "", admitted_by_name: admittedByName });

    // Audit log
    await pool.query(
      `INSERT INTO audit_logs (tenant_id, action, table_name, record_id, performed_by, new_data)
       VALUES ($1, 'INSERT', 'admissions', $2, $3, $4)`,
      [tenantId, id, admitted_by || null, JSON.stringify(result.rows[0])]
    );
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// Shared finalize routine used by direct discharge, finance clearance and
// admin override. Returns a structured outcome instead of writing the response
// so all three callers behave identically.
async function finalizeDischarge(
  id: string,
  tenantId: string,
  actorId: string | null,
  body: any
): Promise<{ ok: true; row: any } | { ok: false; status: number; body: any }> {
  const { discharge_summary, discharge_instructions, override, override_reason } = body || {};

  const activeRes = await pool.query(
    "SELECT id, patient_id, admitted_at FROM admissions WHERE id = $1 AND status = 'active' AND tenant_id = $2",
    [id, tenantId]
  );
  if (activeRes.rows.length === 0) {
    return { ok: false, status: 404, body: { error: true, message: "Active admission not found" } };
  }
  const patientId = activeRes.rows[0].patient_id;

  // Capture the final (possibly partial) bed day BEFORE pricing the bill, so
  // the closing day is included in the clearance balance.
  const dischargeTime = new Date();
  try { await accrueBedCharges(tenantId, id, dischargeTime); } catch {}

  const balance = await getAdmissionBalance(id, tenantId);
  const decision = balance
    ? evaluateClearance(balance)
    : { can_discharge: true, payer_type: 'self_pay' as const, reason: '' };

  let clearanceStatus = "cleared";
  let overrideReason: string | null = null;

  if (!decision.can_discharge) {
    if (override) {
      // Only an administrator may release the gate, and only with a reason.
      if (!actorId) {
        return { ok: false, status: 400, body: { error: true, message: "The discharging staff member is required for an override." } };
      }
      const staff = await pool.query(
        "SELECT role FROM staff_users WHERE id = $1 AND tenant_id = $2 AND status = 'active'",
        [actorId, tenantId]
      );
      if (staff.rows.length === 0 || staff.rows[0].role !== "Admin") {
        return { ok: false, status: 403, body: { error: true, message: "Only an administrator can override an outstanding discharge balance." } };
      }
      if (!override_reason || !String(override_reason).trim()) {
        return { ok: false, status: 400, body: { error: true, message: "An override reason is required." } };
      }
      clearanceStatus = "overridden";
      overrideReason = String(override_reason).trim();
    } else {
      return {
        ok: false,
        status: 402,
        body: {
          error: true,
          message: `Outstanding balance of ${Number(balance?.outstanding || 0).toLocaleString()} must be settled before discharge.`,
          balance,
          payer: decision.payer_type,
        },
      };
    }
  }

  // The gross bill for the episode is the settlement statement; deposits and
  // payments already show separately as credits.
  const finalBillItems: any[] = balance?.items || [];
  const finalBillTotal = Math.round(
    (balance?.charges_total ?? finalBillItems.reduce((s, i) => s + (Number(i.amount) || 0), 0)) * 100
  ) / 100;

  const result = await pool.query(
    `UPDATE admissions SET status = 'discharged', discharged_at = $1, discharged_by = COALESCE($2, discharged_by),
       discharge_summary = COALESCE($5, discharge_summary), discharge_instructions = COALESCE($6, discharge_instructions),
       payer_type = $7, clearance_status = $8, cleared_by = COALESCE($2, cleared_by), cleared_at = $1,
       balance_at_clearance = $9, override_reason = $10, final_bill_total = $11, final_bill_items = $12
     WHERE id = $3 AND status = 'active' AND tenant_id = $4 RETURNING *`,
    [dischargeTime, actorId, id, tenantId, discharge_summary || null, discharge_instructions || null,
     decision.payer_type, clearanceStatus, balance?.outstanding ?? 0, overrideReason,
     finalBillTotal, JSON.stringify(finalBillItems)]
  );
  if (result.rows.length === 0) {
    return { ok: false, status: 404, body: { error: true, message: "Active admission not found" } };
  }

  // Close the final ward-stay segment at the discharge time.
  await pool.query(
    `UPDATE admission_ward_stays SET ended_at = COALESCE(ended_at, $1)
      WHERE admission_id = $2 AND ended_at IS NULL`,
    [dischargeTime, id]
  ).catch(() => {});

  // Account is settled at clearance: stop Paypoint showing the items as owing
  // and consume any deposits held on account.
  await settleOutstandingItems(pool, patientId);
  await applyHeldDeposits(pool, tenantId, patientId);

  // Audit log
  const oldAdm = await pool.query('SELECT * FROM admissions WHERE id = $1', [id]);
  if (oldAdm.rows.length > 0) {
    await pool.query(
      `INSERT INTO audit_logs (tenant_id, action, table_name, record_id, performed_by, old_data, new_data)
       VALUES ($1, 'UPDATE', 'admissions', $2, $3, $4, $5)`,
      [oldAdm.rows[0].tenant_id, id, actorId, JSON.stringify(oldAdm.rows[0]), JSON.stringify(result.rows[0])]
    );
  }

  return { ok: true, row: result.rows[0] };
}

router.put("/api/admissions/:id/discharge", async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const id = String(req.params.id);
    const outcome = await finalizeDischarge(id, tenantId, req.body?.discharged_by || null, req.body);
    if (!outcome.ok) { res.status(outcome.status).json(outcome.body); return; }
    res.json(outcome.row);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// Doctor submits a discharge for financial clearance: the summary is saved and
// the admission is flagged pending, but the patient is not released yet.
router.post("/api/admissions/:id/request-discharge", async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const id = String(req.params.id);
    const { discharged_by, discharge_summary, discharge_instructions } = req.body;
    if (!discharge_summary || !String(discharge_summary).trim()) {
      res.status(400).json({ error: true, message: "A discharge summary is required." });
      return;
    }
    const activeRes = await pool.query(
      "SELECT id FROM admissions WHERE id = $1 AND status = 'active' AND tenant_id = $2",
      [id, tenantId]
    );
    if (activeRes.rows.length === 0) {
      res.status(404).json({ error: true, message: "Active admission not found" });
      return;
    }
    try { await accrueBedCharges(tenantId, id); } catch {}

    const result = await pool.query(
      `UPDATE admissions
          SET discharge_summary = COALESCE($1, discharge_summary),
              discharge_instructions = COALESCE($2, discharge_instructions),
              discharge_requested_at = NOW(), discharge_requested_by = $3
        WHERE id = $4 AND status = 'active' AND tenant_id = $5 RETURNING *`,
      [String(discharge_summary).trim(), discharge_instructions || null, discharged_by || null, id, tenantId]
    );
    const balance = await getAdmissionBalance(id, tenantId);
    const decision = balance ? evaluateClearance(balance) : null;
    res.json({ admission: result.rows[0], balance, can_clear: decision ? decision.can_discharge : true });
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// Finance/Paypoint clears a requested discharge (finalizes it).
router.post("/api/admissions/:id/clear", async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const id = String(req.params.id);
    const actor = req.body?.cleared_by || req.body?.discharged_by || null;
    const outcome = await finalizeDischarge(id, tenantId, actor, req.body);
    if (!outcome.ok) { res.status(outcome.status).json(outcome.body); return; }
    res.json(outcome.row);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// Shared date-clause builder for the clearance endpoints.
function addDateFilter(whereParts: { sql: string; params: any[]; idx: number }, column: string, from: any, to: any) {
  if (from) { whereParts.sql += ` AND ${column} >= $${whereParts.idx}::date`; whereParts.params.push(from); whereParts.idx++; }
  if (to) { whereParts.sql += ` AND ${column} < ($${whereParts.idx}::date + INTERVAL '1 day')`; whereParts.params.push(to); whereParts.idx++; }
}

// Worklist: active admissions whose discharge has been requested but not cleared.
router.get("/api/admissions/pending-clearance", async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    try { await accrueBedCharges(tenantId); } catch {}
    const { search, date_from, date_to, page, limit } = req.query;

    const w = { sql: `a.tenant_id = $1 AND a.status = 'active' AND a.discharge_requested_at IS NOT NULL`, params: [tenantId] as any[], idx: 2 };
    if (search) { w.sql += ` AND (p.full_name ILIKE $${w.idx} OR p.hospital_number ILIKE $${w.idx})`; w.params.push(`%${search}%`); w.idx++; }
    addDateFilter(w, 'a.discharge_requested_at', date_from, date_to);
    const pcScope = admissionScopeClause(await resolveAdmissionScope(req, tenantId), w.idx);
    if (pcScope.sql) { w.sql += pcScope.sql; w.params.push(...pcScope.params); w.idx += pcScope.params.length; }

    const from = `FROM admissions a
        JOIN wards w ON w.id = a.ward_id
        JOIN patients p ON p.id = a.patient_id
        LEFT JOIN staff_users s ON s.id = a.admitted_by
        LEFT JOIN staff_users dr ON dr.id = a.discharge_requested_by
       WHERE ${w.sql}`;

    const pageNum = parseInt(page as string) || 0;
    const limitNum = parseInt(limit as string) || 25;
    let rows: any[] = [];
    let total = 0;
    if (pageNum) {
      const countRes = await pool.query(`SELECT COUNT(*)::int AS total ${from}`, w.params);
      total = countRes.rows[0]?.total || 0;
      const offset = (pageNum - 1) * limitNum;
      const listRes = await pool.query(
        `SELECT a.*, w.name AS ward_name, p.full_name AS patient_name, p.hospital_number,
                s.name AS admitted_by_name, dr.name AS discharge_requested_by_name ${from}
          ORDER BY a.discharge_requested_at ASC LIMIT $${w.idx++} OFFSET $${w.idx++}`,
        [...w.params, limitNum, offset]
      );
      rows = listRes.rows;
    } else {
      const listRes = await pool.query(
        `SELECT a.*, w.name AS ward_name, p.full_name AS patient_name, p.hospital_number,
                s.name AS admitted_by_name, dr.name AS discharge_requested_by_name ${from}
          ORDER BY a.discharge_requested_at ASC`,
        w.params
      );
      rows = listRes.rows;
    }

    const enriched: any[] = [];
    for (const r of rows) {
      const balance = await getAdmissionBalance(r.id, tenantId);
      const decision = balance ? evaluateClearance(balance) : null;
      enriched.push({ ...r, balance, can_clear: decision ? decision.can_discharge : true });
    }

    if (pageNum) res.json({ rows: enriched, total, page: pageNum, limit: limitNum });
    else res.json(enriched);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// History: admissions already cleared / overridden, with their final bill.
router.get("/api/admissions/clearance-history", async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const { search, date_from, date_to, page, limit } = req.query;

    const w = { sql: `a.tenant_id = $1 AND a.status <> 'active' AND a.clearance_status IN ('cleared', 'overridden')`, params: [tenantId] as any[], idx: 2 };
    if (search) { w.sql += ` AND (p.full_name ILIKE $${w.idx} OR p.hospital_number ILIKE $${w.idx})`; w.params.push(`%${search}%`); w.idx++; }
    addDateFilter(w, 'a.discharged_at', date_from, date_to);
    const chScope = admissionScopeClause(await resolveAdmissionScope(req, tenantId), w.idx);
    if (chScope.sql) { w.sql += chScope.sql; w.params.push(...chScope.params); w.idx += chScope.params.length; }

    const from = `FROM admissions a
        JOIN wards w ON w.id = a.ward_id
        JOIN patients p ON p.id = a.patient_id
        LEFT JOIN staff_users s ON s.id = a.admitted_by
        LEFT JOIN staff_users sd ON sd.id = a.discharged_by
        LEFT JOIN staff_users cb ON cb.id = a.cleared_by
       WHERE ${w.sql}`;

    const select = `SELECT a.*, w.name AS ward_name, p.full_name AS patient_name, p.hospital_number,
              s.name AS admitted_by_name, sd.name AS discharged_by_name, cb.name AS cleared_by_name`;

    const pageNum = parseInt(page as string) || 0;
    const limitNum = parseInt(limit as string) || 25;
    if (pageNum) {
      const countRes = await pool.query(`SELECT COUNT(*)::int AS total ${from}`, w.params);
      const total = countRes.rows[0]?.total || 0;
      const offset = (pageNum - 1) * limitNum;
      const listRes = await pool.query(
        `${select} ${from} ORDER BY a.discharged_at DESC NULLS LAST LIMIT $${w.idx++} OFFSET $${w.idx++}`,
        [...w.params, limitNum, offset]
      );
      res.json({ rows: listRes.rows, total, page: pageNum, limit: limitNum });
      return;
    }
    const listRes = await pool.query(`${select} ${from} ORDER BY a.discharged_at DESC NULLS LAST`, w.params);
    res.json(listRes.rows);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// Deposits held on account (reduce the outstanding balance).
router.get("/api/admissions/:id/deposit", async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const id = String(req.params.id);
    const result = await pool.query(
      `SELECT d.*, s.name AS created_by_name
         FROM patient_deposits d
         LEFT JOIN staff_users s ON s.id = d.created_by
        WHERE d.tenant_id = $1 AND d.admission_id = $2
        ORDER BY d.created_at DESC`,
      [tenantId, id]
    );
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.post("/api/admissions/:id/deposit", async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const id = String(req.params.id);
    const { amount, method, notes, created_by } = req.body;
    const amt = parseFloat(String(amount));
    if (!amt || amt <= 0) {
      res.status(400).json({ error: true, message: "A positive deposit amount is required." });
      return;
    }
    const adm = await pool.query("SELECT patient_id FROM admissions WHERE id = $1 AND tenant_id = $2", [id, tenantId]);
    if (adm.rows.length === 0) {
      res.status(404).json({ error: true, message: "Admission not found" });
      return;
    }
    const patientId = adm.rows[0].patient_id;
    const depId = uuidv4();
    const paymentId = uuidv4();

    // Record the deposit as a receipted payment so Finance sees the money in
    // payment history/revenue and a receipt exists. The credit itself is tracked
    // in patient_deposits (linked by payment_id); applying it to items is
    // allocation only and is not counted as revenue again.
    let receiptNumber: string | null = null;
    try {
      receiptNumber = await generateNumber(tenantId, "receipt", { prefix: "RCP" });
      await pool.query(
        `INSERT INTO payments (id, tenant_id, receipt_number, patient_id, total_amount, payment_method, notes, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [paymentId, tenantId, receiptNumber, patientId, amt, method || "cash", notes || "Admission deposit (on account)", created_by || null]
      );
      await pool.query(
        `INSERT INTO payment_items (id, tenant_id, payment_id, service_type, service_id, description, item_name, quantity, unit_price, total_price, cost_price, is_converted)
         VALUES ($1, $2, $3, 'deposit', NULL, 'Deposit on account', 'Deposit on account', 1, $4, $4, 0, true)`,
        [uuidv4(), tenantId, paymentId, amt]
      );
    } catch { receiptNumber = null; }

    await pool.query(
      `INSERT INTO patient_deposits (id, tenant_id, patient_id, admission_id, amount, method, notes, created_by, payment_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [depId, tenantId, patientId, id, amt, method || 'cash', notes || null, created_by || null, receiptNumber ? paymentId : null]
    );
    // Immediately apply the deposit to outstanding items so every Paypoint view
    // (pending lists, patient cards, counts) reflects it.
    try { await applyHeldDepositsToItems(pool, tenantId, patientId); } catch {}
    // Itemise what THIS deposit settled, for its receipt.
    let coveredItems: any[] = [];
    try {
      const cov = await pool.query(
        `SELECT service_type, service_id, description, amount
           FROM deposit_applications WHERE deposit_id = $1 ORDER BY created_at ASC`,
        [depId]
      );
      coveredItems = cov.rows.map((r: any) => ({ service_type: r.service_type, service_id: r.service_id, description: r.description, amount: Number(r.amount) || 0 }));
    } catch {}
    const balance = await getAdmissionBalance(id, tenantId);
    res.status(201).json({ deposit_id: depId, payment_id: receiptNumber ? paymentId : null, receipt_number: receiptNumber, covered_items: coveredItems, balance });
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.get("/api/admissions/active", async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    try { await accrueBedCharges(tenantId); } catch {}
    const scope = await resolveAdmissionScope(req, tenantId);
    const scopeClause = admissionScopeClause(scope, 2);
    const result = await pool.query(
      `SELECT a.*, w.name as ward_name, p.full_name as patient_name, p.hospital_number,
              s.name as admitted_by_name, sd.name as discharged_by_name
       FROM admissions a
       JOIN wards w ON w.id = a.ward_id
       JOIN patients p ON p.id = a.patient_id
       LEFT JOIN staff_users s ON s.id = a.admitted_by
       LEFT JOIN staff_users sd ON sd.id = a.discharged_by
        WHERE a.status = 'active' AND a.tenant_id = $1 AND p.folder_activated IS DISTINCT FROM false${scopeClause.sql} ORDER BY a.admitted_at DESC`,
      [tenantId, ...scopeClause.params]
    );
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// Aggregate counters for the admissions header + history filters, so the page
// no longer needs to download every admission to compute stats.
router.get("/api/admissions/stats", async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const scope = await resolveAdmissionScope(req, tenantId);
    const scopeClause = admissionScopeClause(scope, 2);
    const totals = await pool.query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE a.status = 'active')::int AS active,
         COUNT(*) FILTER (WHERE a.status <> 'active')::int AS history_total
       FROM admissions a
       JOIN patients p ON p.id = a.patient_id
       WHERE a.tenant_id = $1 AND p.folder_activated IS DISTINCT FROM false${scopeClause.sql}`,
      [tenantId, ...scopeClause.params]
    );
    const wards = await pool.query(
      `SELECT DISTINCT w.name
       FROM admissions a
       JOIN wards w ON w.id = a.ward_id
       JOIN patients p ON p.id = a.patient_id
       WHERE a.tenant_id = $1 AND a.status <> 'active' AND p.folder_activated IS DISTINCT FROM false${scopeClause.sql}
       ORDER BY w.name`,
      [tenantId, ...scopeClause.params]
    );
    res.json({ ...totals.rows[0], history_ward_names: wards.rows.map((r: any) => r.name) });
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// Financial clearance view for one admission: the outstanding bill and whether
// the patient may be discharged (zero balance or an approved payer).
router.get("/api/admissions/:id/balance", async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const id = String(req.params.id);
    try { await accrueBedCharges(tenantId); } catch {}
    const balance = await getAdmissionBalance(id, tenantId);
    if (!balance) {
      res.status(404).json({ error: true, message: "Admission not found" });
      return;
    }
    res.json({ ...balance, ...evaluateClearance(balance) });
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.put("/api/admissions/:id/bed", async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const { id } = req.params;
    const { bed_number } = req.body;
    const adm = await pool.query("SELECT ward_id, is_paid FROM admissions WHERE id = $1 AND status = $2 AND tenant_id = $3", [id, "active", tenantId]);
    if (adm.rows.length === 0) {
      res.status(404).json({ error: true, message: "Active admission not found" });
      return;
    }
    if (!adm.rows[0].is_paid) {
      res.status(402).json({ error: true, message: "Payment required: Admission fee has not been paid" });
      return;
    }
    const wardId = adm.rows[0].ward_id;
    const dup = await pool.query(
      "SELECT id FROM admissions WHERE ward_id = $1 AND bed_number = $2 AND status = $3 AND id != $4 AND tenant_id = $5",
      [wardId, bed_number, "active", id, tenantId]
    );
    if (dup.rows.length > 0) {
      res.status(409).json({ error: true, message: "Bed already assigned to another patient in this ward" });
      return;
    }
    const result = await pool.query(
      `UPDATE admissions SET bed_number = COALESCE($1, bed_number) WHERE id = $2 AND status = 'active' AND tenant_id = $3 RETURNING *`,
      [bed_number || null, id, tenantId]
    );
    // Keep the open ward-stay segment's bed in step with the admission.
    await pool.query(
      `UPDATE admission_ward_stays SET bed_number = COALESCE($1, bed_number)
        WHERE admission_id = $2 AND ended_at IS NULL`,
      [bed_number || null, id]
    ).catch(() => {});
    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// GET /api/admissions/:id/stays -- ward-stay history for one admission.
router.get("/api/admissions/:id/stays", async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const id = String(req.params.id);
    const result = await pool.query(
      `SELECT s.*, w.name AS ward_name, u.name AS transferred_by_name
         FROM admission_ward_stays s
         LEFT JOIN wards w ON w.id = s.ward_id
         LEFT JOIN staff_users u ON u.id = s.transferred_by
        WHERE s.tenant_id = $1 AND s.admission_id = $2
        ORDER BY s.started_at ASC`,
      [tenantId, id]
    );
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// POST /api/admissions/:id/transfer -- move an admitted patient to another
// ward. Nurses, doctors, consultants and admins may transfer. The previous
// ward's stay is closed (billing it up to now) and a new stay opened, so each
// ward is billed for the days actually spent there.
router.post("/api/admissions/:id/transfer", async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const id = String(req.params.id);
    const { ward_id, bed_number, performed_by, reason } = req.body;
    if (!ward_id) {
      res.status(400).json({ error: true, message: "The destination ward is required" });
      return;
    }

    const adm = await pool.query(
      `SELECT a.*, w.name AS ward_name FROM admissions a
        JOIN wards w ON w.id = a.ward_id
       WHERE a.id = $1 AND a.status = 'active' AND a.tenant_id = $2`,
      [id, tenantId]
    );
    if (adm.rows.length === 0) {
      res.status(404).json({ error: true, message: "Active admission not found" });
      return;
    }
    const admission = adm.rows[0];
    if (admission.ward_id === ward_id) {
      res.status(409).json({ error: true, message: "Patient is already in this ward" });
      return;
    }

    const ward = await pool.query("SELECT id, name FROM wards WHERE id = $1 AND tenant_id = $2", [ward_id, tenantId]);
    if (ward.rows.length === 0) {
      res.status(404).json({ error: true, message: "Destination ward not found" });
      return;
    }

    // Only clinical staff may move a patient between wards.
    if (!performed_by) {
      res.status(400).json({ error: true, message: "The staff member performing the transfer is required" });
      return;
    }
    const staff = await pool.query(
      "SELECT role FROM staff_users WHERE id = $1 AND tenant_id = $2 AND status = 'active'",
      [performed_by, tenantId]
    );
    const transferRoles = ["Nurse", "Doctor", "Specialist", "Admin"];
    if (staff.rows.length === 0 || !transferRoles.includes(staff.rows[0].role)) {
      res.status(403).json({ error: true, message: "Only nurses, doctors, consultants and administrators can transfer a patient" });
      return;
    }

    if (bed_number) {
      const dup = await pool.query(
        "SELECT id FROM admissions WHERE ward_id = $1 AND bed_number = $2 AND status = 'active' AND id != $3 AND tenant_id = $4",
        [ward_id, bed_number, id, tenantId]
      );
      if (dup.rows.length > 0) {
        res.status(409).json({ error: true, message: "Bed already assigned to another patient in this ward" });
        return;
      }
    }

    const now = new Date();
    // Bill the departing ward up to the transfer moment before closing it.
    try { await accrueBedCharges(tenantId, id, now); } catch {}

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const openStays = await client.query(
        "SELECT id FROM admission_ward_stays WHERE admission_id = $1 AND ended_at IS NULL",
        [id]
      );
      if (openStays.rows.length === 0) {
        // Legacy admission with no stay recorded: backfill a closed segment so
        // the episode is never left without ward history.
        await client.query(
          `INSERT INTO admission_ward_stays (tenant_id, admission_id, ward_id, bed_number, started_at, ended_at)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [tenantId, id, admission.ward_id, admission.bed_number, admission.admitted_at, now]
        );
      } else {
        await client.query(
          "UPDATE admission_ward_stays SET ended_at = $1 WHERE admission_id = $2 AND ended_at IS NULL",
          [now, id]
        );
      }

      await client.query(
        `INSERT INTO admission_ward_stays (tenant_id, admission_id, ward_id, bed_number, started_at, transferred_by, reason)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [tenantId, id, ward_id, bed_number || null, now, performed_by, reason || null]
      );

      const updated = await client.query(
        "UPDATE admissions SET ward_id = $1, bed_number = $2 WHERE id = $3 AND tenant_id = $4 RETURNING *",
        [ward_id, bed_number || null, id, tenantId]
      );

      await client.query(
        `INSERT INTO audit_logs (tenant_id, action, table_name, record_id, performed_by, old_data, new_data)
         VALUES ($1, 'UPDATE', 'admissions', $2, $3, $4, $5)`,
        [tenantId, id, performed_by, JSON.stringify(admission), JSON.stringify(updated.rows[0])]
      );

      await client.query("COMMIT");
      res.json({ ...updated.rows[0], ward_name: ward.rows[0].name, previous_ward_name: admission.ward_name });
    } catch (txErr) {
      try { await client.query("ROLLBACK"); } catch {}
      throw txErr;
    } finally {
      client.release();
    }
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.get("/api/beds", async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const { ward_id } = req.query;
    let query = "SELECT b.*, CASE WHEN a.id IS NOT NULL THEN true ELSE false END as occupied FROM beds b LEFT JOIN admissions a ON a.bed_number = b.bed_number AND a.ward_id = b.ward_id AND a.status = $1 AND a.tenant_id = $2 WHERE b.tenant_id = $2";
    const params: any[] = ["active", tenantId];
    if (ward_id) { query += " AND b.ward_id = $3"; params.push(ward_id); }
    query += " ORDER BY b.bed_number";
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err: any) { res.status(500).json({ error: true, message: err.message }); }
});

router.post("/api/beds", async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    if (!isAdminRequest(req)) { res.status(403).json({ error: true, message: "Only administrators can add beds" }); return; }
    const { ward_id, bed_number, daily_rate } = req.body;
    if (!ward_id || !bed_number) { res.status(400).json({ error: true, message: "ward_id and bed_number are required" }); return; }
    const rate = daily_rate === undefined || daily_rate === null || daily_rate === '' ? null : parseFloat(String(daily_rate));
    if (rate !== null && (isNaN(rate) || rate < 0)) { res.status(400).json({ error: true, message: "Bed price must be a non-negative number" }); return; }
    const id = uuidv4();
    const result = await pool.query(
      "INSERT INTO beds (id, tenant_id, ward_id, bed_number, daily_rate) VALUES ($1, $2, $3, $4, $5) RETURNING *",
      [id, tenantId, ward_id, bed_number, rate]
    );
    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    if (err.code === "23505") { res.status(409).json({ error: true, message: "Bed already exists in this ward" }); return; }
    res.status(500).json({ error: true, message: err.message });
  }
});

// PUT /api/beds/:id -- rename a bed or set/clear its nightly price override.
router.put("/api/beds/:id", async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    if (!isAdminRequest(req)) { res.status(403).json({ error: true, message: "Only administrators can update beds" }); return; }
    const bedId = String(req.params.id);
    const existing = await pool.query("SELECT * FROM beds WHERE id = $1 AND tenant_id = $2", [bedId, tenantId]);
    if (existing.rows.length === 0) { res.status(404).json({ error: true, message: "Bed not found" }); return; }
    const { bed_number, daily_rate } = req.body;
    const rate = daily_rate === undefined ? undefined : (daily_rate === null || daily_rate === '' ? null : parseFloat(String(daily_rate)));
    if (rate !== undefined && rate !== null && (isNaN(rate) || rate < 0)) { res.status(400).json({ error: true, message: "Bed price must be a non-negative number" }); return; }
    const result = await pool.query(
      `UPDATE beds SET bed_number = COALESCE($1, bed_number),
                       daily_rate = CASE WHEN $2::boolean THEN $3::numeric ELSE daily_rate END
        WHERE id = $4 AND tenant_id = $5 RETURNING *`,
      [bed_number || null, rate !== undefined, rate ?? null, bedId, tenantId]
    );
    res.json(result.rows[0]);
  } catch (err: any) {
    if (err.code === "23505") { res.status(409).json({ error: true, message: "Bed already exists in this ward" }); return; }
    res.status(500).json({ error: true, message: err.message });
  }
});

router.delete('/api/beds/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    if (!isAdminRequest(req)) { res.status(403).json({ error: true, message: "Only administrators can remove beds" }); return; }
    const { id } = req.params;
    const bed = await pool.query('SELECT * FROM beds WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
    if (bed.rows.length === 0) {
      res.status(404).json({ error: true, message: 'Bed not found' });
      return;
    }
    const occupied = await pool.query(
      "SELECT id FROM admissions WHERE tenant_id = $1 AND ward_id = $2 AND bed_number = $3 AND status = 'active' LIMIT 1",
      [tenantId, bed.rows[0].ward_id, bed.rows[0].bed_number]
    );
    if (occupied.rows.length > 0) {
      res.status(409).json({ error: true, message: 'This bed is currently occupied. Transfer or discharge the patient first.' });
      return;
    }
    await pool.query('DELETE FROM beds WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
    res.json({ success: true, bed: bed.rows[0] });
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

export default router;
