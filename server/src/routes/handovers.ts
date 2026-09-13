import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import pool from '../db/pool';
import { readClinicProfile } from '../config/reader';

const router = Router();

function getTenantId(): string {
  return readClinicProfile().GLOBAL_SAAS_TENANT_ID;
}

const NURSE_ROLES = ['Nurse', 'Admin'];
const ACK_ROLES = ['Nurse', 'Admin', 'Doctor', 'Specialist'];

async function notifyHandover(tenantId: string, recipientId: string | null, title: string, message: string, refId: string) {
  if (!recipientId) return;
  try {
    await pool.query(
      `INSERT INTO notifications (tenant_id, recipient_id, type, title, message, ref_table, ref_id)
       VALUES ($1, $2, 'handover', $3, $4, 'handovers', $5)`,
      [tenantId, recipientId, title, message, refId]
    );
  } catch {}
}

function addDateFilter(w: { sql: string; params: any[]; idx: number }, column: string, from: any, to: any) {
  if (from) { w.sql += ` AND ${column} >= $${w.idx}::date`; w.params.push(from); w.idx++; }
  if (to) { w.sql += ` AND ${column} < ($${w.idx}::date + INTERVAL '1 day')`; w.params.push(to); w.idx++; }
}

const RECIPIENTS_SUBQUERY = `(SELECT jsonb_agg(jsonb_build_object('id', hr.id, 'staff_id', hr.staff_id, 'name', su.name, 'acknowledged_at', hr.acknowledged_at) ORDER BY su.name)
   FROM handover_recipients hr LEFT JOIN staff_users su ON su.id = hr.staff_id WHERE hr.handover_id = h.id) AS recipients`;

// Active inpatients for a ward (one row per patient), to auto-capture into a
// new handover.
router.get('/api/handovers/ward-patients', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const wardId = req.query.ward_id ? String(req.query.ward_id) : null;
    const result = await pool.query(
      `SELECT * FROM (
         SELECT DISTINCT ON (a.patient_id)
                a.id AS admission_id, a.patient_id, a.bed_number, a.admitted_at, a.status,
                w.id AS ward_id, w.name AS ward_name,
                p.full_name, p.hospital_number, p.sex, p.dob, p.phone,
                (SELECT MAX(v.created_at) FROM vitals v JOIN encounters e ON e.id = v.encounter_id WHERE e.patient_id = a.patient_id) AS last_vitals_at
           FROM admissions a
           JOIN patients p ON p.id = a.patient_id
           LEFT JOIN wards w ON w.id = a.ward_id
          WHERE a.tenant_id = $1 AND a.status = 'active' ${wardId ? 'AND a.ward_id = $2' : ''}
          ORDER BY a.patient_id, a.admitted_at DESC
       ) q
       ORDER BY q.ward_name, q.bed_number NULLS LAST, q.full_name`,
      wardId ? [tenantId, wardId] : [tenantId]
    );
    res.json(result.rows);
  } catch (err: any) { res.status(500).json({ error: true, message: err.message }); }
});

router.get('/api/handovers/stats', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const staffId = req.query.staff_id ? String(req.query.staff_id) : null;
    const r = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE h.status = 'pending')::int AS pending_total,
         (SELECT COUNT(*)::int FROM handovers h2
            JOIN handover_recipients hr ON hr.handover_id = h2.id AND hr.staff_id = $2 AND hr.acknowledged_at IS NULL
           WHERE h2.tenant_id = $1 AND h2.status = 'pending') AS pending_for_me,
         COUNT(*) FILTER (WHERE h.status = 'acknowledged')::int AS acknowledged_total
       FROM handovers h WHERE h.tenant_id = $1`,
      [tenantId, staffId]
    );
    res.json(r.rows[0]);
  } catch (err: any) { res.status(500).json({ error: true, message: err.message }); }
});

router.get('/api/handovers', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const { ward_id, shift, status, handover_to, handover_from, search, date_from, date_to, page, limit } = req.query;

    const w = { sql: `h.tenant_id = $1`, params: [tenantId] as any[], idx: 2 };
    if (ward_id) { w.sql += ` AND h.ward_id = $${w.idx}`; w.params.push(ward_id); w.idx++; }
    if (shift) { w.sql += ` AND h.shift = $${w.idx}`; w.params.push(shift); w.idx++; }
    if (status) { w.sql += ` AND h.status = $${w.idx}`; w.params.push(status); w.idx++; }
    if (handover_to) { w.sql += ` AND EXISTS (SELECT 1 FROM handover_recipients hr WHERE hr.handover_id = h.id AND hr.staff_id = $${w.idx})`; w.params.push(handover_to); w.idx++; }
    if (handover_from) { w.sql += ` AND h.handover_from = $${w.idx}`; w.params.push(handover_from); w.idx++; }
    if (search) {
      w.sql += ` AND (w.name ILIKE $${w.idx} OR hf.name ILIKE $${w.idx} OR ht.name ILIKE $${w.idx} OR h.general_notes ILIKE $${w.idx})`;
      w.params.push(`%${search}%`); w.idx++;
    }
    addDateFilter(w, 'h.handover_date', date_from, date_to);

    const from = `FROM handovers h
                  LEFT JOIN wards w ON w.id = h.ward_id
                  LEFT JOIN staff_users hf ON hf.id = h.handover_from
                  LEFT JOIN staff_users ht ON ht.id = h.handover_to
                 WHERE ${w.sql}`;
    const select = `SELECT h.*, w.name AS ward_name, hf.name AS from_name, ht.name AS to_name,
                    ${RECIPIENTS_SUBQUERY},
                    (SELECT COUNT(*) FROM handover_patients hp WHERE hp.handover_id = h.id)::int AS patient_count,
                    (SELECT COUNT(*) FROM handover_patients hp WHERE hp.handover_id = h.id AND hp.acknowledged_at IS NOT NULL)::int AS acknowledged_count`;

    const pageNum = parseInt(page as string) || 0;
    const limitNum = parseInt(limit as string) || 20;
    if (pageNum) {
      const countRes = await pool.query(`SELECT COUNT(*)::int AS total ${from}`, w.params);
      const offset = (pageNum - 1) * limitNum;
      const listRes = await pool.query(`${select} ${from} ORDER BY h.handover_date DESC, h.created_at DESC LIMIT $${w.idx++} OFFSET $${w.idx++}`, [...w.params, limitNum, offset]);
      res.json({ rows: listRes.rows, total: countRes.rows[0]?.total || 0, page: pageNum, limit: limitNum });
      return;
    }
    const result = await pool.query(`${select} ${from} ORDER BY h.handover_date DESC, h.created_at DESC LIMIT 200`, w.params);
    res.json(result.rows);
  } catch (err: any) { res.status(500).json({ error: true, message: err.message }); }
});

router.get('/api/handovers/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const hRes = await pool.query(
      `SELECT h.*, w.name AS ward_name, hf.name AS from_name, ht.name AS to_name, ab.name AS acknowledged_by_name,
              ${RECIPIENTS_SUBQUERY}
         FROM handovers h
         LEFT JOIN wards w ON w.id = h.ward_id
         LEFT JOIN staff_users hf ON hf.id = h.handover_from
         LEFT JOIN staff_users ht ON ht.id = h.handover_to
         LEFT JOIN staff_users ab ON ab.id = h.acknowledged_by
        WHERE h.id = $1 AND h.tenant_id = $2`,
      [req.params.id, tenantId]
    );
    if (hRes.rows.length === 0) { res.status(404).json({ error: true, message: 'Handover not found' }); return; }
    const pRes = await pool.query(
      `SELECT hp.*, p.full_name, p.hospital_number, p.sex, p.dob,
              a.bed_number, a.admitted_at,
              ack.name AS acknowledged_by_name
         FROM handover_patients hp
         JOIN patients p ON p.id = hp.patient_id
         LEFT JOIN admissions a ON a.id = hp.admission_id
         LEFT JOIN staff_users ack ON ack.id = hp.acknowledged_by
        WHERE hp.handover_id = $1
        ORDER BY CASE hp.priority WHEN 'critical' THEN 0 WHEN 'watch' THEN 1 ELSE 2 END, p.full_name`,
      [req.params.id]
    );
    res.json({ ...hRes.rows[0], patients: pRes.rows });
  } catch (err: any) { res.status(500).json({ error: true, message: err.message }); }
});

function composeHandoverNote(p: any, header: string): string {
  const lines: string[] = [header];
  if (p.situation) lines.push(`S: ${p.situation}`);
  if (p.background) lines.push(`B: ${p.background}`);
  if (p.assessment) lines.push(`A: ${p.assessment}`);
  if (p.recommendation) lines.push(`R: ${p.recommendation}`);
  if (p.pending_tasks) lines.push(`Pending: ${p.pending_tasks}`);
  if (p.contingency) lines.push(`If/Then: ${p.contingency}`);
  const flags = Array.isArray(p.flags) ? p.flags : [];
  if (flags.length) lines.push(`Flags: ${flags.join(', ')}`);
  if (p.notes) lines.push(`Notes: ${p.notes}`);
  return lines.join('\n');
}

router.post('/api/handovers', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const { ward_id, shift, handover_date, handover_from, handover_to, general_notes, voice_notes, created_by, actor_role, patients } = req.body;
    if (!NURSE_ROLES.includes(String(actor_role || ''))) { res.status(403).json({ error: true, message: 'Only nursing staff can create a handover.' }); return; }
    if (!ward_id) { res.status(400).json({ error: true, message: 'A ward is required.' }); return; }

    const recipientIds: string[] = Array.isArray(handover_to) ? handover_to.filter(Boolean) : (handover_to ? [handover_to] : []);
    const primaryRecipient = recipientIds[0] || null;
    const id = uuidv4();
    const shiftDate = handover_date || new Date().toISOString().slice(0, 10);

    const result = await pool.query(
      `INSERT INTO handovers (id, tenant_id, ward_id, shift, handover_date, handover_from, handover_to, general_notes, created_by, voice_notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [id, tenantId, ward_id, shift || 'morning', shiftDate, handover_from || null, primaryRecipient, general_notes || null, created_by || handover_from || null,
       JSON.stringify(voice_notes && typeof voice_notes === 'object' ? voice_notes : {})]
    );

    for (const rid of recipientIds) {
      await pool.query(
        `INSERT INTO handover_recipients (id, tenant_id, handover_id, staff_id) VALUES ($1,$2,$3,$4)`,
        [uuidv4(), tenantId, id, rid]
      ).catch(() => {});
    }

    const list = Array.isArray(patients) ? patients : [];
    const header = `[Shift handover — ${shift || 'morning'} ${shiftDate}]`;
    for (const p of list) {
      if (!p?.patient_id) continue;
      const pVoice = JSON.stringify(p.voice_notes && typeof p.voice_notes === 'object' ? p.voice_notes : {});
      const hpId = uuidv4();
      await pool.query(
        `INSERT INTO handover_patients (id, tenant_id, handover_id, patient_id, admission_id, priority, flags, situation, background, assessment, recommendation, pending_tasks, contingency, notes, voice_notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [hpId, tenantId, id, p.patient_id, p.admission_id || null, p.priority || 'routine',
         JSON.stringify(Array.isArray(p.flags) ? p.flags : []), p.situation || null, p.background || null,
         p.assessment || null, p.recommendation || null, p.pending_tasks || null, p.contingency || null, p.notes || null, pVoice]
      );
      // Record a handover note on the patient's chart (nurse notes) with the
      // same structured fields, and link it back to the handover entry.
      const noteId = uuidv4();
      try {
        await pool.query(
          `INSERT INTO nurse_notes (id, tenant_id, patient_id, staff_id, note_type, content, priority, flags, situation, background, assessment, recommendation, pending_tasks, contingency, voice_notes)
           VALUES ($1,$2,$3,$4,'handover',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
          [noteId, tenantId, p.patient_id, handover_from || created_by || null, composeHandoverNote(p, header),
           p.priority || null, JSON.stringify(Array.isArray(p.flags) ? p.flags : []),
           p.situation || null, p.background || null, p.assessment || null, p.recommendation || null, p.pending_tasks || null, p.contingency || null, pVoice]
        );
        await pool.query(`UPDATE handover_patients SET chart_note_id = $1 WHERE id = $2`, [noteId, hpId]);
      } catch {}
    }

    for (const rid of recipientIds) {
      await notifyHandover(tenantId, rid, 'Shift handover',
        `A ${shift || 'shift'} handover with ${list.length} patient(s) is awaiting your acknowledgment.`, id);
    }

    res.status(201).json(result.rows[0]);
  } catch (err: any) { res.status(500).json({ error: true, message: err.message }); }
});

router.put('/api/handovers/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const { general_notes, actor_role } = req.body;
    if (!NURSE_ROLES.includes(String(actor_role || ''))) { res.status(403).json({ error: true, message: 'Only nursing staff can edit a handover.' }); return; }
    const existing = await pool.query(`SELECT status FROM handovers WHERE id = $1 AND tenant_id = $2`, [req.params.id, tenantId]);
    if (existing.rows.length === 0) { res.status(404).json({ error: true, message: 'Handover not found' }); return; }
    if (existing.rows[0].status !== 'pending') { res.status(409).json({ error: true, message: 'An acknowledged handover cannot be edited.' }); return; }
    const result = await pool.query(
      `UPDATE handovers SET general_notes = COALESCE($1, general_notes), updated_at = NOW() WHERE id = $2 AND tenant_id = $3 RETURNING *`,
      [general_notes ?? null, req.params.id, tenantId]
    );
    res.json(result.rows[0]);
  } catch (err: any) { res.status(500).json({ error: true, message: err.message }); }
});

router.post('/api/handovers/:id/acknowledge', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const { acknowledged_by, actor_role } = req.body;
    if (!ACK_ROLES.includes(String(actor_role || ''))) { res.status(403).json({ error: true, message: 'You cannot acknowledge this handover.' }); return; }
    const result = await pool.query(
      `UPDATE handovers SET status = 'acknowledged', acknowledged_by = $1, acknowledged_at = NOW(), updated_at = NOW()
        WHERE id = $2 AND tenant_id = $3 RETURNING *`,
      [acknowledged_by || null, req.params.id, tenantId]
    );
    if (result.rows.length === 0) { res.status(404).json({ error: true, message: 'Handover not found' }); return; }
    await pool.query(`UPDATE handover_patients SET acknowledged_by = $1, acknowledged_at = NOW() WHERE handover_id = $2 AND acknowledged_at IS NULL`, [acknowledged_by || null, req.params.id]);
    await pool.query(`UPDATE handover_recipients SET acknowledged_at = NOW(), acknowledged_by = $1 WHERE handover_id = $2 AND staff_id = $1 AND acknowledged_at IS NULL`, [acknowledged_by || null, req.params.id]);
    res.json(result.rows[0]);
  } catch (err: any) { res.status(500).json({ error: true, message: err.message }); }
});

router.post('/api/handovers/:id/patients/:hpId/acknowledge', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const { acknowledged_by, actor_role } = req.body;
    if (!ACK_ROLES.includes(String(actor_role || ''))) { res.status(403).json({ error: true, message: 'You cannot acknowledge this handover.' }); return; }
    const result = await pool.query(
      `UPDATE handover_patients SET acknowledged_by = $1, acknowledged_at = NOW()
        WHERE id = $2 AND tenant_id = $3 RETURNING *`,
      [acknowledged_by || null, req.params.hpId, tenantId]
    );
    if (result.rows.length === 0) { res.status(404).json({ error: true, message: 'Patient handover not found' }); return; }

    // When every patient on the handover has been received, mark the handover
    // acknowledged (and the acknowledging nurse's recipient row).
    const handoverId = result.rows[0].handover_id;
    const remaining = await pool.query(
      `SELECT COUNT(*)::int AS c FROM handover_patients WHERE handover_id = $1 AND acknowledged_at IS NULL`,
      [handoverId]
    );
    if ((remaining.rows[0]?.c || 0) === 0) {
      await pool.query(
        `UPDATE handovers SET status = 'acknowledged', acknowledged_by = $1, acknowledged_at = NOW(), updated_at = NOW() WHERE id = $2`,
        [acknowledged_by || null, handoverId]
      );
      await pool.query(
        `UPDATE handover_recipients SET acknowledged_at = NOW(), acknowledged_by = $1 WHERE handover_id = $2 AND staff_id = $1 AND acknowledged_at IS NULL`,
        [acknowledged_by || null, handoverId]
      );
    }
    res.json(result.rows[0]);
  } catch (err: any) { res.status(500).json({ error: true, message: err.message }); }
});

// Backfill: create the chart handover note for handover patient entries that
// were recorded before chart notes existed (or whose insert failed).
export async function backfillHandoverChartNotes(): Promise<number> {
  const tid = readClinicProfile().GLOBAL_SAAS_TENANT_ID;
  let created = 0;
  // Reconcile: handovers whose every patient has been received should not
  // still show as pending.
  try {
    await pool.query(
      `UPDATE handovers h
          SET status = 'acknowledged', acknowledged_at = COALESCE(h.acknowledged_at, NOW()), updated_at = NOW()
        WHERE h.tenant_id = $1 AND h.status = 'pending'
          AND EXISTS (SELECT 1 FROM handover_patients hp WHERE hp.handover_id = h.id)
          AND NOT EXISTS (SELECT 1 FROM handover_patients hp WHERE hp.handover_id = h.id AND hp.acknowledged_at IS NULL)`,
      [tid]
    );
  } catch {}
  try {
    const result = await pool.query(
      `SELECT hp.id, hp.patient_id, hp.priority, hp.flags, hp.situation, hp.background, hp.assessment,
              hp.recommendation, hp.pending_tasks, hp.contingency, hp.notes, hp.voice_notes,
              h.shift, h.handover_date, h.handover_from, h.created_by
         FROM handover_patients hp
         JOIN handovers h ON h.id = hp.handover_id
        WHERE hp.tenant_id = $1
          AND (hp.chart_note_id IS NULL
               OR NOT EXISTS (SELECT 1 FROM nurse_notes nn WHERE nn.id = hp.chart_note_id))
        ORDER BY hp.created_at ASC`,
      [tid]
    );
    for (const p of result.rows) {
      const header = `[Shift handover — ${p.shift || 'shift'} ${String(p.handover_date || '').slice(0, 10)}]`;
      const noteId = uuidv4();
      try {
        await pool.query(
          `INSERT INTO nurse_notes (id, tenant_id, patient_id, staff_id, note_type, content, priority, flags, situation, background, assessment, recommendation, pending_tasks, contingency, voice_notes)
           VALUES ($1,$2,$3,$4,'handover',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
          [noteId, tid, p.patient_id, p.handover_from || p.created_by || null, composeHandoverNote(p, header),
           p.priority || null, JSON.stringify(Array.isArray(p.flags) ? p.flags : []),
           p.situation || null, p.background || null, p.assessment || null, p.recommendation || null, p.pending_tasks || null, p.contingency || null,
           JSON.stringify(p.voice_notes && typeof p.voice_notes === 'object' ? p.voice_notes : {})]
        );
        await pool.query(`UPDATE handover_patients SET chart_note_id = $1 WHERE id = $2`, [noteId, p.id]);
        created++;
      } catch {}
    }
  } catch {}
  return created;
}

export default router;
