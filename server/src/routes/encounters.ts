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
    const { patient_id, encounter_type, maternity_patient_id } = req.query;
    let query = `SELECT e.*, s.name as staff_name, d.name as department_name
                 FROM encounters e
                 LEFT JOIN staff_users s ON s.id = e.staff_id
                 LEFT JOIN departments d ON d.id = e.department_id
                 WHERE e.tenant_id = $1`;
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
    if (maternity_patient_id) {
      query += ` AND e.maternity_patient_id = $${paramIndex}`;
      params.push(maternity_patient_id);
      paramIndex++;
    }

    query += ' ORDER BY e.created_at DESC';

    const result = await pool.query(query, params);

    // Attach SOAP notes to each encounter
    const encIds = result.rows.map((e: any) => e.id);
    const notesByEnc: Record<string, any[]> = {};
    if (encIds.length > 0) {
      const notesResult = await pool.query(
        `SELECT n.*, s.name as staff_name, s.role as staff_role
         FROM encounter_notes n
         LEFT JOIN staff_users s ON s.id = n.staff_id
         WHERE n.tenant_id = $1 AND n.encounter_id = ANY($2::uuid[])
         ORDER BY n.created_at ASC`,
        [tenantId, encIds]
      );
      for (const n of notesResult.rows) {
        if (!notesByEnc[n.encounter_id]) notesByEnc[n.encounter_id] = [];
        notesByEnc[n.encounter_id].push(n);
      }
    }
    const rowsWithNotes = result.rows.map((e: any) => ({ ...e, notes: notesByEnc[e.id] || [] }));

    res.json(rowsWithNotes);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.get('/api/encounters/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const { id } = req.params;

    const result = await pool.query(
      `SELECT e.*, d.name as department_name, s.name as staff_name, s.role as staff_role
       FROM encounters e
       LEFT JOIN departments d ON d.id = e.department_id
       LEFT JOIN staff_users s ON s.id = e.staff_id
       WHERE e.id = $1 AND e.tenant_id = $2`,
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
    const { patient_id, encounter_type, chief_complaint, soap_notes, staff_id, diagnoses, maternity_patient_id, is_consultation, referral_id, department_id } = req.body;

    if (!patient_id || !encounter_type) {
      res.status(400).json({ error: true, message: 'patient_id and encounter_type are required' });
      return;
    }

    // Prevent consulting a referral that is still pending (must be accepted first)
    if (referral_id) {
      const refCheck = await pool.query(
        `SELECT status FROM referrals WHERE id = $1 AND tenant_id = $2`,
        [referral_id, tenantId]
      );
      if (refCheck.rows.length === 0) {
        res.status(404).json({ error: true, message: 'Referral not found' });
        return;
      }
      if (refCheck.rows[0].status === 'pending') {
        res.status(400).json({ error: true, message: 'Accept the referral before consulting' });
        return;
      }
    }

    const id = uuidv4();
    const result = await pool.query(
      `INSERT INTO encounters (id, tenant_id, patient_id, staff_id, encounter_type, chief_complaint, soap_notes, diagnoses, maternity_patient_id, is_consultation, referral_id, department_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [id, tenantId, patient_id, staff_id || null, encounter_type, chief_complaint || null, soap_notes ? JSON.stringify(soap_notes) : null, diagnoses ? JSON.stringify(diagnoses) : null, maternity_patient_id || null, is_consultation ? true : false, referral_id || null, department_id || null]
    );

    // Audit log INSERT
    await pool.query(
      `INSERT INTO audit_logs (tenant_id, action, table_name, record_id, performed_by, new_data)
       VALUES ($1, 'INSERT', 'encounters', $2, $3, $4)`,
      [tenantId, id, staff_id || null, JSON.stringify(result.rows[0])]
    );

    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// POST /api/encounters/ensure -- find-or-create today's encounter for a staff+patient+type.
// Groups the whole day's work under one encounter (no overwrite, no duplicates on reload).
router.post('/api/encounters/ensure', async (req: Request, res: Response) => {
  try {
    await clockGuard(pool, 'encounters');

    const tenantId = getTenantId();
    const { patient_id, encounter_type, staff_id, maternity_patient_id, is_consultation, referral_id, department_id } = req.body;

    if (!patient_id || !encounter_type) {
      res.status(400).json({ error: true, message: 'patient_id and encounter_type are required' });
      return;
    }

    let existingId: string | null = null;

    if (referral_id) {
      // Consultant consultations group by referral (one encounter per referral).
      const refEnc = await pool.query(
        `SELECT id FROM encounters
         WHERE tenant_id = $1 AND referral_id = $2 AND is_consultation = true
         ORDER BY created_at DESC LIMIT 1`,
        [tenantId, referral_id]
      );
      existingId = refEnc.rows[0]?.id || null;
    } else if (maternity_patient_id) {
      // Maternity consultations group by maternity patient.
      const matEnc = await pool.query(
        `SELECT id FROM encounters
         WHERE tenant_id = $1 AND patient_id = $2 AND staff_id = $3 AND encounter_type = $4
           AND maternity_patient_id = $5
           AND created_at::date = CURRENT_DATE
         ORDER BY created_at DESC LIMIT 1`,
        [tenantId, patient_id, staff_id || null, encounter_type, maternity_patient_id]
      );
      existingId = matEnc.rows[0]?.id || null;
    } else {
      // Normal doctor / consultant consultations group by patient + staff + type + day.
      const dayEnc = await pool.query(
        `SELECT id FROM encounters
         WHERE tenant_id = $1 AND patient_id = $2 AND staff_id = $3 AND encounter_type = $4
           AND COALESCE(is_consultation, false) = $5
           AND created_at::date = CURRENT_DATE
         ORDER BY created_at DESC LIMIT 1`,
        [tenantId, patient_id, staff_id || null, encounter_type, is_consultation ? true : false]
      );
      existingId = dayEnc.rows[0]?.id || null;
    }

    if (existingId) {
      res.json({ id: existingId, created: false });
      return;
    }

    // No existing encounter today → create a new one.
    const id = uuidv4();
    const result = await pool.query(
      `INSERT INTO encounters (id, tenant_id, patient_id, staff_id, encounter_type, chief_complaint, soap_notes, diagnoses, maternity_patient_id, is_consultation, referral_id, department_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [id, tenantId, patient_id, staff_id || null, encounter_type, null, null, null, maternity_patient_id || null, is_consultation ? true : false, referral_id || null, department_id || null]
    );

    await pool.query(
      `INSERT INTO audit_logs (tenant_id, action, table_name, record_id, performed_by, new_data)
       VALUES ($1, 'INSERT', 'encounters', $2, $3, $4)`,
      [tenantId, id, staff_id || null, JSON.stringify(result.rows[0])]
    );

    res.status(201).json({ id, created: true });
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// GET /api/encounter-notes?encounter_id=... -- list SOAP notes for an encounter
router.get('/api/encounter-notes', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const { encounter_id, patient_id } = req.query;
    let query = `SELECT n.*, s.name as staff_name, s.role as staff_role
                 FROM encounter_notes n
                 LEFT JOIN staff_users s ON s.id = n.staff_id
                 WHERE n.tenant_id = $1`;
    const params: any[] = [tenantId];
    let idx = 2;
    if (encounter_id) {
      query += ` AND n.encounter_id = $${idx}`;
      params.push(encounter_id);
      idx++;
    }
    if (patient_id) {
      query += ` AND n.encounter_id IN (SELECT id FROM encounters WHERE patient_id = $${idx} AND tenant_id = $1)`;
      params.push(patient_id);
      idx++;
    }
    query += ' ORDER BY n.created_at ASC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// POST /api/encounter-notes -- append a new SOAP note under an encounter
router.post('/api/encounter-notes', async (req: Request, res: Response) => {
  try {
    await clockGuard(pool, 'encounter_notes');
    const tenantId = getTenantId();
    const { encounter_id, staff_id, chief_complaint, soap_notes, diagnoses } = req.body;

    if (!encounter_id) {
      res.status(400).json({ error: true, message: 'encounter_id is required' });
      return;
    }

    // Verify the encounter belongs to this tenant
    const encCheck = await pool.query(
      `SELECT id FROM encounters WHERE id = $1 AND tenant_id = $2`,
      [encounter_id, tenantId]
    );
    if (encCheck.rows.length === 0) {
      res.status(404).json({ error: true, message: 'Encounter not found' });
      return;
    }

    const id = uuidv4();
    const result = await pool.query(
      `INSERT INTO encounter_notes (id, tenant_id, encounter_id, staff_id, chief_complaint, soap_notes, diagnoses)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [id, tenantId, encounter_id, staff_id || null, chief_complaint || null, soap_notes ? JSON.stringify(soap_notes) : null, diagnoses ? JSON.stringify(diagnoses) : null]
    );

    await pool.query(
      `INSERT INTO audit_logs (tenant_id, action, table_name, record_id, performed_by, new_data)
       VALUES ($1, 'INSERT', 'encounter_notes', $2, $3, $4)`,
      [tenantId, id, staff_id || null, JSON.stringify(result.rows[0])]
    );

    // Keep the encounter's soap_notes/diagnoses in sync with the latest note
    // so existing chart code that reads encounter.soap_notes still works.
    await pool.query(
      `UPDATE encounters SET soap_notes = $1, diagnoses = $2, chief_complaint = COALESCE($3, chief_complaint)
       WHERE id = $4 AND tenant_id = $5`,
      [soap_notes ? JSON.stringify(soap_notes) : null, diagnoses ? JSON.stringify(diagnoses) : null, chief_complaint || null, encounter_id, tenantId]
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
    const { encounter_type, chief_complaint, soap_notes, diagnoses, is_consultation, referral_id, department_id } = req.body;

    const result = await pool.query(
      `UPDATE encounters SET
        encounter_type = COALESCE($1, encounter_type),
        chief_complaint = COALESCE($2, chief_complaint),
        soap_notes = COALESCE($3, soap_notes),
        diagnoses = COALESCE($4, diagnoses),
        is_consultation = CASE WHEN $5::boolean IS NULL THEN is_consultation ELSE $5::boolean END,
        referral_id = COALESCE($6, referral_id),
        department_id = COALESCE($7, department_id)
       WHERE id = $8 AND tenant_id = $9
       RETURNING *`,
      [encounter_type || null, chief_complaint || null, soap_notes ? JSON.stringify(soap_notes) : null, diagnoses ? JSON.stringify(diagnoses) : null, is_consultation === undefined || is_consultation === null ? null : is_consultation, referral_id || null, department_id || null, id, tenantId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: true, message: 'Encounter not found' });
      return;
    }

    // Audit log UPDATE — get old data first
    const oldEnc = await pool.query('SELECT * FROM encounters WHERE id = $1', [id]);
    if (oldEnc.rows.length > 0) {
      await pool.query(
        `INSERT INTO audit_logs (tenant_id, action, table_name, record_id, performed_by, old_data, new_data)
         VALUES ($1, 'UPDATE', 'encounters', $2, $3, $4, $5)`,
        [tenantId, id, req.body.staff_id || null, JSON.stringify(oldEnc.rows[0]), JSON.stringify(result.rows[0])]
      );
    }

    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

export default router;
