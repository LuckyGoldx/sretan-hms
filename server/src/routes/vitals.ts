import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import pool from '../db/pool';
import { readClinicProfile } from '../config/reader';
import { clockGuard } from '../middleware/clockGuard';

const router = Router();

function getTenantId(): string {
  return readClinicProfile().GLOBAL_SAAS_TENANT_ID;
}

function validateVitalRanges(fields: any): string | null {
  const t = fields.temperature;
  if (t !== undefined && t !== null && t !== '' && (parseFloat(t) < 32 || parseFloat(t) > 43)) {
    return `Temperature ${t}°C is outside the clinically acceptable range (32°C–43°C). Please verify and correct.`;
  }
  const s = fields.spo2;
  if (s !== undefined && s !== null && s !== '' && (parseFloat(s) < 0 || parseFloat(s) > 100)) {
    return `SpO2 ${s}% is outside the valid range (0%–100%). Please verify and correct.`;
  }
  const sys = fields.systolic_bp;
  if (sys !== undefined && sys !== null && sys !== '' && (parseFloat(sys) < 60 || parseFloat(sys) > 250)) {
    return `Systolic BP ${sys} mmHg is outside the clinically acceptable range (60–250 mmHg). Please verify.`;
  }
  const dia = fields.diastolic_bp;
  if (dia !== undefined && dia !== null && dia !== '' && (parseFloat(dia) < 30 || parseFloat(dia) > 150)) {
    return `Diastolic BP ${dia} mmHg is outside the clinically acceptable range (30–150 mmHg). Please verify.`;
  }
  const p = fields.pulse;
  if (p !== undefined && p !== null && p !== '' && (parseFloat(p) < 30 || parseFloat(p) > 250)) {
    return `Pulse ${p} bpm is outside the clinically acceptable range (30–250 bpm). Please verify.`;
  }
  const rr = fields.respiration_rate;
  if (rr !== undefined && rr !== null && rr !== '' && (parseFloat(rr) < 5 || parseFloat(rr) > 60)) {
    return `Respiratory rate ${rr} is outside the clinically acceptable range (5–60). Please verify.`;
  }
  const negFields = ['weight', 'height', 'fluid_intake', 'fluid_output', 'fetal_heart_rate',
    'fundal_height', 'hemoglobin', 'pcv', 'gestational_age_weeks'];
  for (const f of negFields) {
    const v = (fields as any)[f];
    if (v !== undefined && v !== null && v !== '' && parseFloat(v) < 0) {
      return `${f.replace(/_/g, ' ')} cannot be negative (value: ${v}). Please correct.`;
    }
  }
  return null;
}

router.post('/api/vitals', async (req: Request, res: Response) => {
  try {
    await clockGuard(pool, 'vitals');

    const tenantId = getTenantId();
    const {
      encounter_id, systolic_bp, diastolic_bp, pulse, temperature,
      respiration_rate, weight, spo2, triage_priority, nursing_notes,
      fluid_intake, fluid_output, height, fetal_heart_rate, fetal_heart_sound,
      fundal_height, fetal_presentation, urine_protein, urine_glucose,
      hemoglobin, pcv, gestational_age_weeks, tt_dose,
      recorded_by
    } = req.body;

    if (!encounter_id) {
      res.status(400).json({ error: true, message: 'encounter_id is required' });
      return;
    }

    const valError = validateVitalRanges(req.body);
    if (valError) {
      res.status(400).json({ error: true, message: valError });
      return;
    }

    const id = uuidv4();
    const result = await pool.query(
      `INSERT INTO vitals (id, tenant_id, encounter_id, systolic_bp, diastolic_bp, pulse, temperature,
        respiration_rate, weight, spo2, triage_priority, nursing_notes, fluid_intake, fluid_output,
        height, fetal_heart_rate, fetal_heart_sound, recorded_by,
        fundal_height, fetal_presentation, urine_protein, urine_glucose, hemoglobin, pcv,
        gestational_age_weeks, tt_dose)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18,
        $19, $20, $21, $22, $23, $24, $25, $26)
       RETURNING *`,
      [id, tenantId, encounter_id, systolic_bp || null, diastolic_bp || null, pulse || null,
       temperature || null, respiration_rate || null, weight || null, spo2 || null,
       triage_priority || null, nursing_notes || null, fluid_intake || null, fluid_output || null,
       height || null, fetal_heart_rate || null, fetal_heart_sound || null, recorded_by || null,
       fundal_height || null, fetal_presentation || null, urine_protein || null, urine_glucose || null,
       hemoglobin || null, pcv || null, gestational_age_weeks || null, tt_dose || null]
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

    // Audit log
    await pool.query(
      `INSERT INTO audit_logs (tenant_id, action, table_name, record_id, performed_by, new_data)
       VALUES ($1, 'INSERT', 'vitals', $2, $3, $4)`,
      [tenantId, id, recorded_by || null, JSON.stringify(enriched.rows[0])]
    );

    res.status(201).json(enriched.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// GET /api/vitals/patient/:patientId -- today's vitals for a patient (for the consultation page).
router.get('/api/vitals/patient/:patientId', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const patientId = String(req.params.patientId);

    const result = await pool.query(
      `SELECT v.*, s.name as recorded_by_name, e.encounter_type
       FROM vitals v
       JOIN encounters e ON e.id = v.encounter_id
       LEFT JOIN staff_users s ON s.id = v.recorded_by
       WHERE e.patient_id = $1 AND v.tenant_id = $2 AND v.deleted_at IS NULL
         AND v.created_at::date = CURRENT_DATE
       ORDER BY v.created_at DESC`,
      [patientId, tenantId]
    );

    res.json(result.rows);
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

    const valError = validateVitalRanges(req.body);
    if (valError) {
      res.status(400).json({ error: true, message: valError });
      return;
    }

    const oldSnapshot = JSON.stringify({
      systolic_bp: vital.systolic_bp, diastolic_bp: vital.diastolic_bp, pulse: vital.pulse,
      temperature: vital.temperature, respiration_rate: vital.respiration_rate, weight: vital.weight,
      spo2: vital.spo2, height: vital.height, fetal_heart_rate: vital.fetal_heart_rate,
      fetal_heart_sound: vital.fetal_heart_sound, triage_priority: vital.triage_priority,
      nursing_notes: vital.nursing_notes, fundal_height: vital.fundal_height,
      fetal_presentation: vital.fetal_presentation, urine_protein: vital.urine_protein,
      urine_glucose: vital.urine_glucose, hemoglobin: vital.hemoglobin, pcv: vital.pcv,
      gestational_age_weeks: vital.gestational_age_weeks, tt_dose: vital.tt_dose,
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
        fundal_height = COALESCE($13, fundal_height), fetal_presentation = COALESCE($14, fetal_presentation),
        urine_protein = COALESCE($15, urine_protein), urine_glucose = COALESCE($16, urine_glucose),
        hemoglobin = COALESCE($17, hemoglobin), pcv = COALESCE($18, pcv),
        gestational_age_weeks = COALESCE($19, gestational_age_weeks), tt_dose = COALESCE($20, tt_dose),
        edited_by = $21, edited_at = NOW(), edit_log = edit_log || $22::jsonb
       WHERE id = $23 RETURNING *`,
      [
        fields.systolic_bp || null, fields.diastolic_bp || null, fields.pulse || null,
        fields.temperature || null, fields.respiration_rate || null, fields.weight || null,
        fields.spo2 || null, fields.height || null, fields.fetal_heart_rate || null,
        fields.fetal_heart_sound || null, fields.triage_priority || null, fields.nursing_notes || null,
        fields.fundal_height || null, fields.fetal_presentation || null, fields.urine_protein || null,
        fields.urine_glucose || null, fields.hemoglobin || null, fields.pcv || null,
        fields.gestational_age_weeks || null, fields.tt_dose || null,
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

    // Audit log
    await pool.query(
      `INSERT INTO audit_logs (tenant_id, action, table_name, record_id, performed_by, old_data)
       VALUES ($1, 'DELETE', 'vitals', $2, $3, $4)`,
      [vital.tenant_id, id, deleted_by || null, JSON.stringify(vital)]
    );

    res.json({ ok: true, message: 'Vitals deleted successfully' });
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

export default router;
