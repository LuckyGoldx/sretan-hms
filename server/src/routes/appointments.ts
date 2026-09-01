import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import pool from '../db/pool';
import { readClinicProfile } from '../config/reader';

const router = Router();

function getTenantId(): string {
  return readClinicProfile().GLOBAL_SAAS_TENANT_ID;
}

const VALID_VISIT_TYPES = ['new', 'follow_up', 'review'];

/** Default consultation fee from inventory for a visit type. */
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

router.get('/api/appointments', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const { doctor_id, patient_id, status, date_from, date_to } = req.query;

    let query = `SELECT a.*,
      p.full_name as patient_name, p.hospital_number,
      s.name as doctor_name,
      sb.name as created_by_name,
      v.id as visit_id, v.status as visit_status, v.consultation_status, v.consultation_fee, v.visit_type,
      CASE WHEN v.consultation_status IN ('paid','insurance_authorized') THEN true
           ELSE EXISTS (
             SELECT 1 FROM visits cv
             WHERE cv.patient_id = a.patient_id AND cv.status = 'waiting'
               AND cv.consultation_status IN ('paid','insurance_authorized')
           )
      END as has_paid,
      EXISTS (
        SELECT 1 FROM visits cv
        WHERE cv.patient_id = a.patient_id AND cv.status = 'completed'
          AND cv.completed_at >= a.created_at
      ) as consulted_after_booking
      FROM appointments a
      JOIN patients p ON p.id = a.patient_id
      LEFT JOIN staff_users s ON s.id = a.doctor_id
      LEFT JOIN staff_users sb ON sb.id = a.created_by
      LEFT JOIN visits v ON v.id = a.visit_id
      WHERE a.tenant_id = $1 AND p.folder_activated IS DISTINCT FROM false`;
    const params: any[] = [tenantId];
    let idx = 2;

    if (doctor_id) { query += ` AND a.doctor_id = $${idx}`; params.push(doctor_id); idx++; }
    if (patient_id) { query += ` AND a.patient_id = $${idx}`; params.push(patient_id); idx++; }
    if (status) { query += ` AND a.status = $${idx}`; params.push(status); idx++; }
    if (date_from) { query += ` AND a.appointment_date >= $${idx}`; params.push(date_from); idx++; }
    if (date_to) { query += ` AND a.appointment_date <= $${idx}`; params.push(date_to); idx++; }

    query += ' ORDER BY a.appointment_date DESC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// GET /api/appointments/scheduled-count -- sidebar badge count of upcoming scheduled appointments.
router.get('/api/appointments/scheduled-count', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const staffId = String(req.query.staff_id || '');
    const role = String(req.query.role || '');
    let query = `SELECT COUNT(*)::int as count FROM appointments
                 WHERE tenant_id = $1 AND status = 'scheduled' AND appointment_date >= NOW()`;
    const params: any[] = [tenantId];
    if (role === 'Doctor' || role === 'Consultant') {
      if (!staffId) { res.json({ count: 0 }); return; }
      query += ` AND doctor_id = $2`;
      params.push(staffId);
    }
    const result = await pool.query(query, params);
    res.json({ count: result.rows[0]?.count || 0 });
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.post('/api/appointments', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const { patient_id, doctor_id, appointment_date, reason, notes, created_by, visit_type } = req.body;
    if (!patient_id || !appointment_date) {
      res.status(400).json({ error: true, message: 'patient_id and appointment_date are required' });
      return;
    }
    const resolvedType = visit_type && VALID_VISIT_TYPES.includes(visit_type) ? visit_type : 'new';

    // Raise the consultation charge (visit) for the booked appointment so paypoint can
    // collect it, and the doctor can consult once it is paid.
    const fee = await getDefaultConsultationFee(resolvedType);
    let visitId: string | null = null;
    if (doctor_id) {
      const doc = await pool.query(
        `SELECT department_id FROM staff_users WHERE id = $1 AND tenant_id = $2 AND status = 'active'`,
        [doctor_id, tenantId]
      );
      const visitIdNew = uuidv4();
      await pool.query(
        `INSERT INTO visits (id, tenant_id, patient_id, assigned_doctor_id, department_id, visit_type,
                             consultation_fee, consultation_status, status, remarks)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'waiting', 'Appointment booked')`,
        [visitIdNew, tenantId, patient_id, doctor_id, doc.rows[0]?.department_id || null, resolvedType, fee, fee > 0 ? 'pending' : 'waived']
      );
      visitId = visitIdNew;
    }

    const id = uuidv4();
    const result = await pool.query(
      `INSERT INTO appointments (id, tenant_id, patient_id, doctor_id, appointment_date, reason, notes, created_by, visit_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [id, tenantId, patient_id, doctor_id || null, appointment_date, reason || null, notes || null, created_by || null, visitId]
    );

    // Notify the booked doctor.
    if (doctor_id && doctor_id !== created_by) {
      try {
        const patInfo = await pool.query(`SELECT full_name FROM patients WHERE id = $1`, [patient_id]);
        await pool.query(
          `INSERT INTO notifications (tenant_id, recipient_id, type, title, message, ref_table, ref_id, patient_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [tenantId, doctor_id, 'appointment_scheduled', 'Appointment booked',
           `Appointment booked with ${patInfo.rows[0]?.full_name || 'patient'} on ${new Date(appointment_date).toLocaleString()}.`,
           'appointments', id, patient_id]
        );
      } catch {}
    }

    res.status(201).json({ ...result.rows[0], visit_id: visitId });
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.put('/api/appointments/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;
    const result = await pool.query(
      `UPDATE appointments SET status = COALESCE($1, status), notes = COALESCE($2, notes) WHERE id = $3 RETURNING *`,
      [status || null, notes || null, id]
    );
    if (result.rows.length === 0) { res.status(404).json({ error: true, message: 'Appointment not found' }); return; }
    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

export default router;
