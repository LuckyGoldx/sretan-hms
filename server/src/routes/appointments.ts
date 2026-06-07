import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import pool from '../db/pool';
import { readClinicProfile } from '../config/reader';

const router = Router();

function getTenantId(): string {
  return readClinicProfile().GLOBAL_SAAS_TENANT_ID;
}

router.get('/api/appointments', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const { doctor_id, patient_id, status, date_from, date_to } = req.query;

    let query = `SELECT a.*,
      p.full_name as patient_name, p.hospital_number,
      s.name as doctor_name,
      sb.name as created_by_name
      FROM appointments a
      JOIN patients p ON p.id = a.patient_id
      LEFT JOIN staff_users s ON s.id = a.doctor_id
      LEFT JOIN staff_users sb ON sb.id = a.created_by
      WHERE a.tenant_id = $1`;
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

router.post('/api/appointments', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const { patient_id, doctor_id, appointment_date, reason, notes, created_by } = req.body;
    if (!patient_id || !appointment_date) {
      res.status(400).json({ error: true, message: 'patient_id and appointment_date are required' });
      return;
    }
    const id = uuidv4();
    const result = await pool.query(
      `INSERT INTO appointments (id, tenant_id, patient_id, doctor_id, appointment_date, reason, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [id, tenantId, patient_id, doctor_id || null, appointment_date, reason || null, notes || null, created_by || null]
    );
    res.status(201).json(result.rows[0]);
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
