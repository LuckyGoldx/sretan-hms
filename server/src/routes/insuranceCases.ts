import { Router, Request, Response } from 'express';
import pool from '../db/pool';
import { getInsuranceUser } from '../utils/insuranceAuth';
import { autoSyncClinicalServices } from '../utils/autoSyncServices';
import { readClinicProfile } from '../config/reader';
import { generateNumber } from '../utils/numbering';
import { getCoverageForService, getPatientPrimaryInsurance } from '../utils/coverageLookup';

const router = Router();

function getTenantId(): string {
  return readClinicProfile().GLOBAL_SAAS_TENANT_ID;
}

// Helper: mark a source order as paid so it stops appearing at Paypoint once billed to insurance
async function markSourceOrderAsPaid(serviceType: string, serviceId: string | null): Promise<void> {
  if (!serviceId) return;
  const tableMap: Record<string, string> = {
    prescription: 'prescriptions',
    pharmacy: 'prescriptions',
    lab: 'lab_orders',
    radiology: 'radiology_orders',
    admission: 'admissions',
  };
  const table = tableMap[serviceType];
  if (!table) return;
  try {
    await pool.query(`UPDATE ${table} SET is_paid = true WHERE id = $1`, [serviceId]);
  } catch {}
}

// Helper: generate case number
async function generateCaseNumber(tenantId: string, providerCode: string): Promise<string> {
  return generateNumber(tenantId, 'case', { prefix: providerCode, provider: providerCode });
}

// Helper: generate auth request number
async function generateAuthNumber(tenantId: string): Promise<string> {
  return generateNumber(tenantId, 'auth', { prefix: 'AUTH' });
}

// GET /api/insurance/cases - List cases
router.get('/api/insurance/cases', async (req: Request, res: Response) => {
  try {
    const insuranceUser = getInsuranceUser(req);
    const { provider_id, status, patient_id, search } = req.query;
    let query = `SELECT c.*, p.full_name as patient_name, p.hospital_number,
                        pr.name as provider_name, pr.code as provider_code
                 FROM insurance_cases c
                 LEFT JOIN patients p ON c.patient_id = p.id
                 LEFT JOIN insurance_providers pr ON c.provider_id = pr.id
                 WHERE 1=1`;
    const params: any[] = [];
    let idx = 1;

    // Auto-filter by provider scope for insurance staff with 'own' scope
    if (insuranceUser && insuranceUser.providerId) {
      query += ` AND c.provider_id = $${idx++}`;
      params.push(insuranceUser.providerId);
    }

    if (provider_id) { query += ` AND c.provider_id = $${idx++}`; params.push(provider_id); }
    if (status) { query += ` AND c.status = $${idx++}`; params.push(status); }
    if (patient_id) { query += ` AND c.patient_id = $${idx++}`; params.push(patient_id); }
    if (search) {
      query += ` AND (p.full_name ILIKE $${idx} OR p.hospital_number ILIKE $${idx} OR c.case_number ILIKE $${idx})`;
      params.push(`%${search}%`);
      idx++;
    }
    query += ' ORDER BY c.created_at DESC LIMIT 50';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// GET /api/insurance/cases/:id - Get case detail with services
router.get('/api/insurance/cases/:id', async (req: Request, res: Response) => {
  try {
    const insuranceUser = getInsuranceUser(req);
    let query = `SELECT c.*, p.full_name as patient_name, p.hospital_number, p.dob, p.sex, p.patient_insurance_id,
                        pr.name as provider_name, pr.code as provider_code
                 FROM insurance_cases c
                 LEFT JOIN patients p ON c.patient_id = p.id
                 LEFT JOIN insurance_providers pr ON c.provider_id = pr.id
                 WHERE c.id = $1`;
    const params: any[] = [req.params.id];
    let idx = 2;
    if (insuranceUser && insuranceUser.providerId) {
      query += ` AND c.provider_id = $${idx}`;
      params.push(insuranceUser.providerId);
    }
    const caseResult = await pool.query(query, params);
    if (caseResult.rows.length === 0) {
      res.status(404).json({ error: true, message: 'Case not found' });
      return;
    }

    const c = caseResult.rows[0];

    // Auto-sync completed clinical services into insurance_case_services
    if (c.patient_id) {
      try {
        await autoSyncClinicalServices(String(req.params.id), c.patient_id, c.tenant_id);
      } catch (syncErr) {
        console.error('Auto-sync error:', syncErr);
      }
    }

    const servicesResult = await pool.query(
      `SELECT cs.*, inv.invoice_number
       FROM insurance_case_services cs
       LEFT JOIN insurance_invoices inv ON cs.invoice_id = inv.id
       WHERE cs.case_id = $1 AND cs.status != 'removed' ORDER BY cs.created_at`,
      [req.params.id]
    );

    res.json({ ...caseResult.rows[0], services: servicesResult.rows });
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// GET /api/insurance/cases/patient/:patientId - Get all cases for a patient
router.get('/api/insurance/cases/patient/:patientId', async (req: Request, res: Response) => {
  try {
    const insuranceUser = getInsuranceUser(req);
    let query = `SELECT c.*, pr.name as provider_name, pr.code as provider_code
                 FROM insurance_cases c
                 LEFT JOIN insurance_providers pr ON c.provider_id = pr.id
                 WHERE c.patient_id = $1`;
    const params: any[] = [req.params.patientId];
    if (insuranceUser && insuranceUser.providerId) {
      query += ' AND c.provider_id = $2';
      params.push(insuranceUser.providerId);
    }
    query += ' ORDER BY c.created_at DESC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// POST /api/insurance/cases - Create case
router.post('/api/insurance/cases', async (req: Request, res: Response) => {
  try {
    const { provider_id, patient_id, encounter_id, admission_id, auth_code, coverage_start_date, coverage_end_date, notes, created_by } = req.body;
    if (!provider_id || !patient_id) {
      res.status(400).json({ error: true, message: 'Provider and patient are required' });
      return;
    }

    // Get provider code
    const provResult = await pool.query('SELECT code FROM insurance_providers WHERE id = $1', [provider_id]);
    if (provResult.rows.length === 0) {
      res.status(400).json({ error: true, message: 'Provider not found' });
      return;
    }
    const tenantId = getTenantId();
    const caseNumber = await generateCaseNumber(tenantId, provResult.rows[0].code);
    const id = crypto.randomUUID();

    const result = await pool.query(
      `INSERT INTO insurance_cases (id, tenant_id, provider_id, patient_id, encounter_id, admission_id, case_number, auth_code, coverage_start_date, coverage_end_date, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
      [id, tenantId, provider_id, patient_id, encounter_id || null, admission_id || null, caseNumber, auth_code || null, coverage_start_date || null, coverage_end_date || null, notes || null, created_by || null]
    );

    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// PUT /api/insurance/cases/:id - Update case
router.put('/api/insurance/cases/:id', async (req: Request, res: Response) => {
  try {
    const { status, auth_code, coverage_start_date, coverage_end_date, notes } = req.body;
    const result = await pool.query(
      `UPDATE insurance_cases SET
        status = COALESCE($1, status), auth_code = COALESCE($2, auth_code),
        coverage_start_date = COALESCE($3, coverage_start_date), coverage_end_date = COALESCE($4, coverage_end_date),
        notes = COALESCE($5, notes)
       WHERE id = $6 RETURNING *`,
      [status || null, auth_code || null, coverage_start_date || null, coverage_end_date || null, notes || null, req.params.id]
    );
    if (result.rows.length === 0) { res.status(404).json({ error: true, message: 'Case not found' }); return; }
    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// PUT /api/insurance/cases/:id/void - Void case
router.put('/api/insurance/cases/:id/void', async (req: Request, res: Response) => {
  try {
    const { reason, voided_by } = req.body;
    const result = await pool.query(
      `UPDATE insurance_cases SET status = 'voided', voided_at = NOW(), void_reason = $1, voided_by = $2 WHERE id = $3 AND status = 'active' RETURNING *`,
      [reason || null, voided_by || null, req.params.id]
    );
    if (result.rows.length === 0) { res.status(400).json({ error: true, message: 'Case not found or not active' }); return; }
    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// === SERVICES ===

router.get('/api/insurance/cases/:caseId/services', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT * FROM insurance_case_services WHERE case_id = $1 AND status != 'removed' ORDER BY created_at`,
      [req.params.caseId]
    );
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.post('/api/insurance/cases/:caseId/services', async (req: Request, res: Response) => {
  try {
    const { service_type, service_name, quantity, unit_price, clinical_order_id, added_by, notes } = req.body;
    if (!service_type || !service_name) {
      res.status(400).json({ error: true, message: 'Service type and name are required' });
      return;
    }

    // Get tenant_id from case
    const caseResult = await pool.query('SELECT tenant_id FROM insurance_cases WHERE id = $1', [req.params.caseId]);
    if (caseResult.rows.length === 0) { res.status(404).json({ error: true, message: 'Case not found' }); return; }

    const id = crypto.randomUUID();
    const qty = quantity || 1;
    const price = unit_price || 0;
    const total = qty * price;

    const result = await pool.query(
      `INSERT INTO insurance_case_services (id, tenant_id, case_id, service_type, service_name, quantity, unit_price, total_price, clinical_order_id, added_by, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [id, caseResult.rows[0].tenant_id, req.params.caseId, service_type, service_name, qty, price, total, clinical_order_id || null, added_by || null, notes || null]
    );

    // Update case total_billed
    await pool.query(
      `UPDATE insurance_cases SET
         total_billed = (SELECT COALESCE(SUM(total_price),0) FROM insurance_case_services WHERE case_id = $1 AND status != 'removed'),
         total_invoiced = (SELECT COALESCE(SUM(total_price),0) FROM insurance_case_services WHERE case_id = $1 AND status = 'invoiced'),
         total_uninvoiced = (SELECT COALESCE(SUM(total_price),0) FROM insurance_case_services WHERE case_id = $1 AND status = 'pending')
       WHERE id = $1`,
      [req.params.caseId]
    );

    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.put('/api/insurance/cases/:caseId/services/:id', async (req: Request, res: Response) => {
  try {
    const { quantity, unit_price, notes } = req.body;
    const qty = quantity;
    const price = unit_price;
    const total = (qty || 0) * (price || 0);

    const result = await pool.query(
      `UPDATE insurance_case_services SET
        quantity = COALESCE($1, quantity), unit_price = COALESCE($2, unit_price),
        total_price = COALESCE($3, total_price), notes = COALESCE($4, notes)
       WHERE id = $5 AND case_id = $6 RETURNING *`,
      [qty || null, price || null, total || null, notes || null, req.params.id, req.params.caseId]
    );

    if (result.rows.length === 0) { res.status(404).json({ error: true, message: 'Service not found' }); return; }

    // Update case total_billed
    await pool.query(
      `UPDATE insurance_cases SET
         total_billed = (SELECT COALESCE(SUM(total_price),0) FROM insurance_case_services WHERE case_id = $1 AND status != 'removed'),
         total_invoiced = (SELECT COALESCE(SUM(total_price),0) FROM insurance_case_services WHERE case_id = $1 AND status = 'invoiced'),
         total_uninvoiced = (SELECT COALESCE(SUM(total_price),0) FROM insurance_case_services WHERE case_id = $1 AND status = 'pending')
       WHERE id = $1`,
      [req.params.caseId]
    );

    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.delete('/api/insurance/cases/:caseId/services/:id', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      'DELETE FROM insurance_case_services WHERE id = $1 AND case_id = $2 RETURNING *',
      [req.params.id, req.params.caseId]
    );
    if (result.rows.length === 0) { res.status(404).json({ error: true, message: 'Service not found' }); return; }

    // Update case total_billed
    await pool.query(
      `UPDATE insurance_cases SET
         total_billed = (SELECT COALESCE(SUM(total_price),0) FROM insurance_case_services WHERE case_id = $1 AND status != 'removed'),
         total_invoiced = (SELECT COALESCE(SUM(total_price),0) FROM insurance_case_services WHERE case_id = $1 AND status = 'invoiced'),
         total_uninvoiced = (SELECT COALESCE(SUM(total_price),0) FROM insurance_case_services WHERE case_id = $1 AND status = 'pending')
       WHERE id = $1`,
      [req.params.caseId]
    );

    res.json({ message: 'Service deleted' });
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// SOFT REMOVE — marks service as 'removed' (kept in DB for audit, hidden from billing list)
router.put('/api/insurance/cases/:caseId/services/:id/remove', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `UPDATE insurance_case_services SET status = 'removed' WHERE id = $1 AND case_id = $2 AND status != 'invoiced' RETURNING *`,
      [req.params.id, req.params.caseId]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: true, message: 'Service not found, already removed, or already invoiced' });
      return;
    }

    // Update case totals (exclude removed from billed)
    await pool.query(
      `UPDATE insurance_cases SET
         total_billed = (SELECT COALESCE(SUM(total_price),0) FROM insurance_case_services WHERE case_id = $1 AND status IN ('pending','invoiced')),
         total_invoiced = (SELECT COALESCE(SUM(total_price),0) FROM insurance_case_services WHERE case_id = $1 AND status = 'invoiced'),
         total_uninvoiced = (SELECT COALESCE(SUM(total_price),0) FROM insurance_case_services WHERE case_id = $1 AND status = 'pending')
       WHERE id = $1`,
      [req.params.caseId]
    );

    res.json({ message: 'Service removed from billing list', service: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// === AUTH REQUESTS ===

router.get('/api/insurance/auth-requests', async (req: Request, res: Response) => {
  try {
    const insuranceUser = getInsuranceUser(req);
    const { provider_id, status, patient_id } = req.query;
    let query = `SELECT a.*, p.full_name as patient_name, p.hospital_number,
                        pr.name as provider_name
                 FROM insurance_auth_requests a
                 LEFT JOIN patients p ON a.patient_id = p.id
                 LEFT JOIN insurance_providers pr ON a.provider_id = pr.id
                 WHERE 1=1`;
    const params: any[] = [];
    let idx = 1;

    if (insuranceUser && insuranceUser.providerId) {
      query += ` AND a.provider_id = $${idx++}`;
      params.push(insuranceUser.providerId);
    }

    if (provider_id) { query += ` AND a.provider_id = $${idx++}`; params.push(provider_id); }
    if (status) { query += ` AND a.status = $${idx++}`; params.push(status); }
    if (patient_id) { query += ` AND a.patient_id = $${idx++}`; params.push(patient_id); }
    query += ' ORDER BY a.requested_at DESC LIMIT 50';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.post('/api/insurance/auth-requests', async (req: Request, res: Response) => {
  try {
    const { provider_id, patient_id, requested_services, estimated_amount, clinical_justification, requested_by } = req.body;
    if (!provider_id || !patient_id) {
      res.status(400).json({ error: true, message: 'Provider and patient are required' });
      return;
    }
    const id = crypto.randomUUID();
    const tenantId = getTenantId();
    const requestNumber = await generateAuthNumber(tenantId);

    const result = await pool.query(
      `INSERT INTO insurance_auth_requests (id, tenant_id, provider_id, patient_id, request_number, requested_services, estimated_amount, clinical_justification, requested_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [id, tenantId, provider_id, patient_id, requestNumber, requested_services || null, estimated_amount || null, clinical_justification || null, requested_by || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.put('/api/insurance/auth-requests/:id', async (req: Request, res: Response) => {
  try {
    const { status, auth_code, authorized_amount, validity_start_date, validity_end_date, response_notes, responded_by } = req.body;
    const result = await pool.query(
      `UPDATE insurance_auth_requests SET
        status = COALESCE($1, status), auth_code = COALESCE($2, auth_code),
        authorized_amount = COALESCE($3, authorized_amount),
        validity_start_date = COALESCE($4, validity_start_date), validity_end_date = COALESCE($5, validity_end_date),
        response_notes = COALESCE($6, response_notes), responded_by = COALESCE($7, responded_by),
        responded_at = CASE WHEN $1 IS NOT NULL AND $1 IN ('approved','denied','partial') THEN NOW() ELSE responded_at END
       WHERE id = $8 RETURNING *`,
      [status || null, auth_code || null, authorized_amount || null, validity_start_date || null, validity_end_date || null, response_notes || null, responded_by || null, req.params.id]
    );
    if (result.rows.length === 0) { res.status(404).json({ error: true, message: 'Auth request not found' }); return; }
    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.get('/api/insurance/auth-requests/stats', async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT
        COUNT(*) FILTER (WHERE status = 'requested' OR status = 'submitted_to_hmo')::int as pending,
        COUNT(*) FILTER (WHERE status = 'approved')::int as approved,
        COUNT(*) FILTER (WHERE status = 'denied')::int as denied
       FROM insurance_auth_requests`
    );
    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// === PATIENT POLICIES ===

router.get('/api/insurance/policies/:patientId', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT pp.*, pr.name as provider_name, pr.code as provider_code, pr.is_active as provider_active,
              CASE
                WHEN NOT pp.is_active OR NOT pr.is_active THEN 'deactivated'
                WHEN pp.end_date IS NOT NULL AND pp.end_date < CURRENT_DATE THEN 'expired'
                ELSE 'active'
              END as policy_status
       FROM patient_insurance_policies pp
       LEFT JOIN insurance_providers pr ON pp.provider_id = pr.id
       WHERE pp.patient_id = $1 ORDER BY pp.coverage_type`,
      [req.params.patientId]
    );
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.post('/api/insurance/policies', async (req: Request, res: Response) => {
  try {
    const { patient_id, provider_id, policy_number, policy_holder_name, relationship_to_patient, coverage_type, start_date, end_date, co_pay_percentage } = req.body;
    if (!patient_id || !provider_id || !policy_number) {
      res.status(400).json({ error: true, message: 'Patient, provider, and policy number are required' });
      return;
    }
    const covType = coverage_type || 'primary';

    // Prevent same provider being both primary AND secondary for this patient
    const oppositeType = covType === 'primary' ? 'secondary' : 'primary';
    const existingSameProvider = await pool.query(
      `SELECT id, coverage_type FROM patient_insurance_policies
       WHERE patient_id = $1 AND provider_id = $2 AND is_active = true AND coverage_type = $3`,
      [patient_id, provider_id, oppositeType]
    );
    if (existingSameProvider.rows.length > 0) {
      const provName = await pool.query('SELECT name FROM insurance_providers WHERE id = $1', [provider_id]);
      res.status(409).json({
        error: true,
        message: `${provName.rows[0]?.name || 'This provider'} is already set as ${existingSameProvider.rows[0].coverage_type} for this patient. A provider cannot be both primary and secondary.`
      });
      return;
    }

    // Enforce one primary: if adding a primary, demote any existing primary to secondary
    if (covType === 'primary') {
      await pool.query(
        'UPDATE patient_insurance_policies SET coverage_type = $1 WHERE patient_id = $2 AND coverage_type = $3',
        ['secondary', patient_id, 'primary']
      );
    }

    // Inherit co-pay from provider if not explicitly set
    let finalCoPay = co_pay_percentage !== undefined && co_pay_percentage !== null ? parseFloat(co_pay_percentage) : null;
    if (finalCoPay === null) {
      const provConfig = await pool.query(
        'SELECT percentage_value FROM insurance_provider_co_pay_config WHERE provider_id = $1 AND is_active = true LIMIT 1',
        [provider_id]
      );
      if (provConfig.rows.length > 0) {
        finalCoPay = parseFloat(provConfig.rows[0].percentage_value) || 0;
      } else {
        finalCoPay = 0;
      }
    }

    const id = crypto.randomUUID();
    const tenantId = getTenantId();
    const result = await pool.query(
      `INSERT INTO patient_insurance_policies (id, tenant_id, patient_id, provider_id, policy_number, policy_holder_name, relationship_to_patient, coverage_type, start_date, end_date, co_pay_percentage)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [id, tenantId, patient_id, provider_id, policy_number, policy_holder_name || null, relationship_to_patient || 'self', covType, start_date || null, end_date || null, finalCoPay]
    );
    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.put('/api/insurance/policies/:id', async (req: Request, res: Response) => {
  try {
    const { coverage_type, end_date, is_active, co_pay_percentage } = req.body;

    // If changing coverage type, prevent same provider being both primary AND secondary
    if (coverage_type) {
      const policy = await pool.query('SELECT patient_id, provider_id, coverage_type FROM patient_insurance_policies WHERE id = $1', [req.params.id]);
      if (policy.rows.length > 0) {
        const { patient_id, provider_id } = policy.rows[0];
        if (coverage_type !== policy.rows[0].coverage_type) {
          const oppositeType = coverage_type === 'primary' ? 'secondary' : 'primary';
          const existingSameProvider = await pool.query(
            `SELECT id FROM patient_insurance_policies
             WHERE patient_id = $1 AND provider_id = $2 AND is_active = true AND coverage_type = $3 AND id != $4`,
            [patient_id, provider_id, oppositeType, req.params.id]
          );
          if (existingSameProvider.rows.length > 0) {
            const provName = await pool.query('SELECT name FROM insurance_providers WHERE id = $1', [provider_id]);
            res.status(409).json({
              error: true,
              message: `${provName.rows[0]?.name || 'This provider'} is already set as ${oppositeType} for this patient. A provider cannot be both primary and secondary.`
            });
            return;
          }
        }
      }
    }

    // If changing to primary, demote existing primary (excluding self)
    if (coverage_type === 'primary') {
      const policy = await pool.query('SELECT patient_id FROM patient_insurance_policies WHERE id = $1', [req.params.id]);
      if (policy.rows.length > 0) {
        await pool.query(
          'UPDATE patient_insurance_policies SET coverage_type = $1 WHERE patient_id = $2 AND coverage_type = $3 AND id != $4',
          ['secondary', policy.rows[0].patient_id, 'primary', req.params.id]
        );
      }
    }

    const result = await pool.query(
      `UPDATE patient_insurance_policies SET
        coverage_type = COALESCE($1, coverage_type), end_date = COALESCE($2, end_date),
        is_active = COALESCE($3, is_active), co_pay_percentage = COALESCE($4, co_pay_percentage)
       WHERE id = $5 RETURNING *`,
      [coverage_type || null, end_date || null, is_active !== undefined ? is_active : null, co_pay_percentage !== undefined ? parseFloat(co_pay_percentage) : null, req.params.id]
    );
    if (result.rows.length === 0) { res.status(404).json({ error: true, message: 'Policy not found' }); return; }
    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// === CO-PAY ===

router.get('/api/insurance/co-pay/:patientId', async (req: Request, res: Response) => {
  try {
    // Get active case for patient
    const activeCase = await pool.query(
      `SELECT c.*, pr.name as provider_name, pr.code as provider_code,
              COALESCE(cp.calculation_method, 'percentage') as calc_method,
              COALESCE(cp.percentage_value, 10) as calc_percentage,
              COALESCE(cp.fixed_amount, 0) as calc_fixed
       FROM insurance_cases c
       LEFT JOIN insurance_providers pr ON c.provider_id = pr.id
       LEFT JOIN insurance_provider_co_pay_config cp ON cp.provider_id = c.provider_id AND cp.is_active = true
       WHERE c.patient_id = $1 AND c.status = 'active'
       ORDER BY c.created_at DESC LIMIT 1`,
      [req.params.patientId]
    );

    if (activeCase.rows.length === 0) {
      res.json({ hasActiveCase: false, co_pay_amount: 0, covered_amount: 0, case: null });
      return;
    }

    const c = activeCase.rows[0];
    let coPayAmount = 0;
    switch (c.calc_method) {
      case 'percentage':
        coPayAmount = (c.total_billed || 0) * (c.calc_percentage / 100);
        break;
      case 'fixed_per_visit':
        coPayAmount = c.calc_fixed;
        break;
      case 'none':
        coPayAmount = 0;
        break;
      default:
        coPayAmount = (c.total_billed || 0) * 0.1;
    }

    res.json({
      hasActiveCase: true,
      case_id: c.id,
      case_number: c.case_number,
      provider_name: c.provider_name,
      total_billed: c.total_billed || 0,
      co_pay_amount: Math.round(coPayAmount * 100) / 100,
      covered_amount: Math.round(((c.total_billed || 0) - coPayAmount) * 100) / 100,
      co_pay_collected: c.co_pay_collected || 0,
      calculation_method: c.calc_method,
    });
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.post('/api/insurance/co-pay/pay', async (req: Request, res: Response) => {
  try {
    const { patientId, caseId, amount, paymentMethod } = req.body;
    if (!patientId || !caseId || !amount) {
      res.status(400).json({ error: true, message: 'Patient, case, and amount are required' });
      return;
    }

    // Get the case
    const caseResult = await pool.query('SELECT * FROM insurance_cases WHERE id = $1', [caseId]);
    if (caseResult.rows.length === 0) { res.status(404).json({ error: true, message: 'Case not found' }); return; }

    // Create payment record
    const paymentId = crypto.randomUUID();
    const receiptNumber = `COP-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(Math.floor(Math.random() * 9999)).padStart(4, '0')}`;
    const payTenantId = caseResult.rows[0].tenant_id;

    await pool.query(
      `INSERT INTO payments (id, tenant_id, patient_id, total_amount, payment_method, receipt_number, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'paid')`,
      [paymentId, payTenantId, patientId, amount, paymentMethod || 'cash', receiptNumber]
    );

    const coPayDesc = `Co-pay for case ${caseResult.rows[0].case_number}`;
    await pool.query(
      `INSERT INTO payment_items (tenant_id, payment_id, service_type, description, item_name, quantity, unit_price, total_price)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [payTenantId, paymentId, 'insurance_co_pay', coPayDesc, coPayDesc, 1, amount, amount]
    );

    // Update case co_pay_collected
    await pool.query(
      'UPDATE insurance_cases SET co_pay_collected = COALESCE(co_pay_collected,0) + $1 WHERE id = $2',
      [amount, caseId]
    );

    res.status(201).json({
      payment_id: paymentId,
      receipt_number: receiptNumber,
      amount,
      message: 'Co-pay collected successfully',
    });
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.get('/api/insurance/co-pay/history/:patientId', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT p.*, pi.item_name, pi.total_price
       FROM payments p
       JOIN payment_items pi ON p.id = pi.payment_id
       WHERE p.patient_id = $1 AND pi.service_type = 'insurance_co_pay'
       ORDER BY p.created_at DESC`,
      [req.params.patientId]
    );
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// === PATIENT COVERAGE (for Doctor Consultation banner) ===

router.get('/api/insurance/patient-coverage/:patientId', async (req: Request, res: Response) => {
  try {
    const insuranceUser = getInsuranceUser(req);
    let caseQuery = `SELECT c.*, pr.name as provider_name, pr.code as provider_code
                     FROM insurance_cases c
                     LEFT JOIN insurance_providers pr ON c.provider_id = pr.id
                     WHERE c.patient_id = $1 AND c.status = 'active'`;
    const caseParams: any[] = [req.params.patientId];
    if (insuranceUser && insuranceUser.providerId) {
      caseQuery += ' AND c.provider_id = $2';
      caseParams.push(insuranceUser.providerId);
    }
    caseQuery += ' ORDER BY c.created_at DESC LIMIT 1';
    const activeCase = await pool.query(caseQuery, caseParams);

    const policies = await pool.query(
      `SELECT pp.*, pr.name as provider_name, pr.code as provider_code, pr.is_active as provider_active,
              CASE
                WHEN NOT pp.is_active OR NOT pr.is_active THEN 'deactivated'
                WHEN pp.end_date IS NOT NULL AND pp.end_date < CURRENT_DATE THEN 'expired'
                ELSE 'active'
              END as policy_status
       FROM patient_insurance_policies pp
       LEFT JOIN insurance_providers pr ON pp.provider_id = pr.id
       WHERE pp.patient_id = $1 AND pp.is_active = true
       ORDER BY pp.coverage_type`,
      [req.params.patientId]
    );

    // Primary policy: first look for an active primary; if none, promote the oldest active secondary
    let primaryPolicy = policies.rows.find((p: any) => p.coverage_type === 'primary' && p.policy_status === 'active') || null;
    let promoted = false;

    if (!primaryPolicy) {
      // Auto-promote oldest active secondary to primary (favoring earliest created)
      const activeSecondaries = policies.rows
        .filter((p: any) => p.coverage_type === 'secondary' && p.policy_status === 'active')
        .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      if (activeSecondaries.length > 0) {
        primaryPolicy = activeSecondaries[0];
        promoted = true;
        // Update the DB to reflect the promotion
        await pool.query(
          'UPDATE patient_insurance_policies SET coverage_type = $1 WHERE id = $2',
          ['primary', primaryPolicy.id]
        );
        primaryPolicy.coverage_type = 'primary';
      }
    }

    // Collect remaining secondary policies (excluding the promoted one)
    const secondaryPolicies = policies.rows
      .filter((p: any) => p.coverage_type === 'secondary' && p.policy_status === 'active' && p.id !== primaryPolicy?.id)
      .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    // Only consider a case "active coverage" if it matches the current primary provider
    const hasMatchingCase = activeCase.rows.length > 0 && primaryPolicy && activeCase.rows[0].provider_id === primaryPolicy.provider_id;

    res.json({
      hasActiveCoverage: Boolean(primaryPolicy) || Boolean(hasMatchingCase),
      activeCase: hasMatchingCase ? activeCase.rows[0] : null,
      primaryPolicy,
      promoted,
      secondaryPolicies,
      policies: policies.rows,
    });
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// === INSURANCE PATIENTS ===

router.get('/api/insurance/patients', async (req: Request, res: Response) => {
  try {
    const insuranceUser = getInsuranceUser(req);
    const { search } = req.query;

    let scopeClause = '';
    const scopeParams: any[] = [];
    if (insuranceUser && insuranceUser.providerId) {
      scopeClause = ' AND c.provider_id = $1';
      scopeParams.push(insuranceUser.providerId);
    }

    let query = `SELECT p.id, p.full_name, p.hospital_number, p.sex, p.dob, p.phone, p.insurance, p.insurance_type,
                        (SELECT COUNT(*) FROM insurance_cases WHERE patient_id = p.id)::int as total_cases,
                        (SELECT COUNT(*) FROM insurance_cases WHERE patient_id = p.id AND status = 'active')::int as active_cases,
                        (SELECT pr.name FROM patient_insurance_policies pp JOIN insurance_providers pr ON pp.provider_id = pr.id WHERE pp.patient_id = p.id AND pp.is_active = true AND pp.coverage_type = 'primary' AND (pp.end_date IS NULL OR pp.end_date >= CURRENT_DATE) LIMIT 1) as primary_provider,
                        (SELECT pp.coverage_type FROM patient_insurance_policies pp WHERE pp.patient_id = p.id AND pp.is_active = true AND pp.coverage_type = 'primary' AND (pp.end_date IS NULL OR pp.end_date >= CURRENT_DATE) LIMIT 1) as coverage_tag
                 FROM patients p
                 WHERE (EXISTS (SELECT 1 FROM insurance_cases c WHERE c.patient_id = p.id${scopeClause})`;
    const params: any[] = [...scopeParams];
    let idx = scopeParams.length + 1;

    query += ` OR EXISTS (SELECT 1 FROM patient_insurance_policies pp WHERE pp.patient_id = p.id AND pp.is_active = true))`;

    if (search) {
      query += ` AND (p.full_name ILIKE $${idx} OR p.hospital_number ILIKE $${idx})`;
      params.push(`%${search}%`);
      idx++;
    }

    query += ' ORDER BY p.full_name LIMIT 50';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// === PATIENT SUMMARY (all clinical reference data for Insurance Patient Detail view) ===

router.get('/api/insurance/patient-summary/:patientId', async (req: Request, res: Response) => {
  try {
    const patientId = req.params.patientId;

    // Basic patient info
    const patient = await pool.query('SELECT id, full_name, hospital_number, sex, dob, phone, email, address, insurance, insurance_type FROM patients WHERE id = $1', [patientId]);

    // Completed lab results
    const labResults = await pool.query(
      `SELECT lr.id, lr.analyte_name, lr.value, lr.reference_range_low, lr.reference_range_high, lr.is_abnormal, lr.status, lr.created_at,
              lo.test_name, lo.order_number
       FROM lab_results lr
       JOIN lab_orders lo ON lr.lab_order_id = lo.id
       JOIN encounters e ON lo.encounter_id = e.id
       WHERE e.patient_id = $1 AND lr.status = 'completed'
       ORDER BY lr.created_at DESC`,
      [patientId]
    );

    // Completed radiology
    const radiologyOrders = await pool.query(
      `SELECT ro.id, ro.imaging_type, ro.report_text, ro.status, ro.doctor_name, ro.created_at
       FROM radiology_orders ro
       JOIN encounters e ON ro.encounter_id = e.id
       WHERE e.patient_id = $1 AND ro.status = 'completed'
       ORDER BY ro.created_at DESC`,
      [patientId]
    );

    // Dispensed prescriptions
    const prescriptions = await pool.query(
      `SELECT p.id, p.drug_name, p.dosage, p.quantity, p.status, p.created_at
       FROM prescriptions p
       JOIN encounters e ON p.encounter_id = e.id
       WHERE e.patient_id = $1 AND p.status = 'dispensed'
       ORDER BY p.created_at DESC`,
      [patientId]
    );

    // Admissions
    const admissions = await pool.query(
      `SELECT a.id, a.admitted_at, a.discharged_at, a.status, a.bed_number, w.name as ward_name
       FROM admissions a LEFT JOIN wards w ON a.ward_id = w.id
       WHERE a.patient_id = $1 ORDER BY a.admitted_at DESC`,
      [patientId]
    );

    // Encounters
    const encounters = await pool.query(
      `SELECT e.id, e.encounter_type, e.chief_complaint, e.created_at, s.name as doctor_name
       FROM encounters e LEFT JOIN staff_users s ON e.staff_id = s.id
       WHERE e.patient_id = $1 ORDER BY e.created_at DESC`,
      [patientId]
    );

    // Treatments
    const treatments = await pool.query(
      `SELECT id, treatment, dosage, route, frequency, status, created_at FROM treatments WHERE patient_id = $1 ORDER BY created_at DESC`,
      [patientId]
    );

    // Fluid balance entries (intake only — output is not billable)
    const fluidEntries = await pool.query(
      `SELECT id, fluid_type, intake_ml, route, notes, recorded_at
       FROM fluid_balance WHERE patient_id = $1 AND intake_ml > 0 ORDER BY recorded_at DESC`,
      [patientId]
    );

    // Insurance cases
    const insuranceCases = await pool.query(
      `SELECT c.*, pr.name as provider_name, pr.code as provider_code
       FROM insurance_cases c LEFT JOIN insurance_providers pr ON c.provider_id = pr.id
       WHERE c.patient_id = $1 ORDER BY c.created_at DESC`,
      [patientId]
    );

    // Invoices for all of this patient's cases
    const patientInvoices = await pool.query(
      `SELECT DISTINCT i.*, pr.name as provider_name, pr.code as provider_code
       FROM insurance_invoices i
       JOIN insurance_invoice_items ii ON ii.invoice_id = i.id
       JOIN insurance_cases c ON ii.case_id = c.id
       LEFT JOIN insurance_providers pr ON i.provider_id = pr.id
       WHERE c.patient_id = $1
       ORDER BY i.created_at DESC`,
      [patientId]
    );

    res.json({
      patient: patient.rows[0] || null,
      labResults: labResults.rows,
      radiologyOrders: radiologyOrders.rows,
      prescriptions: prescriptions.rows,
      admissions: admissions.rows,
      encounters: encounters.rows,
      treatments: treatments.rows,
      fluidEntries: fluidEntries.rows,
      insuranceCases: insuranceCases.rows,
      invoices: patientInvoices.rows,
    });
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// === ACTIVE CASE LOOKUP (used by Paypoint/Pharmacy to know if patient can be billed to insurance) ===

router.get('/api/insurance/active-case/:patientId', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT c.id, c.case_number, c.provider_id, c.auth_code, c.coverage_start_date, c.coverage_end_date,
              pr.name as provider_name, pr.code as provider_code,
              COALESCE(cp.calculation_method, 'percentage') as calc_method,
              COALESCE(cp.percentage_value, 0) as calc_percentage
       FROM insurance_cases c
       LEFT JOIN insurance_providers pr ON c.provider_id = pr.id
       LEFT JOIN insurance_provider_co_pay_config cp ON cp.provider_id = c.provider_id AND cp.is_active = true
       WHERE c.patient_id = $1 AND c.status = 'active'
       ORDER BY c.created_at DESC LIMIT 1`,
      [req.params.patientId]
    );
    if (result.rows.length === 0) {
      res.json({ hasActiveCase: false, case: null });
      return;
    }
    res.json({ hasActiveCase: true, case: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// === PER-ITEM COVERAGE QUOTE (Paypoint "Bill to Insurance" breakdown) ===

// GET /api/insurance/coverage-quote?patientId=...&items=[{service_type,unit_price,quantity,description}]
// Returns per-line insurer/patient split + totals based on the provider's per-service coverage.
router.get('/api/insurance/coverage-quote', async (req: Request, res: Response) => {
  try {
    const patientId = String(req.query.patientId || '');
    let items: any[] = [];
    if (typeof req.query.items === 'string') {
      try { items = JSON.parse(req.query.items); } catch { items = []; }
    }

    if (!patientId) {
      res.status(400).json({ error: true, message: 'patientId is required' });
      return;
    }
    if (!Array.isArray(items)) {
      res.status(400).json({ error: true, message: 'items must be a JSON array' });
      return;
    }

    const ins = await getPatientPrimaryInsurance(patientId);
    if (!ins || !ins.active || !ins.providerId) {
      res.json({ hasActiveCase: false, case_id: null, provider_name: null, patient: { co_pay: 0 }, insurer: { covered: 0 }, items: [] });
      return;
    }

    const quoteItems: any[] = [];
    let totalPatient = 0;
    let totalInsurer = 0;

    for (const item of items) {
      const unitPrice = parseFloat(item.unit_price) || 0;
      const qty = parseInt(item.quantity) || 1;
      const lineTotal = Math.round(unitPrice * qty * 100) / 100;
      const svcType = item.service_type === 'prescription' ? 'pharmacy' : (item.service_type || 'general');
      const itemName = item.description || '';

      let coveragePct = 100;
      try { coveragePct = await getCoverageForService(ins.providerId as string, svcType, itemName); } catch {}
      if (isNaN(coveragePct)) coveragePct = 100;
      coveragePct = Math.max(0, Math.min(100, coveragePct));

      const insurerLine = Math.round(lineTotal * coveragePct) / 100;
      const patientLine = Math.round((lineTotal - insurerLine) * 100) / 100;
      totalInsurer = Math.round((totalInsurer + insurerLine) * 100) / 100;
      totalPatient = Math.round((totalPatient + patientLine) * 100) / 100;

      quoteItems.push({
        service_type: svcType,
        description: itemName,
        line_total: lineTotal,
        coverage: coveragePct,
        insurer_amount: insurerLine,
        patient_amount: patientLine,
      });
    }

    res.json({
      hasActiveCase: true,
      case_id: ins.caseId,
      provider_name: ins.providerName,
      patient: { co_pay: totalPatient },
      insurer: { covered: totalInsurer },
      items: quoteItems,
    });
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// === BILL TO INSURANCE (used by Paypoint/Pharmacy to add charges to an insured patient's case) ===

router.post('/api/insurance/bill-to-insurance', async (req: Request, res: Response) => {
  try {
    const { patientId, caseId, items, source, created_by } = req.body;
    if (!patientId || !items || !Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: true, message: 'Patient and items are required' });
      return;
    }

    // Find active case if not provided
    let targetCaseId = caseId;
    if (!targetCaseId) {
      const activeRes = await pool.query(
        `SELECT id, tenant_id FROM insurance_cases WHERE patient_id = $1 AND status = 'active' ORDER BY created_at DESC LIMIT 1`,
        [patientId]
      );
      if (activeRes.rows.length === 0) {
        res.status(400).json({ error: true, message: 'Patient has no active insurance case. Create one first.' });
        return;
      }
      targetCaseId = activeRes.rows[0].id;
    }

    // Get case tenant_id
    const caseResult = await pool.query('SELECT tenant_id FROM insurance_cases WHERE id = $1', [targetCaseId]);
    if (caseResult.rows.length === 0) {
      res.status(404).json({ error: true, message: 'Case not found' });
      return;
    }
    const tenantId = caseResult.rows[0].tenant_id;
    const src = source || 'paypoint';

    const added: any[] = [];
    for (const item of items) {
      const serviceType = item.service_type || 'general';
      const serviceName = item.description || 'Service';
      const qty = parseInt(item.quantity) || 1;
      const price = parseFloat(item.unit_price) || 0;
      const id = crypto.randomUUID();
      // Per-item split: when the client sends insurer_amount, bill only that portion to the
      // case (the patient portion is collected as co-pay separately). Otherwise bill full line.
      const total = item.insurer_amount !== undefined && item.insurer_amount !== null
        ? parseFloat(item.insurer_amount) || 0
        : qty * price;
      const result = await pool.query(
        `INSERT INTO insurance_case_services (id, tenant_id, case_id, service_type, service_name, quantity, unit_price, total_price, source_type, source_id, added_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
        [id, tenantId, targetCaseId, serviceType, serviceName, qty, price, total, src, item.service_id || null, created_by || null]
      );
      added.push(result.rows[0]);
      await markSourceOrderAsPaid(item.service_type, item.service_id || null);
      if (item.service_type === 'folder_activation' && patientId) {
        await pool.query('UPDATE patients SET folder_activated = true WHERE id = $1', [patientId]);
      }
      if (item.service_type === 'consultation' && item.service_id) {
        await pool.query(`UPDATE visits SET consultation_status = 'insurance_authorized' WHERE id = $1`, [item.service_id]);
      }
      if (item.service_type === 'referral_fee' && item.service_id) {
        await pool.query(`UPDATE referrals SET consultant_fee_status = 'insurance_authorized' WHERE id = $1`, [item.service_id]);
      }
    }

    // Update case total_billed
    await pool.query(
      `UPDATE insurance_cases SET
         total_billed = (SELECT COALESCE(SUM(total_price),0) FROM insurance_case_services WHERE case_id = $1 AND status != 'removed'),
         total_invoiced = (SELECT COALESCE(SUM(total_price),0) FROM insurance_case_services WHERE case_id = $1 AND status = 'invoiced'),
         total_uninvoiced = (SELECT COALESCE(SUM(total_price),0) FROM insurance_case_services WHERE case_id = $1 AND status = 'pending')
       WHERE id = $1`,
      [targetCaseId]
    );

    res.status(201).json({
      message: `${added.length} item(s) billed to insurance case ${targetCaseId}`,
      case_id: targetCaseId,
      added,
      total_added: added.reduce((s, a) => s + parseFloat(a.total_price || 0), 0),
    });
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

export default router;
