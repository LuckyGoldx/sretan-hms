import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import pool from '../db/pool';
import { readClinicProfile } from '../config/reader';
import { clockGuard } from '../middleware/clockGuard';

const router = Router();

function getTenantId(): string {
  return readClinicProfile().GLOBAL_SAAS_TENANT_ID;
}

const ACTIVE_VISIT_STATUSES = ['waiting', 'with_doctor'];
const VALID_VISIT_TYPES = ['new', 'follow_up', 'review'];

/**
 * Compute visit_type for a patient: 'new' on their first billed consultation,
 * 'follow_up' on subsequent check-ins.
 */
async function computeVisitType(patientId: string): Promise<string> {
  const prior = await pool.query(
    `SELECT 1 FROM visits
     WHERE patient_id = $1 AND consultation_status IN ('paid', 'insurance_authorized')
     LIMIT 1`,
    [patientId]
  );
  return prior.rows.length > 0 ? 'follow_up' : 'new';
}

/**
 * Default consultation fee from the inventory (category 'general'):
 *   new            -> "General Consultation (New)"      (first match wins)
 *   follow_up/review -> "General Consultation (Follow-up)"
 * Falls back to 0 if nothing is configured.
 */
async function getDefaultConsultationFee(visitType: string): Promise<number> {
  const isFollowUp = visitType === 'follow_up' || visitType === 'review';
  const patterns = isFollowUp
    ? ['General Consultation (Follow-up)', '%General Consultation (Follow-up)%', '%Consultation%Follow-up%']
    : ['General Consultation (New)', '%General Consultation (New)%', '%General Consultation%'];
  for (const pat of patterns) {
    const res = await pool.query(
      `SELECT price FROM inventory_items
       WHERE drug_name ILIKE $1 AND category = 'general' AND is_active = true
       ORDER BY created_at DESC LIMIT 1`,
      [pat]
    );
    if (res.rows.length > 0) return parseFloat(res.rows[0].price) || 0;
  }
  return 0;
}

// GET /api/visits/consultation-fees -- configured default fees (for the assign UI).
router.get('/api/visits/consultation-fees', async (_req: Request, res: Response) => {
  try {
    const [newFee, followUpFee] = await Promise.all([
      getDefaultConsultationFee('new'),
      getDefaultConsultationFee('follow_up'),
    ]);
    res.json({ new_visit: newFee, follow_up: followUpFee, review: followUpFee });
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

function audit(tenantId: string, action: string, table: string, recordId: string, performedBy: string | null, oldData?: any, newData?: any): Promise<any> {
  return pool.query(
    `INSERT INTO audit_logs (tenant_id, action, table_name, record_id, performed_by, old_data, new_data)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [tenantId, action, table, recordId, performedBy || null, oldData ? JSON.stringify(oldData) : null, newData ? JSON.stringify(newData) : null]
  ).catch(() => {});
}

// GET /api/visits -- list visits with filters
router.get('/api/visits', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const { patient_id, assigned_doctor_id, status, department_id, active } = req.query;
    let query = `SELECT v.*, p.full_name as patient_name, p.hospital_number,
                        d.name as department_name, s.name as assigned_doctor_name
                 FROM visits v
                 JOIN patients p ON p.id = v.patient_id
                 LEFT JOIN departments d ON d.id = v.department_id
                 LEFT JOIN staff_users s ON s.id = v.assigned_doctor_id
                 WHERE v.tenant_id = $1`;
    const params: any[] = [tenantId];
    let idx = 2;

    if (patient_id) { query += ` AND v.patient_id = $${idx}`; params.push(patient_id); idx++; }
    if (assigned_doctor_id) { query += ` AND v.assigned_doctor_id = $${idx}`; params.push(assigned_doctor_id); idx++; }
    if (department_id) { query += ` AND v.department_id = $${idx}`; params.push(department_id); idx++; }
    if (status) { query += ` AND v.status = $${idx}`; params.push(status); idx++; }
    if (active === 'true') { query += ` AND v.status IN ('waiting','with_doctor')`; }

    query += ' ORDER BY v.created_at DESC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// POST /api/visits -- Records/Nurse assign a patient to a doctor/department.
// Creates (or reuses) an active visit for the patient's current check-in.
router.post('/api/visits', async (req: Request, res: Response) => {
  try {
    await clockGuard(pool, 'visits');
    const tenantId = getTenantId();
    const { patient_id, assigned_doctor_id, department_id, visit_type, consultation_fee, performed_by } = req.body;

    if (!patient_id) {
      res.status(400).json({ error: true, message: 'patient_id is required' });
      return;
    }

    const patient = await pool.query('SELECT * FROM patients WHERE id = $1 AND tenant_id = $2', [patient_id, tenantId]);
    if (patient.rows.length === 0) {
      res.status(404).json({ error: true, message: 'Patient not found' });
      return;
    }

    // Validate doctor belongs to department when both are provided.
    if (assigned_doctor_id) {
      const doc = await pool.query(
        `SELECT id, role, department_id FROM staff_users WHERE id = $1 AND tenant_id = $2 AND status = 'active'`,
        [assigned_doctor_id, tenantId]
      );
      if (doc.rows.length === 0) {
        res.status(400).json({ error: true, message: 'Assigned doctor not found or inactive' });
        return;
      }
      if (department_id && doc.rows[0].department_id && doc.rows[0].department_id !== department_id) {
        res.status(400).json({ error: true, message: 'Assigned doctor does not belong to the selected department' });
        return;
      }
    }

    const resolvedType = visit_type && VALID_VISIT_TYPES.includes(visit_type) ? visit_type : await computeVisitType(patient_id);
    // Blank fee -> use the default consultation fee configured in inventory.
    let fee = 0;
    if (consultation_fee !== undefined && consultation_fee !== null && consultation_fee !== '') {
      fee = parseFloat(consultation_fee);
      if (isNaN(fee)) fee = 0;
    } else {
      fee = await getDefaultConsultationFee(resolvedType);
    }
    if (fee < 0) {
      res.status(400).json({ error: true, message: 'Consultation fee cannot be negative' });
      return;
    }

    // Reuse the patient's active visit if one exists (one visit per check-in).
    const active = await pool.query(
      `SELECT * FROM visits WHERE tenant_id = $1 AND patient_id = $2 AND status IN ('waiting','with_doctor')
       ORDER BY created_at DESC LIMIT 1`,
      [tenantId, patient_id]
    );

    // Lock: a patient in an active consultation cannot be reassigned or released
    // until the doctor completes the visit.
    if (active.rows.length > 0 && active.rows[0].status === 'with_doctor') {
      res.status(409).json({ error: true, message: 'Patient is currently in consultation with a doctor. Complete the consultation before reassigning or releasing.' });
      return;
    }

    // Release / unclaim: when no doctor is chosen for an existing visit, clear the
    // assignment but keep the visit and its consultation/billing state intact.
    if (active.rows.length > 0 && !assigned_doctor_id) {
      const old = active.rows[0];
      const released = (await pool.query(
        `UPDATE visits SET assigned_doctor_id = NULL WHERE id = $1 RETURNING *`,
        [old.id]
      )).rows[0];
      await pool.query(
        `UPDATE patients SET assigned_doctor_id = NULL WHERE id = $1 AND tenant_id = $2`,
        [patient_id, tenantId]
      );
      await audit(tenantId, 'UPDATE', 'visits', old.id, performed_by || null, old, released);
      res.json(released);
      return;
    }

    let visit: any;
    if (active.rows.length > 0) {
      const old = active.rows[0];
      visit = (await pool.query(
        `UPDATE visits SET assigned_doctor_id = COALESCE($1, assigned_doctor_id),
                           department_id = COALESCE($2, department_id),
                           visit_type = $3,
                           consultation_fee = $4,
                           consultation_status = CASE WHEN $4::numeric > 0 THEN 'pending' ELSE consultation_status END
         WHERE id = $5 RETURNING *`,
        [assigned_doctor_id || null, department_id || null, resolvedType, fee, old.id]
      )).rows[0];
      await audit(tenantId, 'UPDATE', 'visits', old.id, performed_by || null, old, visit);
    } else {
      const id = uuidv4();
      visit = (await pool.query(
        `INSERT INTO visits (id, tenant_id, patient_id, assigned_doctor_id, department_id, visit_type, consultation_fee, consultation_status, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'waiting')
         RETURNING *`,
        [id, tenantId, patient_id, assigned_doctor_id || null, department_id || null, resolvedType, fee, fee > 0 ? 'pending' : 'waived']
      )).rows[0];
      await audit(tenantId, 'INSERT', 'visits', id, performed_by || null, null, visit);
    }

    // Mirror the assignment onto the patient record (cleared on completion/discharge).
    await pool.query(
      `UPDATE patients SET assigned_doctor_id = $1, department_id = COALESCE($2, department_id) WHERE id = $3 AND tenant_id = $4`,
      [assigned_doctor_id || null, department_id || null, patient_id, tenantId]
    );
    await audit(tenantId, 'UPDATE', 'patients', patient_id, performed_by || null, patient.rows[0], { assigned_doctor_id: assigned_doctor_id || null, department_id: department_id || null });

    res.status(201).json(visit);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// POST /api/patients/:patientId/claim -- a doctor claims an unassigned patient (self-assign).
router.post('/api/patients/:patientId/claim', async (req: Request, res: Response) => {
  try {
    await clockGuard(pool, 'patients');
    const tenantId = getTenantId();
    const patientId = String(req.params.patientId);
    const { staff_id, performed_by, emergency, visit_type } = req.body;

    if (!staff_id) {
      res.status(400).json({ error: true, message: 'staff_id is required' });
      return;
    }

    const doc = await pool.query(
      `SELECT id, name, role, department_id FROM staff_users WHERE id = $1 AND tenant_id = $2 AND status = 'active'`,
      [staff_id, tenantId]
    );
    if (doc.rows.length === 0) {
      res.status(400).json({ error: true, message: 'Doctor not found or inactive' });
      return;
    }

    const patient = await pool.query('SELECT * FROM patients WHERE id = $1 AND tenant_id = $2', [patientId, tenantId]);
    if (patient.rows.length === 0) {
      res.status(404).json({ error: true, message: 'Patient not found' });
      return;
    }
    if (patient.rows[0].folder_activated === false) {
      res.status(400).json({ error: true, message: 'Patient folder has not been activated (registration fee unpaid)' });
      return;
    }

    const p = patient.rows[0];
    if (p.assigned_doctor_id && p.assigned_doctor_id !== staff_id) {
      res.status(409).json({ error: true, message: 'Patient is already assigned to another doctor' });
      return;
    }

    // Pay-first model: normally a patient can only be claimed when they have a paid,
    // unused consultation (waiting + unassigned, or already assigned to this same doctor).
    // `emergency: true` overrides this so an unpaid patient can be attended to immediately.
    if (!emergency) {
      const paidConsult = await pool.query(
        `SELECT 1 FROM visits v
         WHERE v.tenant_id = $1 AND v.patient_id = $2
           AND v.status = 'waiting' AND v.consultation_status IN ('paid','insurance_authorized')
           AND (v.assigned_doctor_id IS NULL OR v.assigned_doctor_id = $3)
         LIMIT 1`,
        [tenantId, patientId, staff_id]
      );
      if (paidConsult.rows.length === 0) {
        res.status(409).json({ error: true, message: 'Patient has no paid, unused consultation. Collect the consultation fee at paypoint before claiming.' });
        return;
      }
    }

    // The doctor can specify the consultation type (new / follow_up) for an emergency
    // claim; otherwise it is derived from the patient's history (new if no prior
    // billed consultation, follow-up otherwise).
    const visitType = visit_type && VALID_VISIT_TYPES.includes(visit_type) ? visit_type : await computeVisitType(patientId);
    const active = await pool.query(
      `SELECT * FROM visits WHERE tenant_id = $1 AND patient_id = $2 AND status IN ('waiting','with_doctor') ORDER BY created_at DESC LIMIT 1`,
      [tenantId, patientId]
    );
    if (active.rows.length > 0 && active.rows[0].status === 'with_doctor') {
      res.status(409).json({ error: true, message: 'Patient is already in consultation. Complete the consultation before claiming.' });
      return;
    }

    let visit: any;
    if (active.rows.length > 0) {
      // Preserve the existing visit (incl. the paid consultation's visit_type/fee).
      visit = (await pool.query(
        `UPDATE visits SET assigned_doctor_id = $1, department_id = COALESCE($2, department_id)
         WHERE id = $3 RETURNING *`,
        [staff_id, doc.rows[0].department_id || null, active.rows[0].id]
      )).rows[0];
      await audit(tenantId, 'UPDATE', 'visits', visit.id, performed_by || staff_id, active.rows[0], visit);
    } else {
      const id = uuidv4();
      // No active visit (e.g. emergency claim of a patient who has not paid):
      // raise a consultation charge at the default fee so paypoint can collect it later.
      const fee = await getDefaultConsultationFee(visitType);
      visit = (await pool.query(
        `INSERT INTO visits (id, tenant_id, patient_id, assigned_doctor_id, department_id, visit_type, consultation_fee, consultation_status, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'waiting') RETURNING *`,
        [id, tenantId, patientId, staff_id, doc.rows[0].department_id || null, visitType, fee, fee > 0 ? 'pending' : 'waived']
      )).rows[0];
      await audit(tenantId, 'INSERT', 'visits', id, performed_by || staff_id, null, visit);
    }

    await pool.query(
      `UPDATE patients SET assigned_doctor_id = $1, department_id = COALESCE($2, department_id) WHERE id = $3 AND tenant_id = $4`,
      [staff_id, doc.rows[0].department_id || null, patientId, tenantId]
    );
    await audit(tenantId, 'UPDATE', 'patients', patientId, performed_by || staff_id, p, { assigned_doctor_id: staff_id });

    // Notify Records/Nurse/Admin so they can see the claim without refreshing.
    try {
      const notifTargets = await pool.query(
        `SELECT id FROM staff_users WHERE tenant_id = $1 AND status = 'active' AND role IN ('Nurse','Records','Admin')`,
        [tenantId]
      );
      const docName = doc.rows[0]?.name || 'A doctor';
      for (const t of notifTargets.rows) {
        await pool.query(
          `INSERT INTO notifications (tenant_id, recipient_id, type, title, message, ref_table, ref_id, patient_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [tenantId, t.id, 'claim', 'Patient claimed', `${docName} claimed ${p.full_name} (${p.hospital_number || ''}).`, 'patients', patientId, patientId]
        );
      }
    } catch {}

    res.status(201).json(visit);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// PUT /api/visits/:id/start -- doctor starts the consultation.
router.put('/api/visits/:id/start', async (req: Request, res: Response) => {
  try {
    await clockGuard(pool, 'visits');
    const tenantId = getTenantId();
    const id = String(req.params.id);
    const { performed_by, consultation_fee } = req.body;

    const existing = await pool.query('SELECT * FROM visits WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
    if (existing.rows.length === 0) {
      res.status(404).json({ error: true, message: 'Visit not found' });
      return;
    }

    const old = existing.rows[0];
    let fee = old.consultation_fee;
    if (consultation_fee !== undefined && consultation_fee !== null) {
      fee = parseFloat(consultation_fee);
      if (fee < 0) {
        res.status(400).json({ error: true, message: 'Consultation fee cannot be negative' });
        return;
      }
    }

    // A doctor can only have ONE active (with_doctor) consultation at a time.
    const doctorId = performed_by || old.assigned_doctor_id || null;
    if (doctorId) {
      const activeConsult = await pool.query(
        `SELECT v.id as visit_id, v.patient_id, p.full_name, p.hospital_number, v.visit_type,
                v.started_at, v.consultation_status, d.name as department_name, v.assigned_doctor_id
         FROM visits v
         JOIN patients p ON p.id = v.patient_id
         LEFT JOIN departments d ON d.id = v.department_id
         WHERE v.tenant_id = $1 AND v.assigned_doctor_id = $2 AND v.status = 'with_doctor' AND v.id <> $3
         ORDER BY v.started_at DESC NULLS LAST LIMIT 1`,
        [tenantId, doctorId, id]
      );
      if (activeConsult.rows.length > 0) {
        const a = activeConsult.rows[0];
        res.status(409).json({
          error: true,
          message: `You already have an active consultation with ${a.full_name}. Complete it before starting a new one.`,
          activeConsultation: a,
        });
        return;
      }
    }

    const result = await pool.query(
      `UPDATE visits SET status = 'with_doctor', started_at = COALESCE(started_at, NOW()),
                         consultation_fee = $1,
                         consultation_status = CASE WHEN $1::numeric > 0 AND consultation_status IN ('pending','unpaid') THEN 'pending' ELSE consultation_status END
       WHERE id = $2 AND tenant_id = $3 RETURNING *`,
      [fee, id, tenantId]
    );

    await pool.query(
      `UPDATE patients SET status = 'with_doctor' WHERE id = $1 AND tenant_id = $2`,
      [old.patient_id, tenantId]
    );
    await audit(tenantId, 'UPDATE', 'visits', id, performed_by || null, old, result.rows[0]);

    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// PUT /api/visits/:id/complete -- finish the visit, clear the queue assignment.
router.put('/api/visits/:id/complete', async (req: Request, res: Response) => {
  try {
    await clockGuard(pool, 'visits');
    const tenantId = getTenantId();
    const id = String(req.params.id);
    const { performed_by } = req.body;

    const existing = await pool.query('SELECT * FROM visits WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
    if (existing.rows.length === 0) {
      res.status(404).json({ error: true, message: 'Visit not found' });
      return;
    }
    const old = existing.rows[0];

    const result = await pool.query(
      `UPDATE visits SET status = 'completed', completed_at = COALESCE(completed_at, NOW()),
         consultation_status = CASE
           WHEN consultation_status IN ('paid', 'insurance_authorized') THEN 'settled'
           ELSE consultation_status
         END
       WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [id, tenantId]
    );

    // Clear the current assignment (queue handoff, not ownership forever).
    await pool.query(
      `UPDATE patients SET assigned_doctor_id = NULL WHERE id = $1 AND tenant_id = $2 AND assigned_doctor_id = $3`,
      [old.patient_id, tenantId, old.assigned_doctor_id]
    );
    await audit(tenantId, 'UPDATE', 'visits', id, performed_by || null, old, result.rows[0]);

    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// GET /api/doctor-queue -- a doctor's assigned patients + unassigned (claimable) queue.
router.get('/api/doctor-queue', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const staffId = String(req.query.staff_id || '');
    if (!staffId) {
      res.status(400).json({ error: true, message: 'staff_id is required' });
      return;
    }

    const doc = await pool.query(
      `SELECT id, department_id FROM staff_users WHERE id = $1 AND tenant_id = $2 AND role IN ('Doctor','Consultant') AND status = 'active'`,
      [staffId, tenantId]
    );
    const departmentId = doc.rows[0]?.department_id || null;

    const assigned = await pool.query(
      `SELECT p.id, p.full_name, p.hospital_number, p.sex, p.dob, p.phone, p.status, p.blood_type, p.created_at,
              v.id as visit_id, v.visit_type, v.status as visit_status, v.consultation_fee, v.consultation_status,
              d.name as department_name
       FROM patients p
       JOIN visits v ON v.patient_id = p.id AND v.assigned_doctor_id = $1 AND v.status IN ('waiting','with_doctor')
       LEFT JOIN departments d ON d.id = p.department_id
       WHERE p.tenant_id = $2 AND p.folder_activated IS DISTINCT FROM false
       ORDER BY v.created_at DESC`,
      [staffId, tenantId]
    );

    // Claimable: by default only patients with a PAID, unused consultation
    // ("pay before you consult"). With ?include_unpaid=true, all unassigned active
    // patients are returned so a doctor can make an emergency claim of an unpaid patient.
    const includeUnpaid = req.query.include_unpaid === 'true';
    const claimBaseCols = `p.id, p.full_name, p.hospital_number, p.sex, p.dob, p.phone, p.status, p.blood_type, p.created_at,
                             d.name as department_name,
                             q.visit_id, q.visit_type, q.consultation_fee, q.consultation_status, q.visit_created_at,
                             COALESCE(q.consultation_status IN ('paid','insurance_authorized'), false) as has_paid`;
    const claimWhere = `p.tenant_id = $1 AND p.folder_activated IS DISTINCT FROM false
                        AND (p.assigned_doctor_id IS NULL)
                        AND p.status IN ('checked_in','in_triage','waiting','in_consultation')`;
    let claimQuery: string;
    if (includeUnpaid) {
      // Emergency view: only patients whose triage is done (status = in_triage) and
      // whose consultation fee has NOT been paid yet can be emergency-claimed.
      claimQuery = `SELECT ${claimBaseCols}
                    FROM patients p
                    LEFT JOIN LATERAL (
                      SELECT v.id as visit_id, v.visit_type, v.consultation_fee, v.consultation_status,
                             v.created_at as visit_created_at
                      FROM visits v
                      WHERE v.patient_id = p.id AND v.assigned_doctor_id IS NULL AND v.status = 'waiting'
                      ORDER BY v.created_at DESC LIMIT 1
                    ) q ON true
                    LEFT JOIN departments d ON d.id = p.department_id
                    WHERE p.tenant_id = $1 AND p.folder_activated IS DISTINCT FROM false
                      AND (p.assigned_doctor_id IS NULL)
                      AND p.status = 'in_triage'`;
    } else {
      claimQuery = `SELECT ${claimBaseCols}
                    FROM patients p
                    JOIN LATERAL (
                      SELECT v.id as visit_id, v.visit_type, v.consultation_fee, v.consultation_status,
                             v.created_at as visit_created_at
                      FROM visits v
                      WHERE v.patient_id = p.id AND v.assigned_doctor_id IS NULL
                        AND v.status = 'waiting' AND v.consultation_status IN ('paid','insurance_authorized')
                      ORDER BY v.created_at DESC LIMIT 1
                    ) q ON true
                    LEFT JOIN departments d ON d.id = p.department_id
                    WHERE ${claimWhere}`;
    }
    const claimParams: any[] = [tenantId];
    if (departmentId) {
      claimQuery += ` AND (p.department_id = $2 OR p.department_id IS NULL)`;
      claimParams.push(departmentId);
    }
    claimQuery += ' ORDER BY p.created_at DESC';
    const claimable = await pool.query(claimQuery, claimParams);

    res.json({
      staff_id: staffId,
      department_id: departmentId,
      assigned: assigned.rows,
      claimable: claimable.rows,
      counts: { assigned: assigned.rows.length, claimable: claimable.rows.length },
    });
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// GET /api/assignments -- comprehensive assignment board (Records/Nurse/Admin).
// Every folder-activated active patient with their current assignment + active visit.
router.get('/api/assignments', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const { search, status, department_id, doctor_id, assigned, payment } = req.query;
    let query = `SELECT p.id, p.full_name, p.hospital_number, p.sex, p.dob, p.phone, p.status, p.created_at,
                        p.assigned_doctor_id,
                        (SELECT s.name FROM staff_users s WHERE s.id = p.assigned_doctor_id) as assigned_doctor_name,
                        p.primary_doctor_id,
                        (SELECT s.name FROM staff_users s WHERE s.id = p.primary_doctor_id) as primary_doctor_name,
                        p.department_id,
                        (SELECT d.name FROM departments d WHERE d.id = p.department_id) as department_name,
                        (SELECT EXISTS(SELECT 1 FROM visits v
                                       WHERE v.patient_id = p.id AND v.assigned_doctor_id IS NULL
                                         AND v.status = 'waiting' AND v.consultation_status IN ('paid','insurance_authorized'))) as has_paid,
                        v.id as visit_id, v.visit_type, v.status as visit_status,
                        v.consultation_fee, v.consultation_status, v.created_at as visit_created_at
                 FROM patients p
                 LEFT JOIN LATERAL (
                   SELECT * FROM visits WHERE tenant_id = $1 AND patient_id = p.id AND status IN ('waiting','with_doctor')
                   ORDER BY created_at DESC LIMIT 1
                 ) v ON true
                 WHERE p.tenant_id = $1 AND p.folder_activated IS DISTINCT FROM false
                   AND p.status IN ('checked_in','in_triage','waiting','with_doctor','in_consultation')`;
    const params: any[] = [tenantId];
    let idx = 2;

    if (search) {
      query += ` AND (p.full_name ILIKE $${idx} OR p.hospital_number ILIKE $${idx} OR p.phone ILIKE $${idx})`;
      params.push(`%${search}%`);
      idx++;
    }
    if (status) { query += ` AND p.status = $${idx}`; params.push(status); idx++; }
    if (department_id) { query += ` AND p.department_id = $${idx}`; params.push(department_id); idx++; }
    if (doctor_id) { query += ` AND p.assigned_doctor_id = $${idx}`; params.push(doctor_id); idx++; }
    if (assigned === 'yes') { query += ` AND p.assigned_doctor_id IS NOT NULL`; }
    else if (assigned === 'no') { query += ` AND p.assigned_doctor_id IS NULL`; }
    if (payment === 'paid') {
      query += ` AND (SELECT EXISTS(SELECT 1 FROM visits v
                                    WHERE v.patient_id = p.id AND v.assigned_doctor_id IS NULL
                                      AND v.status = 'waiting' AND v.consultation_status IN ('paid','insurance_authorized')))`;
    } else if (payment === 'unpaid') {
      query += ` AND p.status = 'in_triage'
                 AND NOT (SELECT EXISTS(SELECT 1 FROM visits v
                                        WHERE v.patient_id = p.id AND v.assigned_doctor_id IS NULL
                                          AND v.status = 'waiting' AND v.consultation_status IN ('paid','insurance_authorized')))`;
    }

    query += ' ORDER BY CASE WHEN v.created_at IS NULL THEN 1 ELSE 0 END, v.created_at DESC NULLS LAST, p.created_at DESC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// GET /api/doctors/load -- active + waiting consultation counts per doctor (assign UI hint).
router.get('/api/doctors/load', async (_req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const result = await pool.query(
      `SELECT s.id as staff_id, s.name,
              COUNT(*) FILTER (WHERE v.status = 'with_doctor')::int as active,
              COUNT(*) FILTER (WHERE v.status = 'waiting')::int as waiting
       FROM staff_users s
       LEFT JOIN visits v ON v.assigned_doctor_id = s.id AND v.tenant_id = $1 AND v.status IN ('waiting','with_doctor')
       WHERE s.tenant_id = $1 AND s.status = 'active' AND s.role IN ('Doctor','Consultant')
       GROUP BY s.id, s.name
       ORDER BY s.name`,
      [tenantId]
    );
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// GET /api/doctors/:staffId/consultations -- a doctor's active + waiting + completed consultations.
router.get('/api/doctors/:staffId/consultations', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const staffId = String(req.params.staffId);
    if (!staffId) {
      res.status(400).json({ error: true, message: 'staff_id is required' });
      return;
    }

    const active = await pool.query(
      `SELECT v.id as visit_id, v.patient_id, p.full_name, p.hospital_number, p.sex, p.dob, p.phone, p.status as patient_status,
              v.visit_type, v.consultation_status, v.consultation_fee, v.started_at, d.name as department_name
       FROM visits v
       JOIN patients p ON p.id = v.patient_id
       LEFT JOIN departments d ON d.id = v.department_id
       WHERE v.tenant_id = $1 AND v.assigned_doctor_id = $2 AND v.status = 'with_doctor'
       ORDER BY v.started_at DESC NULLS LAST LIMIT 1`,
      [tenantId, staffId]
    );

    const waiting = await pool.query(
      `SELECT v.id as visit_id, v.patient_id, p.full_name, p.hospital_number, p.sex, p.dob, p.phone, p.status as patient_status,
              v.visit_type, v.consultation_status, v.consultation_fee, v.created_at, d.name as department_name
       FROM visits v
       JOIN patients p ON p.id = v.patient_id
       LEFT JOIN departments d ON d.id = v.department_id
       WHERE v.tenant_id = $1 AND v.assigned_doctor_id = $2 AND v.status = 'waiting'
       ORDER BY v.created_at DESC LIMIT 20`,
      [tenantId, staffId]
    );

    const history = await pool.query(
      `SELECT v.id as visit_id, v.patient_id, p.full_name, p.hospital_number, p.sex,
              v.visit_type, v.consultation_status, v.consultation_fee, v.completed_at, d.name as department_name
       FROM visits v
       JOIN patients p ON p.id = v.patient_id
       LEFT JOIN departments d ON d.id = v.department_id
       WHERE v.tenant_id = $1 AND v.assigned_doctor_id = $2 AND v.status = 'completed'
       ORDER BY v.completed_at DESC NULLS LAST LIMIT 50`,
      [tenantId, staffId]
    );

    res.json({
      staff_id: staffId,
      active: active.rows[0] || null,
      waiting: waiting.rows,
      history: history.rows,
    });
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

export default router;
