import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import pool from '../db/pool';
import { readClinicProfile } from '../config/reader';
import { clockGuard } from '../middleware/clockGuard';

const router = Router();

function getTenantId(): string {
  return readClinicProfile().GLOBAL_SAAS_TENANT_ID;
}

router.get('/api/encounters', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const { patient_id, encounter_type } = req.query;
    let query = `SELECT e.*, s.name as staff_name FROM encounters e LEFT JOIN staff_users s ON s.id = e.staff_id WHERE e.tenant_id = $1`;
    const params: any[] = [tenantId];
    let paramIndex = 2;

    if (patient_id) {
      query += ` AND e.patient_id = $${paramIndex}`;
      params.push(patient_id);
      paramIndex++;
    }

    if (encounter_type) {
      query += ` AND e.encounter_type = $${paramIndex}`;
      params.push(encounter_type);
      paramIndex++;
    }

    query += ' ORDER BY e.created_at DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.get('/api/encounters/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const { id } = req.params;

    const result = await pool.query(
      'SELECT * FROM encounters WHERE id = $1 AND tenant_id = $2',
      [id, tenantId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: true, message: 'Encounter not found' });
      return;
    }

    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.post('/api/encounters', async (req: Request, res: Response) => {
  try {
    await clockGuard(pool, 'encounters');

    const tenantId = getTenantId();
    const { patient_id, encounter_type, chief_complaint, soap_notes, staff_id, diagnoses } = req.body;

    if (!patient_id || !encounter_type) {
      res.status(400).json({ error: true, message: 'patient_id and encounter_type are required' });
      return;
    }

    const id = uuidv4();
    const result = await pool.query(
      `INSERT INTO encounters (id, tenant_id, patient_id, staff_id, encounter_type, chief_complaint, soap_notes, diagnoses)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [id, tenantId, patient_id, staff_id || null, encounter_type, chief_complaint || null, soap_notes || null, diagnoses || null]
    );

    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.put('/api/encounters/:id', async (req: Request, res: Response) => {
  try {
    await clockGuard(pool, 'encounters');

    const tenantId = getTenantId();
    const { id } = req.params;
    const { encounter_type, chief_complaint, soap_notes, diagnoses } = req.body;

    const result = await pool.query(
      `UPDATE encounters SET
        encounter_type = COALESCE($1, encounter_type),
        chief_complaint = COALESCE($2, chief_complaint),
        soap_notes = COALESCE($3, soap_notes),
        diagnoses = COALESCE($4, diagnoses)
       WHERE id = $5 AND tenant_id = $6
       RETURNING *`,
      [encounter_type || null, chief_complaint || null, soap_notes || null, diagnoses || null, id, tenantId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: true, message: 'Encounter not found' });
      return;
    }

    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

export default router;
