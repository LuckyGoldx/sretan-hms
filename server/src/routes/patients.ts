import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import pool from '../db/pool';
import { readClinicProfile } from '../config/reader';
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
                           AND (pp.end_date IS NULL OR pp.end_date >= CURRENT_DATE) LIMIT 1) as primary_provider
                 FROM patients p`;
    const params: any[] = [tenantId];
    let paramIndex = 2;

    if (doctor_id) {
      query += ` JOIN encounters e ON e.patient_id = p.id AND e.staff_id = $${paramIndex}`;
      params.push(doctor_id);
      paramIndex++;
    }

    query += ' WHERE p.tenant_id = $1';

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
  } catch (err: any) { res.status(500).json({ error: true, message: err.message }); }
});

router.get('/api/patients/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const { id } = req.params;

    const patientResult = await pool.query(
      `SELECT p.*,
              (SELECT pr.name FROM patient_insurance_policies pp JOIN insurance_providers pr ON pp.provider_id = pr.id
               WHERE pp.patient_id = p.id AND pp.is_active = true AND pp.coverage_type = 'primary'
                 AND (pp.end_date IS NULL OR pp.end_date >= CURRENT_DATE) LIMIT 1) as primary_provider
       FROM patients p WHERE p.id = $1 AND p.tenant_id = $2`,
      [id, tenantId]
    );

    if (patientResult.rows.length === 0) {
      res.status(404).json({ error: true, message: 'Patient not found' });
      return;
    }

    const encountersResult = await pool.query(
      'SELECT * FROM encounters WHERE patient_id = $1 AND tenant_id = $2 ORDER BY created_at DESC',
      [id, tenantId]
    );

    res.json({
      ...patientResult.rows[0],
      encounters: encountersResult.rows,
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
    const includeYear = config.hospital_number_include_year !== false;
    const year = new Date().getFullYear();
    const yearPart = includeYear ? `-${year}` : '';
    const pattern = includeYear
      ? `${prefix}-${year}-`
      : `${prefix}-`;
    const seqQuery = includeYear
      ? `SELECT COALESCE(MAX(SUBSTRING(hospital_number FROM '${prefix}-${year}-(\\d+)')::int), 0) + 1 AS next_num FROM patients WHERE hospital_number ~ '^${prefix}-${year}-'`
      : `SELECT COALESCE(MAX(SUBSTRING(hospital_number FROM '${prefix}-(\\d+)')::int), 0) + 1 AS next_num FROM patients WHERE hospital_number ~ '^${prefix}-'`;
    const seqResult = await pool.query(seqQuery);
    const nextNum = seqResult.rows[0]?.next_num || 1;
    const hospitalNumber = `${pattern}${String(nextNum).padStart(5, '0')}`;
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
