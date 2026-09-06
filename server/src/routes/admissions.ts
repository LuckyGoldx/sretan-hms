import { Router, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import pool from "../db/pool";
import { readClinicProfile } from "../config/reader";
import { accrueBedCharges } from "../utils/admissionBilling";

const router = Router();

function getTenantId(): string {
  return readClinicProfile().GLOBAL_SAAS_TENANT_ID;
}

router.get("/api/wards", async (_req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const result = await pool.query(
      `SELECT w.*,
              (SELECT i.price FROM inventory_items i
               WHERE i.ward_id = w.id AND i.service_key = 'BED_DAY' AND i.is_active = true
               ORDER BY i.created_at DESC LIMIT 1) as bed_rate
       FROM wards w WHERE w.tenant_id = $1 ORDER BY w.name`,
      [tenantId]
    );
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

function isAdminRequest(req: Request): boolean {
  const role = String(req.headers["x-user-role"] || "");
  return role === "" || role === "Admin";
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
    const wardId = uuidv4();
    const itemId = uuidv4();
    const rate = parseFloat(price);
    if (isNaN(rate) || rate < 0) {
      res.status(400).json({ error: true, message: "Bed price per night must be a non-negative number" });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO wards (id, tenant_id, name, code, description)
         VALUES ($1, $2, $3, $4, $5)`,
        [wardId, tenantId, cleanName, code || null, description || null]
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
      ward: { id: wardId, name: cleanName, code: code || null, description: description || null },
      item: { id: itemId, name: `${cleanName} Admission (Per Night)`, price: rate, service_key: 'BED_DAY' },
    });
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// PUT /api/wards/:id -- update a ward's bed price per night by updating its
// LINKED inventory item (single source of truth). Names remain freely editable.
router.put("/api/wards/:id", async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    if (!isAdminRequest(req)) {
      res.status(403).json({ error: true, message: "Only administrators can update ward bed rates" });
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

    const rate = req.body.price !== undefined ? parseFloat(req.body.price) : NaN;
    if (isNaN(rate) || rate < 0) {
      res.status(400).json({ error: true, message: "Bed price per night must be a non-negative number" });
      return;
    }

    // Update the linked bed item (create it first if it is somehow missing).
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

    const result = await pool.query(
      "UPDATE wards SET code = COALESCE($1, code), description = COALESCE($2, description) WHERE id = $3 RETURNING *",
      [req.body.code || null, req.body.description || null, wardId]
    );
    const newWard = result.rows[0];
    await pool.query(
      `INSERT INTO audit_logs (tenant_id, action, table_name, record_id, performed_by, old_data, new_data)
       VALUES ($1, 'UPDATE', 'wards', $2, $3, $4, $5)`,
      [tenantId, wardId, req.body.performed_by || null, JSON.stringify(oldWard), JSON.stringify(newWard)]
    );
    res.json({ ...newWard, bed_rate: rate });
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.get("/api/admissions", async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    try { await accrueBedCharges(tenantId); } catch {}
    const { patient_id, status } = req.query;
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
    const result = await pool.query(
      `INSERT INTO admissions (id, tenant_id, patient_id, ward_id, notes, admitted_by, admitted_at) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [id, tenantId, patient_id, ward_id, notes || null, admitted_by, admittedAt]
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

router.put("/api/admissions/:id/discharge", async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const id = String(req.params.id);
    const { discharged_by, discharge_summary, discharge_instructions } = req.body;

    // Capture the final (possibly partial) bed day before closing the admission.
    const dischargeTime = new Date();
    try { await accrueBedCharges(tenantId, id, dischargeTime); } catch {}

    const result = await pool.query(
      `UPDATE admissions SET status = 'discharged', discharged_at = $1, discharged_by = COALESCE($2, discharged_by),
         discharge_summary = COALESCE($5, discharge_summary), discharge_instructions = COALESCE($6, discharge_instructions)
       WHERE id = $3 AND status = 'active' AND tenant_id = $4 RETURNING *`,
      [dischargeTime, discharged_by || null, id, tenantId, discharge_summary || null, discharge_instructions || null]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: true, message: "Active admission not found" });
      return;
    }

    // Audit log
    const oldAdm = await pool.query('SELECT * FROM admissions WHERE id = $1', [id]);
    if (oldAdm.rows.length > 0) {
      await pool.query(
        `INSERT INTO audit_logs (tenant_id, action, table_name, record_id, performed_by, old_data, new_data)
         VALUES ($1, 'UPDATE', 'admissions', $2, $3, $4, $5)`,
        [oldAdm.rows[0].tenant_id, id, discharged_by || null, JSON.stringify(oldAdm.rows[0]), JSON.stringify(result.rows[0])]
      );
    }

    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.get("/api/admissions/active", async (_req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    try { await accrueBedCharges(tenantId); } catch {}
    const result = await pool.query(
      `SELECT a.*, w.name as ward_name, p.full_name as patient_name, p.hospital_number,
              s.name as admitted_by_name, sd.name as discharged_by_name
       FROM admissions a
       JOIN wards w ON w.id = a.ward_id
       JOIN patients p ON p.id = a.patient_id
       LEFT JOIN staff_users s ON s.id = a.admitted_by
       LEFT JOIN staff_users sd ON sd.id = a.discharged_by
        WHERE a.status = 'active' AND a.tenant_id = $1 AND p.folder_activated IS DISTINCT FROM false ORDER BY a.admitted_at DESC`,
      [tenantId]
    );
    res.json(result.rows);
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
    res.json(result.rows[0]);
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
    const { ward_id, bed_number } = req.body;
    if (!ward_id || !bed_number) { res.status(400).json({ error: true, message: "ward_id and bed_number are required" }); return; }
    const id = uuidv4();
    const result = await pool.query("INSERT INTO beds (id, tenant_id, ward_id, bed_number) VALUES ($1, $2, $3, $4) RETURNING *", [id, tenantId, ward_id, bed_number]);
    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    if (err.code === "23505") { res.status(409).json({ error: true, message: "Bed already exists in this ward" }); return; }
    res.status(500).json({ error: true, message: err.message });
  }
});



router.delete('/api/beds/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const { id } = req.params;
    const result = await pool.query('DELETE FROM beds WHERE id = $1 AND tenant_id = $2 RETURNING *', [id, tenantId]);
    if (result.rows.length === 0) {
      res.status(404).json({ error: true, message: 'Bed not found' });
      return;
    }
    res.json({ success: true, bed: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

export default router;
