import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import pool from '../db/pool';
import { readClinicProfile } from '../config/reader';
import {
  FHP_TEMPLATE_VERSION,
  FHP_PATTERNS,
  FHP_PATTERN_CODES,
  FHP_STATUSES,
  FHP_ASSESSMENT_TYPES,
} from '../utils/fhpTemplate';

const router = Router();

function getTenantId(): string {
  return readClinicProfile().GLOBAL_SAAS_TENANT_ID;
}

// The template is the single source of truth for the client form.
router.get('/api/fhp/template', (_req: Request, res: Response) => {
  res.json({ version: FHP_TEMPLATE_VERSION, patterns: FHP_PATTERNS });
});

async function loadAssessment(tenantId: string, assessmentId: string) {
  const header = await pool.query(
    `SELECT fa.*, s.name AS assessed_by_name
       FROM fhp_assessments fa
       LEFT JOIN staff_users s ON s.id = fa.assessed_by
      WHERE fa.id = $1 AND fa.tenant_id = $2`,
    [assessmentId, tenantId]
  );
  if (header.rows.length === 0) return null;
  const findings = await pool.query(
    `SELECT * FROM fhp_findings WHERE assessment_id = $1 ORDER BY pattern_code`,
    [assessmentId]
  );
  return { ...header.rows[0], findings: findings.rows };
}

// All FHP assessments recorded for one admission (newest first).
router.get('/api/admissions/:id/fhp', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const admissionId = String(req.params.id);
    const list = await pool.query(
      `SELECT fa.*, s.name AS assessed_by_name
         FROM fhp_assessments fa
         LEFT JOIN staff_users s ON s.id = fa.assessed_by
        WHERE fa.tenant_id = $1 AND fa.admission_id = $2
        ORDER BY fa.assessed_at DESC`,
      [tenantId, admissionId]
    );
    if (list.rows.length === 0) { res.json([]); return; }
    const ids = list.rows.map((r: any) => r.id);
    const findings = await pool.query(
      `SELECT * FROM fhp_findings WHERE assessment_id = ANY($1::uuid[]) ORDER BY pattern_code`,
      [ids]
    );
    const byAssessment = new Map<string, any[]>();
    for (const f of findings.rows) {
      if (!byAssessment.has(f.assessment_id)) byAssessment.set(f.assessment_id, []);
      byAssessment.get(f.assessment_id)!.push(f);
    }
    res.json(list.rows.map((a: any) => ({ ...a, findings: byAssessment.get(a.id) || [] })));
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// The most recent assessment for one admission (the one to resume/view).
router.get('/api/admissions/:id/fhp/latest', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const admissionId = String(req.params.id);
    const latest = await pool.query(
      `SELECT id FROM fhp_assessments
        WHERE tenant_id = $1 AND admission_id = $2
        ORDER BY assessed_at DESC LIMIT 1`,
      [tenantId, admissionId]
    );
    if (latest.rows.length === 0) { res.json(null); return; }
    res.json(await loadAssessment(tenantId, latest.rows[0].id));
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// Create a new assessment, or update the existing draft in place. Writing is
// only allowed while the admission is active; completed assessments are frozen.
router.post('/api/admissions/:id/fhp', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const admissionId = String(req.params.id);
    const body = req.body || {};

    const adm = await pool.query(
      `SELECT id, patient_id, status FROM admissions WHERE id = $1 AND tenant_id = $2`,
      [admissionId, tenantId]
    );
    if (adm.rows.length === 0) {
      res.status(404).json({ error: true, message: 'Admission not found' });
      return;
    }
    if (adm.rows[0].status !== 'active') {
      res.status(409).json({ error: true, message: 'This patient is no longer admitted; the assessment is read-only.' });
      return;
    }
    const patientId = adm.rows[0].patient_id;

    const assessmentType = FHP_ASSESSMENT_TYPES.includes(body.assessment_type) ? body.assessment_type : 'baseline';
    const status = body.status === 'completed' ? 'completed' : 'draft';
    const assessedBy = body.assessed_by || null;
    const summary = body.summary ? String(body.summary) : null;

    const rawFindings: any[] = Array.isArray(body.findings) ? body.findings : [];
    const findings = rawFindings
      .filter((f) => f && FHP_PATTERN_CODES.includes(f.pattern_code))
      .map((f) => ({
        pattern_code: String(f.pattern_code),
        status: FHP_STATUSES.includes(f.status) ? f.status : 'not_assessed',
        responses: f.responses && typeof f.responses === 'object' ? f.responses : {},
        notes: f.notes ? String(f.notes) : null,
        flagged: f.status === 'ineffective' || f.status === 'at_risk',
      }));

    const client = await pool.connect();
    let assessmentId: string;
    try {
      await client.query('BEGIN');

      if (body.assessment_id) {
        const existing = await client.query(
          `SELECT * FROM fhp_assessments WHERE id = $1 AND admission_id = $2 AND tenant_id = $3 FOR UPDATE`,
          [String(body.assessment_id), admissionId, tenantId]
        );
        if (existing.rows.length === 0) {
          await client.query('ROLLBACK');
          res.status(404).json({ error: true, message: 'Assessment not found for this admission' });
          return;
        }
        if (existing.rows[0].status === 'completed') {
          await client.query('ROLLBACK');
          res.status(409).json({ error: true, message: 'Completed assessments are read-only' });
          return;
        }
        assessmentId = existing.rows[0].id;
        await client.query(
          `UPDATE fhp_assessments
              SET assessment_type = $1, status = $2, summary = $3, assessed_by = $4,
                  assessed_at = NOW(), completed_at = ${status === 'completed' ? 'NOW()' : 'completed_at'}
            WHERE id = $5`,
          [assessmentType, status, summary, assessedBy, assessmentId]
        );
      } else {
        assessmentId = uuidv4();
        await client.query(
          `INSERT INTO fhp_assessments
             (id, tenant_id, admission_id, patient_id, assessment_type, template_version, status, summary, assessed_by, assessed_at, completed_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), ${status === 'completed' ? 'NOW()' : 'NULL'})`,
          [assessmentId, tenantId, admissionId, patientId, assessmentType, FHP_TEMPLATE_VERSION, status, summary, assessedBy]
        );
      }

      // Replace this assessment's findings (drafts are fully editable).
      await client.query(`DELETE FROM fhp_findings WHERE assessment_id = $1`, [assessmentId]);
      for (const f of findings) {
        await client.query(
          `INSERT INTO fhp_findings (id, tenant_id, assessment_id, pattern_code, status, responses, notes, flagged)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [uuidv4(), tenantId, assessmentId, f.pattern_code, f.status, JSON.stringify(f.responses), f.notes, f.flagged]
        );
      }

      await client.query(
        `INSERT INTO audit_logs (tenant_id, action, table_name, record_id, performed_by, new_data)
         VALUES ($1, $2, 'fhp_assessments', $3, $4, $5)`,
        [tenantId, body.assessment_id ? 'UPDATE' : 'CREATE', assessmentId, assessedBy, JSON.stringify({ admission_id: admissionId, assessment_type: assessmentType, status })]
      );

      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    res.status(201).json(await loadAssessment(tenantId, assessmentId));
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// Nurse dashboard: active admissions with their FHP baseline / last assessment
// and the number of unresolved concerns, so the roster can flag what is due.
router.get('/api/nurse-dashboard/fhp', async (_req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const result = await pool.query(
      `SELECT a.id AS admission_id, a.patient_id, a.ward_id, a.admitted_at,
              w.name AS ward_name, p.full_name AS patient_name, p.hospital_number,
              (SELECT MAX(fa.assessed_at) FROM fhp_assessments fa
                WHERE fa.admission_id = a.id AND fa.assessment_type = 'baseline' AND fa.status = 'completed') AS baseline_at,
              (SELECT MAX(fa.assessed_at) FROM fhp_assessments fa
                WHERE fa.admission_id = a.id AND fa.status = 'completed') AS last_assessed_at,
              (SELECT COUNT(*)::int FROM fhp_findings ff
                 JOIN fhp_assessments fa2 ON fa2.id = ff.assessment_id
                WHERE fa2.admission_id = a.id AND ff.flagged = true) AS concerns
         FROM admissions a
         JOIN wards w ON w.id = a.ward_id
         JOIN patients p ON p.id = a.patient_id
        WHERE a.tenant_id = $1 AND a.status = 'active' AND p.folder_activated IS DISTINCT FROM false
        ORDER BY a.admitted_at DESC`,
      [tenantId]
    );
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

export default router;
