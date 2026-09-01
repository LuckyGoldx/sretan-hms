import { Router, Request, Response } from 'express';
import pool from '../db/pool';
import { isSuperAdmin, canManageStaff, getInsuranceUser } from '../utils/insuranceAuth';
import { readClinicProfile } from '../config/reader';

const router = Router();

function getTenantId(): string {
  return readClinicProfile().GLOBAL_SAAS_TENANT_ID;
}

function isAdmin(req: Request): boolean {
  return isSuperAdmin(req) || canManageStaff(req);
}

router.get('/api/insurance/providers', async (req: Request, res: Response) => {
  try {
    const insuranceUser = getInsuranceUser(req);
    let query = `SELECT id, name, code, category, contact_person, contact_phone, contact_email, address, is_active, created_at FROM insurance_providers`;
    const params: any[] = [];
    const conds: string[] = [];

    // Editor/viewer insurance staff only see their own provider
    if (insuranceUser && insuranceUser.providerId && insuranceUser.role !== 'admin') {
      conds.push(`id = $${params.length + 1}`);
      params.push(insuranceUser.providerId);
    } else {
      conds.push(`tenant_id = $${params.length + 1}`);
      params.push(getTenantId());
    }

    if (conds.length) query += ' WHERE ' + conds.join(' AND ');
    query += ' ORDER BY name';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.post('/api/insurance/providers', async (req: Request, res: Response) => {
  try {
    if (!isAdmin(req)) { res.status(403).json({ error: true, message: 'Forbidden' }); return; }
    const { name, code, category, contact_person, contact_phone, contact_email, address } = req.body;
    if (!name || !code) { res.status(400).json({ error: true, message: 'Name and code are required' }); return; }
    const id = crypto.randomUUID();
    const tenantId = getTenantId();
    const result = await pool.query(
      `INSERT INTO insurance_providers (id, tenant_id, name, code, category, contact_person, contact_phone, contact_email, address)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id, name, code, category, contact_person, contact_phone, contact_email, address, is_active, created_at`,
      [id, tenantId, name, code.toUpperCase(), category || 'Other', contact_person || null, contact_phone || null, contact_email || null, address || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    if (err.code === '23505') { res.status(409).json({ error: true, message: 'Provider code already exists' }); return; }
    res.status(500).json({ error: true, message: err.message });
  }
});

router.put('/api/insurance/providers/:id', async (req: Request, res: Response) => {
  try {
    if (!isAdmin(req)) { res.status(403).json({ error: true, message: 'Forbidden' }); return; }
    const { name, code, category, contact_person, contact_phone, contact_email, address, is_active } = req.body;
    // Get old provider data before update
    const oldProv = await pool.query('SELECT name, category, code, created_at FROM insurance_providers WHERE id = $1', [req.params.id]);
    if (oldProv.rows.length === 0) { res.status(404).json({ error: true, message: 'Provider not found' }); return; }
    const oldName = oldProv.rows[0].name;
    const oldCategory = oldProv.rows[0].category;
    const oldCode = oldProv.rows[0].code;
    const createdAt = new Date(oldProv.rows[0].created_at).getTime();
    const hoursSinceCreation = (Date.now() - createdAt) / (1000 * 60 * 60);

    // Code change lock: only clinical Super Admin (master token) can change code after 24h
    if (code && code.toUpperCase() !== oldCode && hoursSinceCreation > 24 && !isSuperAdmin(req)) {
      res.status(403).json({ error: true, message: 'Provider code is locked after 24 hours of creation. Contact Super Admin to change it.' });
      return;
    }

    const result = await pool.query(
      `UPDATE insurance_providers SET
        name = COALESCE($1, name), code = COALESCE($2, code),
        category = COALESCE($3, category),
        contact_person = $4, contact_phone = $5, contact_email = $6, address = $7,
        is_active = COALESCE($8, is_active)
       WHERE id = $9 AND tenant_id = $10 RETURNING id, name, code, category, contact_person, contact_phone, contact_email, address, is_active, created_at`,
      [name || null, code ? code.toUpperCase() : null, category || null, contact_person || null, contact_phone || null, contact_email || null, address || null, is_active !== undefined ? is_active : null, req.params.id, getTenantId()]
    );

    // Cascade changes to all patients linked to this provider
    const newName = result.rows[0].name;
    const newCategory = result.rows[0].category;

    // If name changed, update insurance_type and insurance_sub_type for all patients with old name
    if (newName !== oldName) {
      await pool.query(
        `UPDATE patients SET insurance_type = $1, insurance_sub_type = $1 WHERE insurance_type = $2`,
        [newName, oldName]
      );
    }

    // If category changed, update insurance for all patients with this provider
    if (newCategory !== oldCategory) {
      await pool.query(
        `UPDATE patients SET insurance = $1 WHERE insurance_type = $2 AND insurance IS DISTINCT FROM $1`,
        [newCategory, newName]
      );
    }

    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// HARD DELETE — Clinical/Super Admin only. Permanently removes the provider and its records.
router.delete('/api/insurance/providers/:id', async (req: Request, res: Response) => {
  try {
    if (!isSuperAdmin(req)) {
      res.status(403).json({ error: true, message: 'Forbidden. Only Super Admin can permanently delete providers.' });
      return;
    }
    const prov = await pool.query('SELECT id, name, code FROM insurance_providers WHERE id = $1 AND tenant_id = $2', [req.params.id, getTenantId()]);
    if (prov.rows.length === 0) { res.status(404).json({ error: true, message: 'Provider not found' }); return; }
    const name = prov.rows[0].name;
    const providerId = req.params.id;

    // Gather impact counts before deletion
    const staffCount = await pool.query('SELECT COUNT(*)::int as c FROM insurance_staff_users WHERE provider_id = $1', [providerId]);
    const policyCount = await pool.query('SELECT COUNT(*)::int as c FROM patient_insurance_policies WHERE provider_id = $1', [providerId]);
    const caseCount = await pool.query('SELECT COUNT(*)::int as c FROM insurance_cases WHERE provider_id = $1', [providerId]);
    const invoiceCount = await pool.query('SELECT COUNT(*)::int as c FROM insurance_invoices WHERE provider_id = $1', [providerId]);
    const authCount = await pool.query('SELECT COUNT(*)::int as c FROM insurance_auth_requests WHERE provider_id = $1', [providerId]);
    const patCount = await pool.query('SELECT COUNT(*)::int as c FROM patients WHERE insurance_type = $1', [name]);

    // Permanently remove provider + related insurance data
    await pool.query('BEGIN');
    try {
      await pool.query('DELETE FROM insurance_case_services WHERE case_id IN (SELECT id FROM insurance_cases WHERE provider_id = $1)', [providerId]);
      await pool.query('DELETE FROM insurance_invoice_items WHERE invoice_id IN (SELECT id FROM insurance_invoices WHERE provider_id = $1)', [providerId]);
      await pool.query('DELETE FROM insurance_invoices WHERE provider_id = $1', [providerId]);
      await pool.query('DELETE FROM insurance_cases WHERE provider_id = $1', [providerId]);
      await pool.query('DELETE FROM patient_insurance_policies WHERE provider_id = $1', [providerId]);
      await pool.query('DELETE FROM insurance_auth_requests WHERE provider_id = $1', [providerId]);
      await pool.query('DELETE FROM insurance_staff_users WHERE provider_id = $1', [providerId]);
      await pool.query('DELETE FROM insurance_provider_co_pay_config WHERE provider_id = $1', [providerId]);
      await pool.query('DELETE FROM insurance_excluded_services WHERE provider_id = $1', [providerId]);
      // Clear patient insurance_type references
      await pool.query('UPDATE patients SET insurance = NULL, insurance_type = NULL, insurance_sub_type = NULL WHERE insurance_type = $1', [name]);
      await pool.query('DELETE FROM insurance_providers WHERE id = $1', [providerId]);
      await pool.query('COMMIT');
    } catch (e) {
      await pool.query('ROLLBACK');
      throw e;
    }

    res.json({
      message: `Provider "${name}" permanently deleted`,
      detail: `Deleted ${caseCount.rows[0].c} case(s), ${invoiceCount.rows[0].c} invoice(s), ${staffCount.rows[0].c} staff account(s), ${policyCount.rows[0].c} policy(ies), ${authCount.rows[0].c} auth request(s). ${patCount.rows[0].c} patient insurance reference(s) cleared.`,
      cases_deleted: caseCount.rows[0].c,
      invoices_deleted: invoiceCount.rows[0].c,
      staff_deleted: staffCount.rows[0].c,
      policies_deleted: policyCount.rows[0].c,
      auth_requests_deleted: authCount.rows[0].c,
      patients_cleared: patCount.rows[0].c,
    });
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

export default router;
