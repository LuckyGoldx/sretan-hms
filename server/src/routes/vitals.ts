import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import pool from '../db/pool';
import { readClinicProfile } from '../config/reader';
import { clockGuard } from '../middleware/clockGuard';

const router = Router();

function getTenantId(): string {
  return readClinicProfile().GLOBAL_SAAS_TENANT_ID;
}

router.post('/api/vitals', async (req: Request, res: Response) => {
  try {
    await clockGuard(pool, 'vitals');

    const tenantId = getTenantId();
    const {
      encounter_id, systolic_bp, diastolic_bp, pulse, temperature,
      respiration_rate, weight, spo2, triage_priority, nursing_notes,
      fluid_intake, fluid_output
    } = req.body;

    if (!encounter_id) {
      res.status(400).json({ error: true, message: 'encounter_id is required' });
      return;
    }

    const id = uuidv4();
    const result = await pool.query(
      `INSERT INTO vitals (id, tenant_id, encounter_id, systolic_bp, diastolic_bp, pulse, temperature,
        respiration_rate, weight, spo2, triage_priority, nursing_notes, fluid_intake, fluid_output)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING *`,
      [id, tenantId, encounter_id, systolic_bp || null, diastolic_bp || null, pulse || null,
       temperature || null, respiration_rate || null, weight || null, spo2 || null,
       triage_priority || null, nursing_notes || null, fluid_intake || null, fluid_output || null]
    );

    await pool.query(
      `UPDATE patients SET status = 'in_triage'
       WHERE id = (SELECT patient_id FROM encounters WHERE id = $1)`,
      [encounter_id]
    );

    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.get('/api/vitals/:encounterId', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const { encounterId } = req.params;

    const result = await pool.query(
      'SELECT * FROM vitals WHERE encounter_id = $1 AND tenant_id = $2 ORDER BY created_at DESC',
      [encounterId, tenantId]
    );

    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

export default router;
