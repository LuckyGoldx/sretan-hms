import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import pool from '../db/pool';
import { readClinicProfile } from '../config/reader';
import { generateNumber } from '../utils/numbering';
import { clockGuard } from '../middleware/clockGuard';

const router = Router();

function getTenantId(): string {
  return readClinicProfile().GLOBAL_SAAS_TENANT_ID;
}

const VALID_PRIORITIES = ['routine', 'urgent', 'emergency'];

/**
 * Default specialist/consultant fee from inventory (category 'general'):
 *   "Specialist Consultation" — falls back to 0 if not configured.
 */
async function getDefaultConsultantFee(): Promise<number> {
  try {
    const res = await pool.query(
      `SELECT price FROM inventory_items
       WHERE drug_name ILIKE '%Specialist Consultation%' AND category = 'general' AND is_active = true
       ORDER BY created_at DESC LIMIT 1`
    );
    if (res.rows.length > 0) return parseFloat(res.rows[0].price) || 0;
  } catch {}
  return 0;
}

// GET /api/referrals/consultant-fees -- configured specialist fee (for the refer UI).
router.get('/api/referrals/consultant-fees', async (_req: Request, res: Response) => {
  try {
    res.json({ specialist_consultation: await getDefaultConsultantFee() });
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

async function createNotification(params: {
  tenantId: string;
  recipientId: string;
  type: string;
  title: string;
  message?: string;
  refTable?: string;
  refId?: string;
  patientId?: string;
}) {
  try {
    await pool.query(
      `INSERT INTO notifications (tenant_id, recipient_id, type, title, message, ref_table, ref_id, patient_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [params.tenantId, params.recipientId, params.type, params.title, params.message || null, params.refTable || null, params.refId || null, params.patientId || null]
    );
  } catch {}
}

async function notifyReferralAction(referralRow: any, tenantId: string, action: 'accepted' | 'completed' | 'rejected' | 'cancelled', performedByName?: string) {
  if (!referralRow?.referred_by) return;
  const patientName = referralRow.patient_name || 'the patient';
  const deptName = referralRow.to_department_name || 'the department';
  const actorName = performedByName || 'A consultant';

  const titles: Record<string, string> = {
    accepted: 'Referral accepted',
    completed: 'Consultation completed',
    rejected: 'Referral rejected',
    cancelled: 'Referral cancelled',
  };
  const messages: Record<string, string> = {
    accepted: `${actorName} accepted your referral of ${patientName} to ${deptName}.`,
    completed: `${actorName} completed the consultation for ${patientName} (${deptName}).`,
    rejected: `${actorName} rejected the referral of ${patientName} to ${deptName}.`,
    cancelled: `Your referral of ${patientName} was cancelled.`,
  };

  await createNotification({
    tenantId,
    recipientId: referralRow.referred_by,
    type: `referral_${action}`,
    title: titles[action],
    message: messages[action],
    refTable: 'referrals',
    refId: referralRow.id,
    patientId: referralRow.patient_id,
  });
}

// ------------------------------------------------------------
// DEPARTMENTS
// ------------------------------------------------------------

// GET /api/departments -- list with consultant counts
router.get('/api/departments', async (_req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const result = await pool.query(
      `SELECT d.*,
              (SELECT COUNT(*)::int FROM staff_users su
               WHERE su.department_id = d.id AND su.role = 'Consultant' AND su.status = 'active') as consultant_count,
              (SELECT COUNT(*)::int FROM staff_users su
               WHERE su.department_id = d.id AND su.role = 'Consultant' AND su.status = 'active') as active_consultants
       FROM departments d
       WHERE d.tenant_id = $1
       ORDER BY d.name`,
      [tenantId]
    );
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// GET /api/departments/with-consultants -- powers the referral modal quick picks.
// Returns departments with at least one active clinical staff member (Doctor OR Consultant),
// because both doctors and consultants in a department receive referrals.
// Staff are de-duplicated by email (one account per person) to avoid leftover duplicate accounts.
router.get('/api/departments/with-consultants', async (_req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const result = await pool.query(
      `SELECT d.id, d.name, d.code, d.description, d.modules,
              (SELECT COUNT(*)::int FROM (
                 SELECT DISTINCT ON (LOWER(su.email)) su.id
                 FROM staff_users su
                 WHERE su.department_id = d.id AND su.role IN ('Consultant','Doctor') AND su.status = 'active'
                 ORDER BY LOWER(su.email), su.created_at
               ) t) as staff_count,
              (SELECT COUNT(*)::int FROM (
                 SELECT DISTINCT ON (LOWER(su.email)) su.id
                 FROM staff_users su
                 WHERE su.department_id = d.id AND su.role = 'Consultant' AND su.status = 'active'
                 ORDER BY LOWER(su.email), su.created_at
               ) t) as consultant_count,
              (SELECT COUNT(*)::int FROM (
                 SELECT DISTINCT ON (LOWER(su.email)) su.id
                 FROM staff_users su
                 WHERE su.department_id = d.id AND su.role = 'Doctor' AND su.status = 'active'
                 ORDER BY LOWER(su.email), su.created_at
               ) t) as doctor_count,
              COALESCE((
                SELECT json_agg(sub.x ORDER BY sub._sort_role, sub._sort_name)
                FROM (
                  SELECT DISTINCT ON (LOWER(su.email))
                    json_build_object(
                      'id', su.id, 'name', su.name, 'email', su.email, 'role', su.role, 'department_id', su.department_id
                    ) AS x,
                    CASE su.role WHEN 'Consultant' THEN 0 ELSE 1 END AS _sort_role,
                    su.name AS _sort_name
                  FROM staff_users su
                  WHERE su.department_id = d.id AND su.role IN ('Consultant','Doctor') AND su.status = 'active'
                  ORDER BY LOWER(su.email), su.created_at
                ) sub
              ), '[]'::json) as consultants
       FROM departments d
       WHERE d.tenant_id = $1 AND d.status = 'active'
         AND EXISTS (
           SELECT 1 FROM staff_users su
           WHERE su.department_id = d.id AND su.role IN ('Consultant','Doctor') AND su.status = 'active'
         )
       ORDER BY d.name`,
      [tenantId]
    );
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// POST /api/departments -- create (Admin)
router.post('/api/departments', async (req: Request, res: Response) => {
  try {
    await clockGuard(pool, 'departments');
    const tenantId = getTenantId();
    const { name, code, description, modules } = req.body;

    if (!name) {
      res.status(400).json({ error: true, message: 'Department name is required' });
      return;
    }

    const dup = await pool.query(
      `SELECT id FROM departments WHERE tenant_id = $1 AND LOWER(name) = LOWER($2)`,
      [tenantId, name]
    );
    if (dup.rows.length > 0) {
      res.status(409).json({ error: true, message: 'A department with this name already exists' });
      return;
    }

    const id = uuidv4();
    const result = await pool.query(
      `INSERT INTO departments (id, tenant_id, name, code, description, modules)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [id, tenantId, name, code || null, description || null, modules ? JSON.stringify(modules) : '[]']
    );

    await pool.query(
      `INSERT INTO audit_logs (tenant_id, action, table_name, record_id, performed_by, new_data)
       VALUES ($1, 'INSERT', 'departments', $2, $3, $4)`,
      [tenantId, id, req.body.performed_by || null, JSON.stringify(result.rows[0])]
    );

    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// PUT /api/departments/:id -- update (Admin)
router.put('/api/departments/:id', async (req: Request, res: Response) => {
  try {
    await clockGuard(pool, 'departments');
    const tenantId = getTenantId();
    const { id } = req.params;
    const { name, code, description, modules, status } = req.body;

    const result = await pool.query(
      `UPDATE departments SET
        name = COALESCE($1, name),
        code = COALESCE($2, code),
        description = COALESCE($3, description),
        modules = CASE WHEN $4 IS NULL THEN modules ELSE $4::jsonb END,
        status = COALESCE($5, status)
       WHERE id = $6 AND tenant_id = $7
       RETURNING *`,
      [name || null, code || null, description || null, modules ? JSON.stringify(modules) : null, status || null, id, tenantId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: true, message: 'Department not found' });
      return;
    }

    const oldDept = await pool.query('SELECT * FROM departments WHERE id = $1', [id]);
    if (oldDept.rows.length > 0) {
      await pool.query(
        `INSERT INTO audit_logs (tenant_id, action, table_name, record_id, performed_by, old_data, new_data)
         VALUES ($1, 'UPDATE', 'departments', $2, $3, $4, $5)`,
        [tenantId, id, req.body.performed_by || null, JSON.stringify(oldDept.rows[0]), JSON.stringify(result.rows[0])]
      );
    }

    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// DELETE /api/departments/:id -- soft-deactivate (Admin)
router.delete('/api/departments/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const { id } = req.params;

    const result = await pool.query(
      `UPDATE departments SET status = 'inactive' WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [id, tenantId]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: true, message: 'Department not found' });
      return;
    }
    res.json({ message: 'Department deactivated', department: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// ------------------------------------------------------------
// REFERRALS
// ------------------------------------------------------------

// GET /api/referrals -- list with filters
router.get('/api/referrals', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const { status, patient_id, referred_by, to_department_id, consultant_id } = req.query;

    let query = `SELECT r.*,
        p.full_name as patient_name, p.hospital_number, p.sex, p.dob, p.phone, p.status as patient_status,
        rb.name as referred_by_name,
        ab.name as accepted_by_name,
        cb.name as completed_by_name,
        d_from.name as from_department_name,
        d_to.name as to_department_name,
        tc.name as to_consultant_name
      FROM referrals r
      JOIN patients p ON p.id = r.patient_id
      LEFT JOIN staff_users rb ON rb.id = r.referred_by
      LEFT JOIN staff_users ab ON ab.id = r.accepted_by
      LEFT JOIN staff_users cb ON cb.id = r.completed_by
      LEFT JOIN departments d_from ON d_from.id = r.from_department_id
      LEFT JOIN departments d_to ON d_to.id = r.to_department_id
      LEFT JOIN staff_users tc ON tc.id = r.to_consultant_id
      WHERE r.tenant_id = $1`;
    const params: any[] = [tenantId];
    let idx = 2;

    if (status) { query += ` AND r.status = $${idx}`; params.push(status); idx++; }
    if (patient_id) { query += ` AND r.patient_id = $${idx}`; params.push(patient_id); idx++; }
    if (referred_by) { query += ` AND r.referred_by = $${idx}`; params.push(referred_by); idx++; }
    if (to_department_id) { query += ` AND r.to_department_id = $${idx}`; params.push(to_department_id); idx++; }
    if (consultant_id) { query += ` AND r.to_consultant_id = $${idx}`; params.push(consultant_id); idx++; }

    query += ' ORDER BY r.created_at DESC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// GET /api/referrals/stats -- referral counts (filtered by referrer or all for Admin)
router.get('/api/referrals/stats', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const referredBy = String(req.query.referred_by || '');
    const whereClause = referredBy ? ' AND r.referred_by = $2' : '';
    const params: any[] = [tenantId];
    if (referredBy) params.push(referredBy);

    const result = await pool.query(
      `SELECT
        COUNT(*) FILTER (WHERE r.status = 'pending')::int as pending,
        COUNT(*) FILTER (WHERE r.status = 'accepted')::int as accepted,
        COUNT(*) FILTER (WHERE r.status = 'in_consultation')::int as in_consultation,
        COUNT(*) FILTER (WHERE r.status = 'completed')::int as completed,
        COUNT(*) FILTER (WHERE r.status = 'rejected')::int as rejected,
        COUNT(*) FILTER (WHERE r.status = 'cancelled')::int as cancelled,
        COUNT(*)::int as total,
        COUNT(*) FILTER (WHERE r.status IN ('pending','accepted','in_consultation') AND r.priority = 'emergency')::int as emergency_pending
       FROM referrals r
       WHERE r.tenant_id = $1${whereClause}`,
      params
    );
    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// GET /api/referrals/dashboard -- referral list for a referrer (doctor's progress view)
router.get('/api/referrals/dashboard', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const referredBy = String(req.query.referred_by || '');
    const status = req.query.status ? String(req.query.status) : '';
    const search = req.query.search ? String(req.query.search) : '';

    let query = `SELECT r.*,
        p.full_name as patient_name, p.hospital_number, p.sex, p.phone,
        rb.name as referred_by_name,
        ab.name as accepted_by_name, cb.name as completed_by_name,
        d_from.name as from_department_name,
        d_to.name as to_department_name,
        tc.name as to_consultant_name
      FROM referrals r
      JOIN patients p ON p.id = r.patient_id
      LEFT JOIN staff_users rb ON rb.id = r.referred_by
      LEFT JOIN staff_users ab ON ab.id = r.accepted_by
      LEFT JOIN staff_users cb ON cb.id = r.completed_by
      LEFT JOIN departments d_from ON d_from.id = r.from_department_id
      LEFT JOIN departments d_to ON d_to.id = r.to_department_id
      LEFT JOIN staff_users tc ON tc.id = r.to_consultant_id
      WHERE r.tenant_id = $1`;
    const params: any[] = [tenantId];
    let idx = 2;

    if (referredBy) { query += ` AND r.referred_by = $${idx}`; params.push(referredBy); idx++; }
    if (status) { query += ` AND r.status = $${idx}`; params.push(status); idx++; }
    if (search) {
      query += ` AND (p.full_name ILIKE $${idx} OR p.hospital_number ILIKE $${idx} OR r.referral_number ILIKE $${idx} OR d_to.name ILIKE $${idx})`;
      params.push(`%${search}%`);
      idx++;
    }

    query += ' ORDER BY r.created_at DESC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// GET /api/referrals/:id/consultation-report -- full consultant work for a referral
router.get('/api/referrals/:id/consultation-report', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const id = String(req.params.id);

    const refRes = await pool.query(
      `SELECT r.*,
        p.full_name as patient_name, p.hospital_number, p.sex, p.dob, p.phone,
        rb.name as referred_by_name,
        ab.name as accepted_by_name,
        cb.name as completed_by_name,
        d_from.name as from_department_name,
        d_to.name as to_department_name,
        tc.name as to_consultant_name
      FROM referrals r
      JOIN patients p ON p.id = r.patient_id
      LEFT JOIN staff_users rb ON rb.id = r.referred_by
      LEFT JOIN staff_users ab ON ab.id = r.accepted_by
      LEFT JOIN staff_users cb ON cb.id = r.completed_by
      LEFT JOIN departments d_from ON d_from.id = r.from_department_id
      LEFT JOIN departments d_to ON d_to.id = r.to_department_id
      LEFT JOIN staff_users tc ON tc.id = r.to_consultant_id
      WHERE r.id = $1 AND r.tenant_id = $2`,
      [id, tenantId]
    );
    if (refRes.rows.length === 0) {
      res.status(404).json({ error: true, message: 'Referral not found' });
      return;
    }

    // Consultant encounters for this referral
    const encRes = await pool.query(
      `SELECT e.*, d.name as department_name, s.name as staff_name, s.role as staff_role
       FROM encounters e
       LEFT JOIN departments d ON d.id = e.department_id
       LEFT JOIN staff_users s ON s.id = e.staff_id
       WHERE e.tenant_id = $1 AND e.referral_id = $2 AND e.is_consultation = true
       ORDER BY e.created_at ASC`,
      [tenantId, id]
    );
    const encIds = encRes.rows.map((e: any) => e.id);

    // Attach SOAP notes to each encounter
    const notesByEnc: Record<string, any[]> = {};
    if (encIds.length > 0) {
      const notesResult = await pool.query(
        `SELECT n.*, s.name as staff_name, s.role as staff_role
         FROM encounter_notes n
         LEFT JOIN staff_users s ON s.id = n.staff_id
         WHERE n.tenant_id = $1 AND n.encounter_id = ANY($2::uuid[])
         ORDER BY n.created_at ASC`,
        [tenantId, encIds]
      );
      for (const n of notesResult.rows) {
        if (!notesByEnc[n.encounter_id]) notesByEnc[n.encounter_id] = [];
        notesByEnc[n.encounter_id].push(n);
      }
    }
    const encountersWithNotes = encRes.rows.map((e: any) => ({ ...e, notes: notesByEnc[e.id] || [] }));

    const labOrders: any[] = [];
    const radOrders: any[] = [];
    const prescriptions: any[] = [];
    for (const encId of encIds) {
      const [lab, rad, rx] = await Promise.all([
        pool.query(`SELECT * FROM lab_orders WHERE tenant_id = $1 AND encounter_id = $2 ORDER BY created_at ASC`, [tenantId, encId]),
        pool.query(`SELECT * FROM radiology_orders WHERE tenant_id = $1 AND encounter_id = $2 ORDER BY created_at ASC`, [tenantId, encId]),
        pool.query(`SELECT * FROM prescriptions WHERE tenant_id = $1 AND encounter_id = $2 ORDER BY created_at ASC`, [tenantId, encId]),
      ]);
      labOrders.push(...lab.rows);
      radOrders.push(...rad.rows);
      prescriptions.push(...rx.rows);
    }

    res.json({
      referral: refRes.rows[0],
      encounters: encountersWithNotes,
      lab_orders: labOrders,
      radiology_orders: radOrders,
      prescriptions,
    });
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// GET /api/referrals/:id -- single referral
router.get('/api/referrals/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const { id } = req.params;
    const result = await pool.query(
      `SELECT r.*,
        p.full_name as patient_name, p.hospital_number, p.sex, p.dob, p.phone,
        rb.name as referred_by_name,
        ab.name as accepted_by_name,
        cb.name as completed_by_name,
        d_from.name as from_department_name,
        d_to.name as to_department_name,
        tc.name as to_consultant_name
      FROM referrals r
      JOIN patients p ON p.id = r.patient_id
      LEFT JOIN staff_users rb ON rb.id = r.referred_by
      LEFT JOIN staff_users ab ON ab.id = r.accepted_by
      LEFT JOIN staff_users cb ON cb.id = r.completed_by
      LEFT JOIN departments d_from ON d_from.id = r.from_department_id
      LEFT JOIN departments d_to ON d_to.id = r.to_department_id
      LEFT JOIN staff_users tc ON tc.id = r.to_consultant_id
      WHERE r.id = $1 AND r.tenant_id = $2`,
      [id, tenantId]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: true, message: 'Referral not found' });
      return;
    }
    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// POST /api/referrals -- create referral (GP transfers patient to department)
router.post('/api/referrals', async (req: Request, res: Response) => {
  try {
    await clockGuard(pool, 'referrals');
    const tenantId = getTenantId();
    const { patient_id, referred_by, from_department_id, to_department_id, to_consultant_id, reason, priority, referral_notes } = req.body;

    if (!patient_id || !to_department_id) {
      res.status(400).json({ error: true, message: 'patient_id and to_department_id are required' });
      return;
    }
    if (to_consultant_id && referred_by && String(to_consultant_id) === String(referred_by)) {
      res.status(400).json({ error: true, message: 'You cannot refer a patient to yourself' });
      return;
    }
    if (!VALID_PRIORITIES.includes(priority || 'routine')) {
      res.status(400).json({ error: true, message: `priority must be one of: ${VALID_PRIORITIES.join(', ')}` });
      return;
    }
    if (reason && reason.length > 2000) {
      res.status(400).json({ error: true, message: 'Referral reason must be 2000 characters or fewer' });
      return;
    }

    // Block duplicate active referrals to the same department.
    const activeRefs = await pool.query(
      `SELECT id, to_consultant_id FROM referrals
       WHERE tenant_id = $1 AND patient_id = $2 AND to_department_id = $3
         AND status IN ('pending', 'accepted', 'in_consultation')`,
      [tenantId, patient_id, to_department_id]
    );
    const activeRows = activeRefs.rows;
    const hasActiveDeptLevel = activeRows.some((r: any) => r.to_consultant_id === null);
    const sameConsultant = to_consultant_id ? activeRows.some((r: any) => String(r.to_consultant_id) === String(to_consultant_id)) : false;

    if (!to_consultant_id) {
      // New department-level ("any") referral: blocked while a department-level referral
      // is already active to this department — no further referrals until it is rejected
      // or the consultation is completed.
      if (hasActiveDeptLevel) {
        res.status(409).json({ error: true, message: 'This patient already has an active referral to this department. Reject it or complete the consultation before referring again.' });
        return;
      }
    } else {
      // New consultant-specific referral: a department-level active referral blocks ALL
      // further referrals to the department, and the same consultant must not receive
      // the patient twice.
      if (hasActiveDeptLevel) {
        res.status(409).json({ error: true, message: 'This patient already has an active department referral to this department. Reject it or complete the consultation before referring again.' });
        return;
      }
      if (sameConsultant) {
        res.status(409).json({ error: true, message: 'This patient already has an active referral to that consultant' });
        return;
      }
    }

    // If to_consultant_id provided, verify they belong to the target department
    // (Doctor or Consultant — both can receive referrals)
    if (to_consultant_id) {
      const cons = await pool.query(
        `SELECT id FROM staff_users WHERE id = $1 AND role IN ('Consultant','Doctor') AND department_id = $2 AND status = 'active'`,
        [to_consultant_id, to_department_id]
      );
      if (cons.rows.length === 0) {
        res.status(400).json({ error: true, message: 'Selected staff member does not belong to the target department' });
        return;
      }
    }

    // Generate referral number from the tenant pattern
    const referralNumber = await generateNumber(getTenantId(), 'referral', { prefix: 'REF' });

    const id = uuidv4();
    // Raise the specialist/consultant fee (default from inventory) on the referral so
    // paypoint can collect it before the consultant attends (emergencies excepted).
    const consultantFee = req.body.consultant_fee !== undefined && req.body.consultant_fee !== null && req.body.consultant_fee !== ''
      ? Math.max(0, parseFloat(req.body.consultant_fee))
      : await getDefaultConsultantFee();
    const result = await pool.query(
      `INSERT INTO referrals (id, tenant_id, referral_number, patient_id, referred_by, from_department_id, to_department_id, to_consultant_id, reason, priority, referral_notes, consultant_fee, consultant_fee_status, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'pending')
       RETURNING *`,
      [id, tenantId, referralNumber, patient_id, referred_by || null, from_department_id || null, to_department_id, to_consultant_id || null, reason || null, priority || 'routine', referral_notes || null, consultantFee, consultantFee > 0 ? 'pending' : 'waived']
    );

    await pool.query(
      `INSERT INTO audit_logs (tenant_id, action, table_name, record_id, performed_by, new_data)
       VALUES ($1, 'INSERT', 'referrals', $2, $3, $4)`,
      [tenantId, id, referred_by || null, JSON.stringify(result.rows[0])]
    );

    // Notify all active clinical staff (Doctors + Consultants) in the target department
    const deptStaff = await pool.query(
      `SELECT id FROM staff_users
       WHERE tenant_id = $1 AND department_id = $2 AND role IN ('Consultant','Doctor') AND status = 'active'`,
      [tenantId, to_department_id]
    );
    const patientInfo = await pool.query(
      `SELECT full_name FROM patients WHERE id = $1`,
      [patient_id]
    );
    const patientName = patientInfo.rows[0]?.full_name || 'a patient';
    const deptName = (await pool.query(`SELECT name FROM departments WHERE id = $1`, [to_department_id])).rows[0]?.name || 'the department';
    for (const s of deptStaff.rows) {
      await createNotification({
        tenantId,
        recipientId: s.id,
        type: 'referral_created',
        title: 'New referral received',
        message: `${patientName} has been referred to ${deptName}${reason ? ` — ${reason}` : ''}.`,
        refTable: 'referrals',
        refId: id,
        patientId: patient_id,
      });
    }

    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// PUT /api/referrals/:id/view -- mark a referral as viewed by a user
router.put('/api/referrals/:id/view', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const id = String(req.params.id);
    const userId = typeof req.body.user_id === 'string' ? req.body.user_id : '';
    if (!userId) {
      res.status(400).json({ error: true, message: 'user_id is required' });
      return;
    }
    await pool.query(
      `INSERT INTO referral_views (tenant_id, referral_id, user_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (referral_id, user_id) DO NOTHING`,
      [tenantId, id, userId]
    );
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// PUT /api/referrals/mark-all-viewed -- mark all completed referrals in the user's department as viewed
router.put('/api/referrals/mark-all-viewed', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const userId = typeof req.body.user_id === 'string' ? req.body.user_id : '';
    if (!userId) {
      res.status(400).json({ error: true, message: 'user_id is required' });
      return;
    }
    const departmentId = await resolveConsultantDepartment(userId, tenantId);
    if (!departmentId) {
      res.status(403).json({ error: true, message: 'Department not found or access denied' });
      return;
    }

    await pool.query(
      `INSERT INTO referral_views (tenant_id, referral_id, user_id)
       SELECT $1, r.id, $3
       FROM referrals r
       WHERE r.tenant_id = $1 AND r.to_department_id = $2 AND r.status = 'completed'
       ON CONFLICT (referral_id, user_id) DO NOTHING`,
      [tenantId, departmentId, userId]
    );
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// PUT /api/referrals/:id -- update metadata while pending
router.put('/api/referrals/:id', async (req: Request, res: Response) => {
  try {
    await clockGuard(pool, 'referrals');
    const tenantId = getTenantId();
    const { id } = req.params;
    const { to_department_id, to_consultant_id, reason, priority, referral_notes } = req.body;

    if (priority && !VALID_PRIORITIES.includes(priority)) {
      res.status(400).json({ error: true, message: `priority must be one of: ${VALID_PRIORITIES.join(', ')}` });
      return;
    }

    const existing = await pool.query(
      `SELECT status FROM referrals WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );
    if (existing.rows.length === 0) {
      res.status(404).json({ error: true, message: 'Referral not found' });
      return;
    }
    if (existing.rows[0].status !== 'pending') {
      res.status(400).json({ error: true, message: 'Only pending referrals can be edited' });
      return;
    }

    const result = await pool.query(
      `UPDATE referrals SET
        to_department_id = COALESCE($1, to_department_id),
        to_consultant_id = COALESCE($2, to_consultant_id),
        reason = COALESCE($3, reason),
        priority = COALESCE($4, priority),
        referral_notes = COALESCE($5, referral_notes)
       WHERE id = $6 AND tenant_id = $7
       RETURNING *`,
      [to_department_id || null, to_consultant_id || null, reason || null, priority || null, referral_notes || null, id, tenantId]
    );

    const oldRef = await pool.query('SELECT * FROM referrals WHERE id = $1', [id]);
    if (oldRef.rows.length > 0) {
      await pool.query(
        `INSERT INTO audit_logs (tenant_id, action, table_name, record_id, performed_by, old_data, new_data)
         VALUES ($1, 'UPDATE', 'referrals', $2, $3, $4, $5)`,
        [tenantId, id, req.body.performed_by || null, JSON.stringify(oldRef.rows[0]), JSON.stringify(result.rows[0])]
      );
    }

    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// Status transition helper
async function transitionReferral(id: string, tenantId: string, fromStatuses: string[], toStatus: string, performedBy: string | null, extra?: any): Promise<any | null> {
  const existing = await pool.query(
    `SELECT * FROM referrals WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId]
  );
  if (existing.rows.length === 0) return { notFound: true };
  if (!fromStatuses.includes(existing.rows[0].status)) {
    return { invalidTransition: true, current: existing.rows[0].status };
  }

  const sets: string[] = ['status = $1'];
  const params: any[] = [toStatus];

  if (toStatus === 'accepted' && performedBy) {
    sets.push('accepted_by = $' + (params.length + 1));
    params.push(performedBy);
  }
  if (toStatus === 'completed' && performedBy) {
    sets.push('completed_by = $' + (params.length + 1));
    params.push(performedBy);
  }
  if (extra) {
    for (const key of Object.keys(extra)) {
      if (extra[key] !== undefined) {
        sets.push(key + ' = $' + (params.length + 1));
        params.push(extra[key]);
      }
    }
  }

  const result = await pool.query(
    `UPDATE referrals SET ${sets.join(', ')} WHERE id = $${params.length + 1} AND tenant_id = $${params.length + 2} RETURNING *`,
    [...params, id, tenantId]
  );

  await pool.query(
    `INSERT INTO audit_logs (tenant_id, action, table_name, record_id, performed_by, old_data, new_data)
     VALUES ($1, 'UPDATE', 'referrals', $2, $3, $4, $5)`,
    [tenantId, id, performedBy || null, JSON.stringify(existing.rows[0]), JSON.stringify(result.rows[0])]
  );

  return { row: result.rows[0] };
}

// PUT /api/referrals/:id/accept
router.put('/api/referrals/:id/accept', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const id = String(req.params.id);
    const performedBy: string | null = typeof req.body.performed_by === 'string' ? req.body.performed_by : null;
    const out = await transitionReferral(id, tenantId, ['pending'], 'accepted', performedBy, { accepted_at: new Date().toISOString() });
    if (out.notFound) { res.status(404).json({ error: true, message: 'Referral not found' }); return; }
    if (out.invalidTransition) { res.status(400).json({ error: true, message: `Referral cannot be accepted from status '${out.current}'` }); return; }

    // Notify the referring GP
    const referrerRow = await pool.query(
      `SELECT r.id, r.referred_by, r.patient_id, r.reason,
              p.full_name as patient_name, d.name as to_department_name,
              ab.name as accepted_by_name
       FROM referrals r
       JOIN patients p ON p.id = r.patient_id
       LEFT JOIN departments d ON d.id = r.to_department_id
       LEFT JOIN staff_users ab ON ab.id = r.accepted_by
       WHERE r.id = $1 AND r.tenant_id = $2`,
      [id, tenantId]
    );
    if (referrerRow.rows.length > 0) {
      await notifyReferralAction(referrerRow.rows[0], tenantId, 'accepted', referrerRow.rows[0].accepted_by_name);
    }

    res.json(out.row);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// PUT /api/referrals/:id/start -- consultant starts seeing the patient
router.put('/api/referrals/:id/start', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const id = String(req.params.id);
    const performedBy: string | null = typeof req.body.performed_by === 'string' ? req.body.performed_by : null;
    const out = await transitionReferral(id, tenantId, ['pending', 'accepted'], 'in_consultation', performedBy);
    if (out.notFound) { res.status(404).json({ error: true, message: 'Referral not found' }); return; }
    if (out.invalidTransition) { res.status(400).json({ error: true, message: `Referral cannot be started from status '${out.current}'` }); return; }
    res.json(out.row);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// PUT /api/referrals/:id/complete
router.put('/api/referrals/:id/complete', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const id = String(req.params.id);
    const performedBy: string | null = typeof req.body.performed_by === 'string' ? req.body.performed_by : null;
    const outcomeNote = typeof req.body.outcome_note === 'string' && req.body.outcome_note.trim() ? req.body.outcome_note.trim() : null;
    const out = await transitionReferral(id, tenantId, ['pending', 'accepted', 'in_consultation'], 'completed', performedBy, { completed_at: new Date().toISOString(), outcome_note: outcomeNote });
    if (out.notFound) { res.status(404).json({ error: true, message: 'Referral not found' }); return; }
    if (out.invalidTransition) { res.status(400).json({ error: true, message: `Referral cannot be completed from status '${out.current}'` }); return; }

    // Notify the referring GP
    const referrerRow = await pool.query(
      `SELECT r.id, r.referred_by, r.patient_id, r.reason,
              p.full_name as patient_name, d.name as to_department_name,
              cb.name as completed_by_name
       FROM referrals r
       JOIN patients p ON p.id = r.patient_id
       LEFT JOIN departments d ON d.id = r.to_department_id
       LEFT JOIN staff_users cb ON cb.id = r.completed_by
       WHERE r.id = $1 AND r.tenant_id = $2`,
      [id, tenantId]
    );
    if (referrerRow.rows.length > 0) {
      await notifyReferralAction(referrerRow.rows[0], tenantId, 'completed', referrerRow.rows[0].completed_by_name);
    }

    res.json(out.row);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// PUT /api/referrals/:id/reject
router.put('/api/referrals/:id/reject', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const id = String(req.params.id);
    const performedBy: string | null = typeof req.body.performed_by === 'string' ? req.body.performed_by : null;
    const out = await transitionReferral(id, tenantId, ['pending', 'accepted'], 'rejected', performedBy, { referral_notes: req.body.referral_notes || null });
    if (out.notFound) { res.status(404).json({ error: true, message: 'Referral not found' }); return; }
    if (out.invalidTransition) { res.status(400).json({ error: true, message: `Referral cannot be rejected from status '${out.current}'` }); return; }

    const referrerRow = await pool.query(
      `SELECT r.id, r.referred_by, r.patient_id,
              p.full_name as patient_name, d.name as to_department_name,
              rb.name as rejected_by_name
       FROM referrals r
       JOIN patients p ON p.id = r.patient_id
       LEFT JOIN departments d ON d.id = r.to_department_id
       LEFT JOIN staff_users rb ON rb.id = r.accepted_by
       WHERE r.id = $1 AND r.tenant_id = $2`,
      [id, tenantId]
    );
    if (referrerRow.rows.length > 0) {
      await notifyReferralAction(referrerRow.rows[0], tenantId, 'rejected', performedBy ? 'A consultant' : undefined);
    }

    res.json(out.row);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// PUT /api/referrals/:id/cancel
router.put('/api/referrals/:id/cancel', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const id = String(req.params.id);
    const performedBy: string | null = typeof req.body.performed_by === 'string' ? req.body.performed_by : null;
    const out = await transitionReferral(id, tenantId, ['pending'], 'cancelled', performedBy);
    if (out.notFound) { res.status(404).json({ error: true, message: 'Referral not found' }); return; }
    if (out.invalidTransition) { res.status(400).json({ error: true, message: `Referral cannot be cancelled from status '${out.current}'` }); return; }

    const referrerRow = await pool.query(
      `SELECT r.id, r.referred_by, r.patient_id,
              p.full_name as patient_name, d.name as to_department_name
       FROM referrals r
       JOIN patients p ON p.id = r.patient_id
       LEFT JOIN departments d ON d.id = r.to_department_id
       WHERE r.id = $1 AND r.tenant_id = $2`,
      [id, tenantId]
    );
    if (referrerRow.rows.length > 0) {
      await notifyReferralAction(referrerRow.rows[0], tenantId, 'cancelled');
    }

    res.json(out.row);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// ------------------------------------------------------------
// CONSULTANT QUEUE & STATS
// ------------------------------------------------------------

// Resolve the department for a staff id (Consultant OR Doctor in that department)
async function resolveConsultantDepartment(staffId: string, tenantId: string): Promise<string | null> {
  if (!staffId) return null;
  const result = await pool.query(
    `SELECT department_id FROM staff_users
     WHERE id = $1 AND tenant_id = $2 AND role IN ('Consultant','Doctor') AND status = 'active'`,
    [staffId, tenantId]
  );
  return result.rows[0]?.department_id || null;
}

// GET /api/consultants/referred-patients -- the consultant's queue
router.get('/api/consultants/referred-patients', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const staffId = String(req.query.staff_id || '');
    const departmentId = await resolveConsultantDepartment(staffId, tenantId);
    if (!departmentId) {
      res.status(403).json({ error: true, message: 'Consultant department not found or access denied' });
      return;
    }

    const { status, search, include_unpaid } = req.query;
    let query = `SELECT DISTINCT ON (r.id)
        p.id as patient_id, p.hospital_number, p.full_name, p.phone, p.sex, p.dob, p.status as patient_status,
        r.id as referral_id, r.referral_number, r.priority, r.status as referral_status, r.reason,
        r.referred_by, rb.name as referred_by_name, r.created_at as referred_at,
        r.accepted_at, r.accepted_by, ab.name as accepted_by_name,
        r.completed_at, r.completed_by, cb.name as completed_by_name,
        r.to_consultant_id, tc.name as to_consultant_name,
        r.consultant_fee, r.consultant_fee_status,
        (r.consultant_fee_status IN ('paid','insurance_authorized')) as has_paid_fee
      FROM referrals r
      JOIN patients p ON p.id = r.patient_id
      LEFT JOIN staff_users rb ON rb.id = r.referred_by
      LEFT JOIN staff_users ab ON ab.id = r.accepted_by
      LEFT JOIN staff_users cb ON cb.id = r.completed_by
      LEFT JOIN staff_users tc ON tc.id = r.to_consultant_id
      WHERE r.tenant_id = $1 AND r.to_department_id = $2
        AND r.status IN ('pending', 'accepted', 'in_consultation')
        AND p.folder_activated IS DISTINCT FROM false`;
    const params: any[] = [tenantId, departmentId];
    let idx = 3;

    // Each consultant sees only their OWN specific referrals plus genuinely unassigned
    // department-level referrals — never a referral aimed at another consultant.
    query += ` AND (r.to_consultant_id IS NULL OR r.to_consultant_id = $${idx})`;
    params.push(staffId);
    idx++;

    // A department-level referral is hidden for a consultant who already has their own
    // specific active referral for this patient/department, so the patient never appears
    // twice in that consultant's list.
    query += ` AND NOT (r.to_consultant_id IS NULL AND EXISTS (
        SELECT 1 FROM referrals r2
        WHERE r2.tenant_id = r.tenant_id AND r2.patient_id = r.patient_id
          AND r2.to_department_id = r.to_department_id
          AND r2.to_consultant_id = $${idx}
          AND r2.status IN ('pending', 'accepted', 'in_consultation')
      ))`;
    params.push(staffId);
    idx++;

    // Pay-first: by default the consultant sees referrals whose specialist fee is
    // settled (paid / insurer-authorized) plus emergencies. ?include_unpaid=true reveals
    // the rest so an emergency case is never missed.
    if (include_unpaid !== 'true') {
      query += ` AND (r.consultant_fee_status IN ('paid','insurance_authorized') OR r.priority = 'emergency')`;
    }

    if (status) { query += ` AND r.status = $${idx}`; params.push(status); idx++; }
    if (search) {
      query += ` AND (p.full_name ILIKE $${idx} OR p.hospital_number ILIKE $${idx} OR p.phone ILIKE $${idx} OR r.referral_number ILIKE $${idx})`;
      params.push(`%${search}%`);
      idx++;
    }

    query += ' ORDER BY r.id, CASE r.priority WHEN \'emergency\' THEN 0 WHEN \'urgent\' THEN 1 ELSE 2 END, r.created_at DESC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// GET /api/consultants/stats -- dashboard counts
router.get('/api/consultants/stats', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const staffId = String(req.query.staff_id || '');
    const departmentId = await resolveConsultantDepartment(staffId, tenantId);
    if (!departmentId) {
      res.status(403).json({ error: true, message: 'Consultant department not found or access denied' });
      return;
    }

    const result = await pool.query(
      `SELECT
        COUNT(*) FILTER (WHERE status = 'pending')::int as pending,
        COUNT(*) FILTER (WHERE status = 'accepted')::int as accepted,
        COUNT(*) FILTER (WHERE status = 'in_consultation')::int as in_consultation,
        COUNT(*) FILTER (WHERE status = 'completed')::int as completed,
        COUNT(*)::int as total
       FROM referrals
       WHERE tenant_id = $1 AND to_department_id = $2`,
      [tenantId, departmentId]
    );
    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// GET /api/consultants/completed-unviewed-count -- unviewed completed referrals for a staff member
router.get('/api/consultants/completed-unviewed-count', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const staffId = String(req.query.staff_id || '');
    const departmentId = await resolveConsultantDepartment(staffId, tenantId);
    if (!departmentId) {
      res.status(403).json({ error: true, message: 'Department not found or access denied' });
      return;
    }

    const result = await pool.query(
      `SELECT COUNT(*)::int as unviewed
       FROM referrals r
       WHERE r.tenant_id = $1 AND r.to_department_id = $2 AND r.status = 'completed'
         AND NOT EXISTS (
           SELECT 1 FROM referral_views rv
           WHERE rv.referral_id = r.id AND rv.user_id = $3
         )`,
      [tenantId, departmentId, staffId]
    );
    res.json({ unviewed: result.rows[0]?.unviewed || 0 });
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// GET /api/consultants/encounters -- consultant's own consultation history
router.get('/api/consultants/encounters', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const staffId = String(req.query.staff_id || '');
    if (!staffId) {
      res.status(400).json({ error: true, message: 'staff_id is required' });
      return;
    }

    const result = await pool.query(
      `SELECT e.*, p.full_name as patient_name, p.hospital_number, p.sex, p.dob, p.phone,
              d.name as department_name, s.name as staff_name, s.role as staff_role,
              r.referral_number, r.priority as referral_priority, r.status as referral_status,
              r.reason as referral_reason, r.outcome_note, r.created_at as referral_created_at
       FROM encounters e
       JOIN patients p ON p.id = e.patient_id
       LEFT JOIN departments d ON d.id = e.department_id
       LEFT JOIN staff_users s ON s.id = e.staff_id
       LEFT JOIN referrals r ON r.id = e.referral_id
       WHERE e.tenant_id = $1 AND e.staff_id = $2 AND e.is_consultation = true
       ORDER BY e.created_at DESC`,
      [tenantId, staffId]
    );

    // Attach SOAP notes to each encounter
    const encIds = result.rows.map((e: any) => e.id);
    const notesByEnc: Record<string, any[]> = {};
    if (encIds.length > 0) {
      const notesResult = await pool.query(
        `SELECT n.*, s.name as staff_name, s.role as staff_role
         FROM encounter_notes n
         LEFT JOIN staff_users s ON s.id = n.staff_id
         WHERE n.tenant_id = $1 AND n.encounter_id = ANY($2::uuid[])
         ORDER BY n.created_at ASC`,
        [tenantId, encIds]
      );
      for (const n of notesResult.rows) {
        if (!notesByEnc[n.encounter_id]) notesByEnc[n.encounter_id] = [];
        notesByEnc[n.encounter_id].push(n);
      }
    }
    const rowsWithNotes = result.rows.map((e: any) => ({ ...e, notes: notesByEnc[e.id] || [] }));

    res.json(rowsWithNotes);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// GET /api/consultants/result-notifications -- completed results for the consultant's encounters
router.get('/api/consultants/result-notifications', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const staffId = String(req.query.staff_id || '');
    if (!staffId) {
      res.status(400).json({ error: true, message: 'staff_id is required' });
      return;
    }

    const result = await pool.query(
      `SELECT
        (SELECT COUNT(*)::int FROM lab_orders lo
         JOIN encounters e ON e.id = lo.encounter_id
         WHERE lo.tenant_id = $1 AND e.staff_id = $2 AND e.is_consultation = true
           AND lo.status = 'completed' AND lo.doctor_read_at IS NULL) as lab_completed,
        (SELECT COUNT(*)::int FROM radiology_orders ro
         JOIN encounters e ON e.id = ro.encounter_id
         WHERE ro.tenant_id = $1 AND e.staff_id = $2 AND e.is_consultation = true
           AND ro.status = 'completed') as radiology_completed`,
      [tenantId, staffId]
    );
    const row = result.rows[0];
    res.json({
      lab_completed: row?.lab_completed || 0,
      radiology_completed: row?.radiology_completed || 0,
      total: (row?.lab_completed || 0) + (row?.radiology_completed || 0),
    });
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

export default router;
