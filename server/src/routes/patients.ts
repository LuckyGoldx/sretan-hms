import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import pool from '../db/pool';
import { readClinicProfile } from '../config/reader';
import { generateNumber } from '../utils/numbering';
import { clockGuard } from '../middleware/clockGuard';

const router = Router();

// Auto-create insurance provider + active case when patient has HMO/NHIA/Retainership insurance
async function ensureInsuranceProviderAndCase(patientId: string, insurance: any, insuranceType: any, insuranceSubType: any, tenantId: string, providerCategory?: string): Promise<void> {
  if (!insurance) return
  const insurableTypes = ['HMO', 'NHIA', 'Retainership', '__other__']
  if (!insurableTypes.includes(insurance) && insuranceType) {
    // Custom insurance type name — treat as insurable
  } else if (!insurableTypes.includes(insurance)) return

  const providerName = insurance === '__other__' ? (insuranceSubType || 'Other Insurance') : (insuranceType || insurance)
  if (!providerName || providerName === 'Private') return
  // Skip if providerName is just a category label, not a real insurer name
  const categoryLabels = ['HMO', 'NHIA', 'Retainership', '__other__', '']
  if (categoryLabels.includes(providerName)) return

  // Find or create the provider
  let provResult = await pool.query('SELECT id, code FROM insurance_providers WHERE name = $1', [providerName])
  let providerId: string
  let providerCode: string

  if (provResult.rows.length === 0) {
    providerId = uuidv4()
    providerCode = providerName.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 10) || 'CUSTOM'
    // Ensure unique code
    const existingCode = await pool.query('SELECT id FROM insurance_providers WHERE code = $1', [providerCode])
    if (existingCode.rows.length > 0) providerCode = providerCode + Math.floor(Math.random() * 100)
    const cat = providerCategory || (insurableTypes.includes(insurance) ? insurance : 'Other')
    await pool.query(
      `INSERT INTO insurance_providers (id, tenant_id, name, code, category) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`,
      [providerId, tenantId, providerName, providerCode, cat]
    )
  } else {
    providerId = provResult.rows[0].id
    providerCode = provResult.rows[0].code
  }

  // Check if patient already has an active case for this provider
  const existingCase = await pool.query(
    `SELECT id FROM insurance_cases WHERE patient_id = $1 AND provider_id = $2 AND status = 'active'`,
    [patientId, providerId]
  )
  if (existingCase.rows.length > 0) return // already has active case

  // Generate case number
  const year = new Date().getFullYear()
  const countResult = await pool.query(
    `SELECT COUNT(*)::int as count FROM insurance_cases WHERE case_number LIKE $1`,
    [`${providerCode}-${year}-%`]
  )
  const next = (countResult.rows[0]?.count || 0) + 1
  const caseNumber = `${providerCode}-${year}-${String(next).padStart(5, '0')}`

  await pool.query(
    `INSERT INTO insurance_cases (id, tenant_id, provider_id, patient_id, case_number, status, auto_created, coverage_start_date)
     VALUES ($1, $2, $3, $4, $5, 'active', true, $6)
     ON CONFLICT DO NOTHING`,
    [uuidv4(), tenantId, providerId, patientId, caseNumber, new Date().toISOString().split('T')[0]]
  )
}

function getTenantId(): string {
  return readClinicProfile().GLOBAL_SAAS_TENANT_ID;
}

router.get('/api/patients', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const { status, search, doctor_id } = req.query;
    let query = `SELECT DISTINCT p.*,
                        (SELECT pr.name FROM patient_insurance_policies pp JOIN insurance_providers pr ON pp.provider_id = pr.id
                         WHERE pp.patient_id = p.id AND pp.is_active = true AND pp.coverage_type = 'primary'
                           AND (pp.end_date IS NULL OR pp.end_date >= CURRENT_DATE) LIMIT 1) as primary_provider,
                        (SELECT v.created_at FROM vitals v JOIN encounters ev ON ev.id = v.encounter_id
                         WHERE ev.patient_id = p.id AND ev.tenant_id = $1 ORDER BY v.created_at DESC LIMIT 1) as last_vitals_at,
                        (SELECT s.name FROM vitals v JOIN encounters ev ON ev.id = v.encounter_id JOIN staff_users s ON s.id = v.recorded_by
                         WHERE ev.patient_id = p.id AND ev.tenant_id = $1 ORDER BY v.created_at DESC LIMIT 1) as last_vitals_by,
                        (SELECT e.created_at FROM encounters e JOIN staff_users es ON es.id = e.staff_id
                         WHERE e.patient_id = p.id AND e.tenant_id = $1 AND es.role IN ('Doctor','Consultant') ORDER BY e.created_at DESC LIMIT 1) as last_consultation_at,
                        (SELECT s.name FROM encounters e JOIN staff_users s ON s.id = e.staff_id
                         WHERE e.patient_id = p.id AND e.tenant_id = $1 AND s.role IN ('Doctor','Consultant') ORDER BY e.created_at DESC LIMIT 1) as last_consultation_by,
                        (SELECT s.name FROM staff_users s WHERE s.id = p.assigned_doctor_id) as assigned_doctor_name,
                        (SELECT d.name FROM departments d WHERE d.id = p.department_id) as department_name,
                        (SELECT d.name FROM departments d WHERE d.id = p.last_consulted_department_id) as last_consulted_department_name,
                        (SELECT EXISTS(SELECT 1 FROM visits v
                                       WHERE v.patient_id = p.id AND v.assigned_doctor_id IS NULL
                                         AND v.status = 'waiting' AND v.consultation_status IN ('paid','insurance_authorized'))) as has_paid_consultation
                 FROM patients p`;
    const params: any[] = [tenantId];
    let paramIndex = 2;

    query += ' WHERE p.tenant_id = $1';

    if (doctor_id) {
      query += ` AND (p.assigned_doctor_id = $${paramIndex} OR p.primary_doctor_id = $${paramIndex})`;
      params.push(doctor_id);
      paramIndex++;
    }

    if (status) {
      query += ` AND p.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (search) {
      query += ` AND (p.full_name ILIKE $${paramIndex} OR p.hospital_number ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    query += ' AND p.folder_activated IS DISTINCT FROM false';

    if (search) {
      query += ` AND (p.full_name ILIKE $${paramIndex} OR p.hospital_number::text ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    query += ' ORDER BY p.created_at DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
  });

// GET /api/patients/active -- live activity board for doctors/nurses
router.get('/api/patients/active', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const { since, segment, search, dept } = req.query;

    let sinceFilter = '';
    const params: any[] = [tenantId];
    if (since === '1h') { sinceFilter = ` AND GREATEST(
        COALESCE((SELECT MAX(v.created_at) FROM vitals v JOIN encounters ev ON ev.id = v.encounter_id WHERE ev.patient_id = p.id), '2000-01-01'::timestamptz),
        COALESCE((SELECT MAX(e.created_at) FROM encounters e WHERE e.patient_id = p.id), '2000-01-01'::timestamptz)
      ) >= NOW() - INTERVAL '1 hour'`; }
    else if (since === '24h') { sinceFilter = ` AND GREATEST(
        COALESCE((SELECT MAX(v.created_at) FROM vitals v JOIN encounters ev ON ev.id = v.encounter_id WHERE ev.patient_id = p.id), '2000-01-01'::timestamptz),
        COALESCE((SELECT MAX(e.created_at) FROM encounters e WHERE e.patient_id = p.id), '2000-01-01'::timestamptz)
      ) >= NOW() - INTERVAL '24 hours'`; }
    else if (since === '3d') { sinceFilter = ` AND GREATEST(
        COALESCE((SELECT MAX(v.created_at) FROM vitals v JOIN encounters ev ON ev.id = v.encounter_id WHERE ev.patient_id = p.id), '2000-01-01'::timestamptz),
        COALESCE((SELECT MAX(e.created_at) FROM encounters e WHERE e.patient_id = p.id), '2000-01-01'::timestamptz)
      ) >= NOW() - INTERVAL '3 days'`; }

    let query = `SELECT p.id, p.full_name, p.hospital_number, p.sex, p.dob, p.phone, p.status, p.blood_type, p.created_at,
        (SELECT pr.name FROM patient_insurance_policies pp JOIN insurance_providers pr ON pp.provider_id = pr.id
         WHERE pp.patient_id = p.id AND pp.is_active = true AND pp.coverage_type = 'primary'
           AND (pp.end_date IS NULL OR pp.end_date >= CURRENT_DATE) LIMIT 1) as primary_provider,
        (SELECT v.created_at FROM vitals v JOIN encounters ev ON ev.id = v.encounter_id
         WHERE ev.patient_id = p.id AND ev.tenant_id = $1 ORDER BY v.created_at DESC LIMIT 1) as last_vitals_at,
        (SELECT s.name FROM vitals v JOIN encounters ev ON ev.id = v.encounter_id JOIN staff_users s ON s.id = v.recorded_by
         WHERE ev.patient_id = p.id AND ev.tenant_id = $1 ORDER BY v.created_at DESC LIMIT 1) as last_vitals_by,
        (SELECT e.created_at FROM encounters e JOIN staff_users es ON es.id = e.staff_id
         WHERE e.patient_id = p.id AND e.tenant_id = $1 AND es.role IN ('Doctor','Consultant')
         ORDER BY e.created_at DESC LIMIT 1) as last_consultation_at,
        (SELECT s.name FROM encounters e JOIN staff_users s ON s.id = e.staff_id
         WHERE e.patient_id = p.id AND e.tenant_id = $1 AND s.role IN ('Doctor','Consultant')
         ORDER BY e.created_at DESC LIMIT 1) as last_consultation_by,
        a.id as admission_id, a.ward_id, a.bed_number, w.name as ward_name, a.admitted_at, a.admitted_by,
        ab.name as admitted_by_name,
        GREATEST(
          COALESCE((SELECT MAX(v.created_at) FROM vitals v JOIN encounters ev ON ev.id = v.encounter_id WHERE ev.patient_id = p.id), '2000-01-01'::timestamptz),
          COALESCE((SELECT MAX(e.created_at) FROM encounters e WHERE e.patient_id = p.id), '2000-01-01'::timestamptz)
        ) as last_activity_at
      FROM patients p
      LEFT JOIN LATERAL (
        SELECT a.id, a.ward_id, a.bed_number, a.admitted_at, a.admitted_by, a.status
        FROM admissions a WHERE a.patient_id = p.id AND a.tenant_id = $1 AND a.status = 'active'
        ORDER BY a.admitted_at DESC LIMIT 1
      ) a ON true
      LEFT JOIN wards w ON w.id = a.ward_id
      LEFT JOIN staff_users ab ON ab.id = a.admitted_by
      WHERE p.tenant_id = $1 AND p.folder_activated IS DISTINCT FROM false`;

    let idx = 2;
    if (search) {
      query += ` AND (p.full_name ILIKE $${idx} OR p.hospital_number::text ILIKE $${idx})`;
      params.push(`%${search}%`);
      idx++;
    }
    if (dept) {
      query += ` AND EXISTS (
        SELECT 1 FROM encounters e2 WHERE e2.patient_id = p.id AND e2.department_id = $${idx}
      )`;
      params.push(dept);
      idx++;
    }
    query += sinceFilter;
    // Base "active" restriction only applies to status/admission-based views.
    // Activity-based segments (vitals_today, consulted) return ANY patient with
    // today's activity regardless of current status.
    if (segment === 'vitals_today' || segment === 'consulted') {
      query += ' AND p.status IN (\'checked_in\',\'in_triage\',\'waiting\',\'with_doctor\',\'discharged\')';
    } else {
      query += ' AND (p.status IN (\'checked_in\',\'in_triage\',\'waiting\',\'with_doctor\') OR a.id IS NOT NULL)';
    }
    if (segment === 'admitted') {
      query += ' AND a.id IS NOT NULL';
    } else if (segment === 'vitals_today') {
      query += ` AND EXISTS (
        SELECT 1 FROM vitals v JOIN encounters ev ON ev.id = v.encounter_id
        WHERE ev.patient_id = p.id AND v.created_at >= CURRENT_DATE
      )`;
    } else if (segment === 'consulted') {
      query += ` AND EXISTS (
        SELECT 1 FROM encounters e JOIN staff_users es ON es.id = e.staff_id
        WHERE e.patient_id = p.id AND es.role IN ('Doctor','Consultant') AND e.created_at >= CURRENT_DATE
      )`;
    } else if (segment === 'with_doctor') {
      query += ` AND p.status = 'with_doctor'`;
    } else if (segment === 'waiting') {
      query += ` AND p.status = 'waiting'`;
    } else if (segment === 'in_triage') {
      query += ` AND p.status = 'in_triage'`;
    }

    query += ` ORDER BY last_activity_at DESC NULLS LAST, p.created_at DESC`;
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// GET /api/patients/active/counts -- authoritative per-segment counts for the Active Patients board
router.get('/api/patients/active/counts', async (_req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const result = await pool.query(
      `SELECT
        (SELECT COUNT(*)::int FROM patients p
         WHERE p.tenant_id = $1 AND p.folder_activated IS DISTINCT FROM false
           AND (p.status IN ('checked_in','in_triage','waiting','with_doctor')
                OR EXISTS (SELECT 1 FROM admissions a WHERE a.patient_id = p.id AND a.tenant_id = $1 AND a.status = 'active'))) as all_active,
        (SELECT COUNT(*)::int FROM patients p
         WHERE p.tenant_id = $1 AND p.folder_activated IS DISTINCT FROM false
           AND EXISTS (SELECT 1 FROM admissions a WHERE a.patient_id = p.id AND a.tenant_id = $1 AND a.status = 'active')) as admitted,
        (SELECT COUNT(*)::int FROM patients p
         WHERE p.tenant_id = $1 AND p.folder_activated IS DISTINCT FROM false AND p.status = 'with_doctor') as with_doctor,
        (SELECT COUNT(*)::int FROM patients p
         WHERE p.tenant_id = $1 AND p.folder_activated IS DISTINCT FROM false AND p.status = 'waiting') as waiting,
        (SELECT COUNT(*)::int FROM patients p
         WHERE p.tenant_id = $1 AND p.folder_activated IS DISTINCT FROM false AND p.status = 'in_triage') as in_triage,
        (SELECT COUNT(*)::int FROM patients p
         WHERE p.tenant_id = $1 AND p.folder_activated IS DISTINCT FROM false
           AND EXISTS (SELECT 1 FROM vitals v JOIN encounters ev ON ev.id = v.encounter_id
                       WHERE ev.patient_id = p.id AND v.created_at >= CURRENT_DATE)) as vitals_today,
        (SELECT COUNT(*)::int FROM patients p
         WHERE p.tenant_id = $1 AND p.folder_activated IS DISTINCT FROM false
           AND EXISTS (SELECT 1 FROM encounters e JOIN staff_users es ON es.id = e.staff_id
                       WHERE e.patient_id = p.id AND es.role IN ('Doctor','Consultant') AND e.created_at >= CURRENT_DATE)) as consulted
      `,
      [tenantId]
    );
    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.get('/api/patients/search', async (req: Request, res: Response) => {
  try {
    const { q } = req.query;
    if (!q) { res.json([]); return; }
    const searchTerm = `%${q}%`;
    const result = await pool.query(
      `SELECT p.id, p.full_name, p.hospital_number, p.sex, p.dob, p.phone, p.status, p.blood_type,
              (SELECT pr.name FROM patient_insurance_policies pp JOIN insurance_providers pr ON pp.provider_id = pr.id
               WHERE pp.patient_id = p.id AND pp.is_active = true AND pp.coverage_type = 'primary'
                 AND (pp.end_date IS NULL OR pp.end_date >= CURRENT_DATE) LIMIT 1) as primary_provider
       FROM patients p
       WHERE p.full_name ILIKE $1 OR p.hospital_number ILIKE $1 OR p.phone ILIKE $1
       ORDER BY p.full_name LIMIT 20`,
      [searchTerm]
    );
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.get('/api/patients/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const { id } = req.params;

    const patientResult = await pool.query(
      `SELECT p.*,
              (SELECT pr.name FROM patient_insurance_policies pp JOIN insurance_providers pr ON pp.provider_id = pr.id
               WHERE pp.patient_id = p.id AND pp.is_active = true AND pp.coverage_type = 'primary'
                 AND (pp.end_date IS NULL OR pp.end_date >= CURRENT_DATE) LIMIT 1) as primary_provider,
              (SELECT s.name FROM staff_users s WHERE s.id = p.assigned_doctor_id) as assigned_doctor_name,
              (SELECT d.name FROM departments d WHERE d.id = p.department_id) as department_name,
              (SELECT d.name FROM departments d WHERE d.id = p.last_consulted_department_id) as last_consulted_department_name,
              (SELECT EXISTS(SELECT 1 FROM visits v
                             WHERE v.patient_id = p.id AND v.assigned_doctor_id IS NULL
                               AND v.status = 'waiting' AND v.consultation_status IN ('paid','insurance_authorized'))) as has_paid_consultation
       FROM patients p WHERE p.id = $1 AND p.tenant_id = $2`,
      [id, tenantId]
    );

    if (patientResult.rows.length === 0) {
      res.status(404).json({ error: true, message: 'Patient not found' });
      return;
    }

    const encountersResult = await pool.query(
      `SELECT e.*, d.name as department_name, s.name as staff_name, s.role as staff_role
       FROM encounters e
       LEFT JOIN departments d ON d.id = e.department_id
       LEFT JOIN staff_users s ON s.id = e.staff_id
       WHERE e.patient_id = $1 AND e.tenant_id = $2 ORDER BY e.created_at DESC`,
      [id, tenantId]
    );

    // Attach SOAP notes to each encounter (multiple notes per encounter possible)
    const encIds = encountersResult.rows.map((e: any) => e.id);
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
    const encountersWithNotes = encountersResult.rows.map((e: any) => ({
      ...e,
      notes: notesByEnc[e.id] || [],
    }));

    res.json({
      ...patientResult.rows[0],
      encounters: encountersWithNotes,
    });
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.post('/api/patients', async (req: Request, res: Response) => {
  try {
    await clockGuard(pool, 'patients');

    const { full_name, dob, sex, phone, next_of_kin, next_of_kin_phone, insurance, blood_type, status, email, address, emergency_contact_name, emergency_contact_phone, occupation, marital_status, nationality, state_of_origin, lga, next_of_kin_address, relationship, insurance_type, insurance_sub_type, tribe, religion, edited_by, policy_provider_id, policy_number, coverage_type, co_pay_percentage } = req.body;
    const tenantId = getTenantId();

    if (!full_name || !dob || !sex) {
      res.status(400).json({ error: true, message: 'Required fields: full_name, dob, sex' });
      return;
    }

    const id = uuidv4();
    const config = readClinicProfile();
    const prefix = config.hospital_number_prefix || 'SRT';
    const hospitalNumber = await generateNumber(tenantId, 'hospital', { prefix });
    const result = await pool.query(
      `INSERT INTO patients (id, tenant_id, hospital_number, full_name, dob, sex, phone, next_of_kin, next_of_kin_phone, insurance, blood_type, status, email, address, emergency_contact_name, emergency_contact_phone, occupation, marital_status, nationality, state_of_origin, lga, next_of_kin_address, relationship, insurance_type, insurance_sub_type, tribe, religion)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27)
       RETURNING *`,
      [id, tenantId, hospitalNumber, full_name, dob, sex, phone || null, next_of_kin || null, next_of_kin_phone || null, insurance || null, blood_type || null, status || 'checked_in', email || null, address || null, emergency_contact_name || null, emergency_contact_phone || null, occupation || null, marital_status || null, nationality || null, state_of_origin || null, lga || null, next_of_kin_address || null, relationship || null, insurance_type || null, insurance_sub_type || null, tribe || null, religion || null]
    );

    // Create insurance policy if provider selected during registration
    if (policy_provider_id && insurance_type) {
      const covType = coverage_type || 'primary';
      // Demote any existing primary for this patient
      if (covType === 'primary') {
        await pool.query(
          'UPDATE patient_insurance_policies SET coverage_type = $1 WHERE patient_id = $2 AND coverage_type = $3',
          ['secondary', id, 'primary']
        );
      }
      // Inherit co-pay from provider if not set
      let finalCoPay = co_pay_percentage ? parseFloat(co_pay_percentage) : null;
      if (finalCoPay === null) {
        const provConfig = await pool.query(
          'SELECT percentage_value FROM insurance_provider_co_pay_config WHERE provider_id = $1 AND is_active = true LIMIT 1',
          [policy_provider_id]
        );
        if (provConfig.rows.length > 0) finalCoPay = parseFloat(provConfig.rows[0].percentage_value) || 0;
        else finalCoPay = 0;
      }
      await pool.query(
        `INSERT INTO patient_insurance_policies (id, tenant_id, patient_id, provider_id, policy_number, coverage_type, co_pay_percentage)
         VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT DO NOTHING`,
        [uuidv4(), tenantId, id, policy_provider_id, policy_number || insurance_sub_type || '', covType, finalCoPay]
      );
    }

    // Auto-create insurance provider + case if patient has insurance (legacy flow)
    await ensureInsuranceProviderAndCase(id, (insurance || '') as string, (insurance_type || '') as string, (insurance_sub_type || '') as string, tenantId, insurance as string);

    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.put('/api/patients/:id', async (req: Request, res: Response) => {
  try {
    await clockGuard(pool, 'patients');

    const tenantId = getTenantId();
    const { id } = req.params;
    const { full_name, dob, sex, phone, next_of_kin, next_of_kin_phone, insurance, blood_type, status, email, address, emergency_contact_name, emergency_contact_phone, occupation, marital_status, nationality, state_of_origin, lga, next_of_kin_address, relationship, insurance_type, insurance_sub_type, tribe, religion, edited_by } = req.body;

    const existing = await pool.query(
      'SELECT * FROM patients WHERE id = $1 AND tenant_id = $2',
      [id, tenantId]
    );

    if (existing.rows.length === 0) {
      res.status(404).json({ error: true, message: 'Patient not found' });
      return;
    }

    const result = await pool.query(
      `UPDATE patients SET
        full_name = COALESCE($1, full_name), dob = COALESCE($2, dob), sex = COALESCE($3, sex),
        phone = COALESCE($4, phone), next_of_kin = COALESCE($5, next_of_kin),
        next_of_kin_phone = COALESCE($6, next_of_kin_phone),
        insurance = COALESCE($7, insurance), blood_type = COALESCE($8, blood_type),
        status = COALESCE($9, status), email = COALESCE($10, email),
        address = COALESCE($11, address), emergency_contact_name = COALESCE($12, emergency_contact_name),
        emergency_contact_phone = COALESCE($13, emergency_contact_phone),
        occupation = COALESCE($14, occupation), marital_status = COALESCE($15, marital_status),
        nationality = COALESCE($16, nationality), state_of_origin = COALESCE($17, state_of_origin),
        lga = COALESCE($18, lga), next_of_kin_address = COALESCE($19, next_of_kin_address),
        relationship = COALESCE($20, relationship), insurance_type = COALESCE($21, insurance_type),
        insurance_sub_type = COALESCE($22, insurance_sub_type),
        tribe = COALESCE($23, tribe), religion = COALESCE($24, religion)
       WHERE id = $25 AND tenant_id = $26
       RETURNING *`,
      [full_name || null, dob || null, sex || null, phone || null, next_of_kin || null, next_of_kin_phone || null, insurance || null, blood_type || null, status || null, email || null, address || null, emergency_contact_name || null, emergency_contact_phone || null, occupation || null, marital_status || null, nationality || null, state_of_origin || null, lga || null, next_of_kin_address || null, relationship || null, insurance_type || null, insurance_sub_type || null, tribe || null, religion || null, id, tenantId]
    );

    var oldData: any = existing.rows[0];

    // Auto-create insurance provider + case if insurance info changed
    var insVal = insurance ? String(insurance) : oldData.insurance ? String(oldData.insurance) : '';
    var insTypeVal = insurance_type ? String(insurance_type) : oldData.insurance_type ? String(oldData.insurance_type) : '';
    var insSubVal = insurance_sub_type ? String(insurance_sub_type) : oldData.insurance_sub_type ? String(oldData.insurance_sub_type) : '';
    if (insVal || insTypeVal) {
      // @ts-ignore
      await ensureInsuranceProviderAndCase(id, insVal, insTypeVal, insSubVal, tenantId, insVal);
    }

    // Audit log
    var newData = result.rows[0];
    var changed: any = {};
    function norm(v: any): string {
      if (v instanceof Date) return v.getFullYear() + '-' + String(v.getMonth() + 1).padStart(2, '0') + '-' + String(v.getDate()).padStart(2, '0');
      if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.substring(0, 10);
      return String(v);
    }
    for (var key of Object.keys(newData)) {
      if (norm(oldData[key]) !== norm(newData[key])) changed[key] = { old: oldData[key], new: newData[key] };
    }
    if (Object.keys(changed).length > 0) {
      var aid = uuidv4();
      await pool.query(
        'INSERT INTO audit_logs (id, tenant_id, action, table_name, record_id, old_data, new_data, performed_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
        [aid, tenantId, 'UPDATE', 'patients', id, JSON.stringify(oldData), JSON.stringify(newData), edited_by || null]
      );
    }

    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.delete('/api/patients/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const { id } = req.params;

    const result = await pool.query(
      `UPDATE patients SET status = 'discharged' WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [id, tenantId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: true, message: 'Patient not found' });
      return;
    }

    res.json({ message: 'Patient discharged', patient: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

export default router;
