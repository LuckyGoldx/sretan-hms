import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import pool from '../db/pool';
import { readClinicProfile } from '../config/reader';

const router = Router();

function getTenantId(): string {
  return readClinicProfile().GLOBAL_SAAS_TENANT_ID;
}

// ── Nurse Notes ──
router.get('/api/nurse-notes', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const { patient_id, note_type } = req.query;
    let query = `SELECT nn.*, s.name as staff_name FROM nurse_notes nn
                 LEFT JOIN staff_users s ON s.id = nn.staff_id
                 WHERE nn.tenant_id = $1`;
    const params: any[] = [tenantId];
    let idx = 2;

    if (patient_id) { query += ` AND nn.patient_id = $${idx}`; params.push(patient_id); idx++; }
    if (note_type) { query += ` AND nn.note_type = $${idx}`; params.push(note_type); idx++; }

    query += ' ORDER BY nn.created_at DESC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err: any) { res.status(500).json({ error: true, message: err.message }); }
});

router.post('/api/nurse-notes/:id/view', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { viewed_by } = req.body;
    if (!viewed_by) { res.status(400).json({ error: true, message: 'viewed_by is required' }); return; }
    await pool.query(
      `INSERT INTO clinical_note_views (note_id, viewed_by) VALUES ($1, $2)
       ON CONFLICT (note_id, viewed_by) DO NOTHING`,
      [id, viewed_by]
    );
    res.json({ ok: true });
  } catch (err: any) { res.status(500).json({ error: true, message: err.message }); }
});

router.get('/api/nurse-notes', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const { patient_id, note_type } = req.query;
    let query = `SELECT nn.*, s.name as staff_name,
                  (SELECT COUNT(*) FROM clinical_note_views cnv WHERE cnv.note_id = nn.id) as view_count,
                  (SELECT jsonb_agg(jsonb_build_object('name', su.name, 'viewed_at', cnv.viewed_at))
                   FROM clinical_note_views cnv
                   LEFT JOIN staff_users su ON su.id = cnv.viewed_by
                   WHERE cnv.note_id = nn.id) as viewers
                 FROM nurse_notes nn
                 LEFT JOIN staff_users s ON s.id = nn.staff_id
                 WHERE nn.tenant_id = $1`;
    const params: any[] = [tenantId];
    let idx = 2;
    if (patient_id) { query += ` AND nn.patient_id = $${idx}`; params.push(patient_id); idx++; }
    if (note_type) { query += ` AND nn.note_type = $${idx}`; params.push(note_type); idx++; }
    query += ' ORDER BY nn.created_at DESC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err: any) { res.status(500).json({ error: true, message: err.message }); }
});

router.post('/api/nurse-notes', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const { patient_id, staff_id, note_type, content } = req.body;
    if (!patient_id || !content) { res.status(400).json({ error: true, message: 'patient_id and content are required' }); return; }
    const id = uuidv4();
    const result = await pool.query(
      `INSERT INTO nurse_notes (id, tenant_id, patient_id, staff_id, note_type, content) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [id, tenantId, patient_id, staff_id || null, note_type || 'general', content]
    );
    res.status(201).json(result.rows[0]);
  } catch (err: any) { res.status(500).json({ error: true, message: err.message }); }
});

// ── Treatments (parent drug records) ──
router.get('/api/treatments', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const { patient_id } = req.query;
    let query = `SELECT t.*, s.name as staff_name, eb.name as ended_by_name FROM treatments t
                 LEFT JOIN staff_users s ON s.id = t.staff_id
                 LEFT JOIN staff_users eb ON eb.id = t.ended_by
                 WHERE t.tenant_id = $1`;
    const params: any[] = [tenantId];
    let idx = 2;
    if (patient_id) { query += ` AND t.patient_id = $${idx}`; params.push(patient_id); idx++; }
    query += ' ORDER BY t.created_at DESC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err: any) { res.status(500).json({ error: true, message: err.message }); }
});

router.post('/api/treatments', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const { patient_id, staff_id, treatment, dosage, route, frequency, times, notes, start_date } = req.body;
    if (!patient_id || !treatment) { res.status(400).json({ error: true, message: 'patient_id and treatment are required' }); return; }

    // Always create a new standalone treatment entry (client decides course vs new treatment)
    const id = uuidv4();
    const result = await pool.query(
      `INSERT INTO treatments (id, tenant_id, patient_id, staff_id, treatment, status)
       VALUES ($1, $2, $3, $4, $5, 'active') RETURNING *`,
      [id, tenantId, patient_id, staff_id || null, treatment]
    );
    const treatmentId = result.rows[0].id;

    // Create session
    const sessId = uuidv4();
    await pool.query(
      `INSERT INTO treatment_sessions (id, tenant_id, treatment_id, staff_id, dosage, route, frequency, times, notes, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active') RETURNING *`,
      [sessId, tenantId, treatmentId, staff_id || null, dosage || null, route || null, frequency || null, times || null, notes || null]
    );

    // Create doses linked to session
    if (times) {
      const timeList = times.split(',').map((t: string) => t.trim())
      for (const timeStr of timeList) {
        const doseId = uuidv4()
        await pool.query(
          'INSERT INTO treatment_doses (id, treatment_id, session_id, scheduled_time) VALUES ($1, $2, $3, $4)',
          [doseId, treatmentId, sessId, timeStr]
        )
      }
    }

    res.status(201).json({ treatment_id: treatmentId, session_id: sessId });
  } catch (err: any) { res.status(500).json({ error: true, message: err.message }); }
});

router.put('/api/treatments/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status, end_date, ended_by, end_reason } = req.body;
    const result = await pool.query(
      `UPDATE treatments SET status = COALESCE($1, status), end_date = COALESCE($2, end_date), ended_by = COALESCE($3, ended_by), end_reason = COALESCE($4, end_reason) WHERE id = $5 RETURNING *`,
      [status || null, end_date || null, ended_by || null, end_reason || null, id]
    );
    if (result.rows.length === 0) { res.status(404).json({ error: true, message: 'Treatment not found' }); return; }
    const enriched = await pool.query(
      `SELECT t.*, s.name as staff_name, eb.name as ended_by_name FROM treatments t
       LEFT JOIN staff_users s ON s.id = t.staff_id
       LEFT JOIN staff_users eb ON eb.id = t.ended_by
       WHERE t.id = $1`, [id]
    );
    res.json(enriched.rows[0]);
  } catch (err: any) { res.status(500).json({ error: true, message: err.message }); }
});

// ── Treatment Sessions ──
router.get('/api/treatment-sessions', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const { treatment_id } = req.query;
    let query = `SELECT ts.*, s.name as staff_name, eb.name as ended_by_name FROM treatment_sessions ts
                 LEFT JOIN staff_users s ON s.id = ts.staff_id
                 LEFT JOIN staff_users eb ON eb.id = ts.ended_by
                 WHERE ts.tenant_id = $1`;
    const params: any[] = [tenantId];
    let idx = 2;
    if (treatment_id) { query += ` AND ts.treatment_id = $${idx}`; params.push(treatment_id); idx++; }
    query += ' ORDER BY ts.created_at DESC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err: any) { res.status(500).json({ error: true, message: err.message }); }
});

router.post('/api/treatment-sessions', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const { treatment_id, staff_id, dosage, route, frequency, times, notes, change_reason } = req.body;
    if (!treatment_id) { res.status(400).json({ error: true, message: 'treatment_id is required' }); return; }

    // End previous active sessions for this treatment
    await pool.query(
      `UPDATE treatment_sessions SET status = 'ended', end_date = NOW(), end_reason = COALESCE($1, 'Dosage/route changed') WHERE treatment_id = $2 AND status = 'active'`,
      [change_reason || null, treatment_id]
    );

    const sessId = uuidv4();
    await pool.query(
      `INSERT INTO treatment_sessions (id, tenant_id, treatment_id, staff_id, dosage, route, frequency, times, notes, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active') RETURNING *`,
      [sessId, tenantId, treatment_id, staff_id || null, dosage || null, route || null, frequency || null, times || null, notes || null]
    );

    if (times) {
      const timeList = times.split(',').map((t: string) => t.trim())
      for (const timeStr of timeList) {
        const doseId = uuidv4()
        await pool.query(
          'INSERT INTO treatment_doses (id, treatment_id, session_id, scheduled_time) VALUES ($1, $2, $3, $4)',
          [doseId, treatment_id, sessId, timeStr]
        )
      }
    }

    res.status(201).json({ session_id: sessId });
  } catch (err: any) { res.status(500).json({ error: true, message: err.message }); }
});

router.put('/api/treatment-sessions/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status, end_date, ended_by, end_reason, dosage, route, change_reason } = req.body;
    const result = await pool.query(
      `UPDATE treatment_sessions SET
        status = COALESCE($1, status),
        end_date = COALESCE($2, end_date),
        ended_by = COALESCE($3, ended_by),
        end_reason = COALESCE($4, end_reason),
        dosage = COALESCE($5, dosage),
        route = COALESCE($6, route),
        change_log = COALESCE(change_log, '[]'::jsonb) || $7::jsonb
       WHERE id = $8 RETURNING *`,
      [status || null, end_date || null, ended_by || null, end_reason || null, dosage || null, route || null,
       change_reason ? JSON.stringify([{ changed_at: new Date().toISOString(), changed_by: ended_by || null, reason: change_reason }]) : '[]', id]
    );
    if (result.rows.length === 0) { res.status(404).json({ error: true, message: 'Session not found' }); return; }
    res.json(result.rows[0]);
  } catch (err: any) { res.status(500).json({ error: true, message: err.message }); }
});

// ── Treatment Doses ──
router.get('/api/treatment-doses', async (req: Request, res: Response) => {
  try {
    const { treatment_id, session_id } = req.query;
    let query = `SELECT td.*, s.name as administered_by_name FROM treatment_doses td
                 LEFT JOIN staff_users s ON s.id = td.administered_by
                 WHERE 1=1`;
    const params: any[] = [];
    let idx = 1;
    if (treatment_id) { query += ` AND td.treatment_id = $${idx}`; params.push(treatment_id); idx++; }
    if (session_id) { query += ` AND td.session_id = $${idx}`; params.push(session_id); idx++; }
    query += ' ORDER BY td.scheduled_time';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err: any) { res.status(500).json({ error: true, message: err.message }); }
});

router.put('/api/treatment-doses/:id/administer', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { administered_by, notes } = req.body;
    const result = await pool.query(
      `UPDATE treatment_doses SET status = 'administered', administered_at = NOW(), administered_by = $1, notes = $2 WHERE id = $3 RETURNING *`,
      [administered_by || null, notes || null, id]
    );
    if (result.rows.length === 0) { res.status(404).json({ error: true, message: 'Dose not found' }); return; }
    const enriched = await pool.query(
      `SELECT td.*, s.name as administered_by_name FROM treatment_doses td
       LEFT JOIN staff_users s ON s.id = td.administered_by
       WHERE td.id = $1`, [id]
    );
    res.json(enriched.rows[0]);
  } catch (err: any) { res.status(500).json({ error: true, message: err.message }); }
});

router.put('/api/treatment-doses/:id/skip', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { notes, administered_by } = req.body;
    await pool.query(
      `UPDATE treatment_doses SET status = 'skipped', notes = $1, administered_at = NOW(), administered_by = $2 WHERE id = $3`,
      [notes || null, administered_by || null, id]
    );
    const enriched = await pool.query(
      `SELECT td.*, s.name as administered_by_name FROM treatment_doses td
       LEFT JOIN staff_users s ON s.id = td.administered_by
       WHERE td.id = $1`, [id]
    );
    res.json(enriched.rows[0] || { success: true });
  } catch (err: any) { res.status(500).json({ error: true, message: err.message }); }
});

// ── Fluid Sessions ──
router.get('/api/fluid-sessions', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const { patient_id } = req.query;
    let query = `SELECT fs.*, s.name as staff_name,
                 COALESCE((SELECT SUM(intake_ml) FROM fluid_balance WHERE session_id = fs.id), 0) as total_intake,
                 COALESCE((SELECT SUM(output_ml) FROM fluid_balance WHERE session_id = fs.id), 0) as total_output
                 FROM fluid_sessions fs
                 LEFT JOIN staff_users s ON s.id = fs.staff_id
                 WHERE fs.tenant_id = $1`;
    const params: any[] = [tenantId];
    let idx = 2;

    if (patient_id) { query += ` AND fs.patient_id = $${idx}`; params.push(patient_id); idx++; }

    query += ' ORDER BY fs.session_date DESC, fs.created_at DESC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err: any) { res.status(500).json({ error: true, message: err.message }); }
});

router.post('/api/fluid-sessions', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const { patient_id, staff_id, session_date, notes } = req.body;
    if (!patient_id) { res.status(400).json({ error: true, message: 'patient_id is required' }); return; }
    const id = uuidv4();
    const result = await pool.query(
      `INSERT INTO fluid_sessions (id, tenant_id, patient_id, staff_id, session_date, notes)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [id, tenantId, patient_id, staff_id || null, session_date || new Date().toISOString().slice(0, 10), notes || null]
    );
    const staff = await pool.query('SELECT name FROM staff_users WHERE id = $1', [staff_id || null]);
    res.status(201).json({ ...result.rows[0], staff_name: staff.rows[0]?.name || '' });
  } catch (err: any) { res.status(500).json({ error: true, message: err.message }); }
});

// ── Fluid Balance ──
router.get('/api/fluid-balance', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const { patient_id, session_id } = req.query;
    let query = `SELECT fb.*, s.name as staff_name FROM fluid_balance fb
                 LEFT JOIN staff_users s ON s.id = fb.staff_id
                 WHERE fb.tenant_id = $1`;
    const params: any[] = [tenantId];
    let idx = 2;

    if (patient_id) { query += ` AND fb.patient_id = $${idx}`; params.push(patient_id); idx++; }
    if (session_id) { query += ` AND fb.session_id = $${idx}`; params.push(session_id); idx++; }

    query += ' ORDER BY fb.recorded_at DESC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err: any) { res.status(500).json({ error: true, message: err.message }); }
});

router.post('/api/fluid-balance', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const { patient_id, staff_id, fluid_type, intake_ml, output_ml, route: fluidRoute, notes, details, session_id } = req.body;
    if (!patient_id) { res.status(400).json({ error: true, message: 'patient_id is required' }); return; }
    const id = uuidv4();
    const result = await pool.query(
      `INSERT INTO fluid_balance (id, tenant_id, patient_id, staff_id, fluid_type, intake_ml, output_ml, route, notes, details, session_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [id, tenantId, patient_id, staff_id || null, fluid_type || null, intake_ml || 0, output_ml || 0, fluidRoute || null, notes || null, details ? JSON.stringify(details) : null, session_id || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err: any) { res.status(500).json({ error: true, message: err.message }); }
});

export default router;
