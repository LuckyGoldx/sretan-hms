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
      fluid_intake, fluid_output, height, fetal_heart_rate, fetal_heart_sound,
      recorded_by
    } = req.body;

    if (!encounter_id) {
      res.status(400).json({ error: true, message: 'encounter_id is required' });
      return;
    }

    const id = uuidv4();
    const result = await pool.query(
      `INSERT INTO vitals (id, tenant_id, encounter_id, systolic_bp, diastolic_bp, pulse, temperature,
        respiration_rate, weight, spo2, triage_priority, nursing_notes, fluid_intake, fluid_output,
        height, fetal_heart_rate, fetal_heart_sound, recorded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
       RETURNING *`,
      [id, tenantId, encounter_id, systolic_bp || null, diastolic_bp || null, pulse || null,
       temperature || null, respiration_rate || null, weight || null, spo2 || null,
       triage_priority || null, nursing_notes || null, fluid_intake || null, fluid_output || null,
       height || null, fetal_heart_rate || null, fetal_heart_sound || null, recorded_by || null]
    );

    await pool.query(
      `UPDATE patients SET status = 'in_triage'
       WHERE id = (SELECT patient_id FROM encounters WHERE id = $1)
         AND folder_activated IS DISTINCT FROM false`,
      [encounter_id]
    );

    const enriched = await pool.query(
      `SELECT v.*, s.name as recorded_by_name FROM vitals v
       LEFT JOIN staff_users s ON s.id = v.recorded_by
       WHERE v.id = $1`, [id]
    );
    res.status(201).json(enriched.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.get('/api/vitals/:encounterId', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const { encounterId } = req.params;

    const result = await pool.query(
      `SELECT v.*, s.name as recorded_by_name, ed.name as edited_by_name
       FROM vitals v
       LEFT JOIN staff_users s ON s.id = v.recorded_by
       LEFT JOIN staff_users ed ON ed.id = v.edited_by
       WHERE v.encounter_id = $1 AND v.tenant_id = $2 AND v.deleted_at IS NULL
       ORDER BY v.created_at DESC`,
      [encounterId, tenantId]
    );

    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.put('/api/vitals/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { edited_by, ...fields } = req.body;

    const existing = await pool.query('SELECT * FROM vitals WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      res.status(404).json({ error: true, message: 'Vitals not found' });
      return;
    }
    const vital = existing.rows[0];

    if (vital.deleted_at) {
      res.status(400).json({ error: true, message: 'Vitals have been deleted' });
      return;
    }

    const TEN_MIN = 10 * 60 * 1000;
    if (Date.now() - new Date(vital.created_at).getTime() > TEN_MIN) {
      res.status(400).json({ error: true, message: 'Editing window has expired (10 minutes after recording)' });
      return;
    }

    if (vital.recorded_by !== edited_by) {
      res.status(403).json({ error: true, message: 'Only the staff who recorded these vitals can edit them' });
      return;
    }

    const oldSnapshot = JSON.stringify({
      systolic_bp: vital.systolic_bp, diastolic_bp: vital.diastolic_bp, pulse: vital.pulse,
      temperature: vital.temperature, respiration_rate: vital.respiration_rate, weight: vital.weight,
      spo2: vital.spo2, height: vital.height, fetal_heart_rate: vital.fetal_heart_rate,
      fetal_heart_sound: vital.fetal_heart_sound, triage_priority: vital.triage_priority,
      nursing_notes: vital.nursing_notes,
    });

    const editorRes = await pool.query('SELECT name FROM staff_users WHERE id = $1', [edited_by]);
    const editorName = editorRes.rows[0]?.name || 'Unknown';
    const newLogEntry = JSON.stringify({
      edited_by, edited_by_name: editorName, edited_at: new Date().toISOString(),
      previous: oldSnapshot,
    });

    const result = await pool.query(
      `UPDATE vitals SET
        systolic_bp = COALESCE($1, systolic_bp), diastolic_bp = COALESCE($2, diastolic_bp),
        pulse = COALESCE($3, pulse), temperature = COALESCE($4, temperature),
        respiration_rate = COALESCE($5, respiration_rate), weight = COALESCE($6, weight),
        spo2 = COALESCE($7, spo2), height = COALESCE($8, height),
        fetal_heart_rate = COALESCE($9, fetal_heart_rate), fetal_heart_sound = COALESCE($10, fetal_heart_sound),
        triage_priority = COALESCE($11, triage_priority), nursing_notes = COALESCE($12, nursing_notes),
        edited_by = $13, edited_at = NOW(), edit_log = edit_log || $14::jsonb
       WHERE id = $15 RETURNING *`,
      [
        fields.systolic_bp || null, fields.diastolic_bp || null, fields.pulse || null,
        fields.temperature || null, fields.respiration_rate || null, fields.weight || null,
        fields.spo2 || null, fields.height || null, fields.fetal_heart_rate || null,
        fields.fetal_heart_sound || null, fields.triage_priority || null, fields.nursing_notes || null,
        edited_by, newLogEntry, id,
      ]
    );

    const enriched = await pool.query(
      `SELECT v.*, s.name as recorded_by_name, ed.name as edited_by_name
       FROM vitals v
       LEFT JOIN staff_users s ON s.id = v.recorded_by
       LEFT JOIN staff_users ed ON ed.id = v.edited_by
       WHERE v.id = $1`, [id]
    );
    res.json(enriched.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.delete('/api/vitals/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { deleted_by } = req.body;

    const existing = await pool.query('SELECT * FROM vitals WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      res.status(404).json({ error: true, message: 'Vitals not found' });
      return;
    }
    const vital = existing.rows[0];

    if (vital.deleted_at) {
      res.status(400).json({ error: true, message: 'Vitals have already been deleted' });
      return;
    }

    const TEN_MIN = 10 * 60 * 1000;
    if (Date.now() - new Date(vital.created_at).getTime() > TEN_MIN) {
      res.status(400).json({ error: true, message: 'Deletion window has expired (10 minutes after recording)' });
      return;
    }

    if (vital.recorded_by !== deleted_by) {
      res.status(403).json({ error: true, message: 'Only the staff who recorded these vitals can delete them' });
      return;
    }

    await pool.query(
      'UPDATE vitals SET deleted_at = NOW(), deleted_by = $1 WHERE id = $2',
      [deleted_by, id]
    );
    res.json({ ok: true, message: 'Vitals deleted successfully' });
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

export default router;
