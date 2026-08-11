import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import pool from '../db/pool';
import { isSuperAdmin, getInsuranceUser, canManageStaff } from '../utils/insuranceAuth';
import { readClinicProfile } from '../config/reader';

const router = Router();

function getTenantId(): string {
  return readClinicProfile().GLOBAL_SAAS_TENANT_ID;
}

router.get('/api/insurance/staff', async (req: Request, res: Response) => {
  try {
    const insuranceUser = getInsuranceUser(req);
    const providerId = req.query.provider_id as string;
    let query = `SELECT s.id, s.full_name, s.email, s.phone, s.role, s.access_scope, s.is_active, s.last_login, s.created_at,
                        p.name as provider_name, p.code as provider_code
                 FROM insurance_staff_users s
                 LEFT JOIN insurance_providers p ON s.provider_id = p.id
                 WHERE 1=1`;
    const params: any[] = [];
    let idx = 1;

    // Auto-filter by provider scope
    if (insuranceUser && insuranceUser.providerId) {
      query += ` AND s.provider_id = $${idx++}`;
      params.push(insuranceUser.providerId);
    }

    if (providerId) {
      query += ` AND s.provider_id = $${idx++}`;
      params.push(providerId);
    }
    query += ' ORDER BY s.created_at DESC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.post('/api/insurance/staff', async (req: Request, res: Response) => {
  try {
    if (!canManageStaff(req)) { res.status(403).json({ error: true, message: 'Forbidden' }); return; }
    const { full_name, email, phone, password, role, access_scope, provider_id } = req.body;
    if (!full_name || !email || !password) {
      res.status(400).json({ error: true, message: 'Name, email and password are required' });
      return;
    }

    // Insurance admin cannot create another admin — only Super Admin can
    const user = getInsuranceUser(req);
    if (user && user.role === 'admin' && role === 'admin' && !isSuperAdmin(req)) {
      res.status(403).json({ error: true, message: 'Only Super Admin can create insurance admin accounts.' });
      return;
    }

    // Insurance admin can only create staff for their own provider
    if (user && user.role === 'admin' && user.providerId && provider_id && provider_id !== user.providerId) {
      res.status(403).json({ error: true, message: 'You can only create staff for your own HMO.' });
      return;
    }

    const id = crypto.randomUUID();
    const tenantId = getTenantId();
    const passwordHash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO insurance_staff_users (id, tenant_id, provider_id, full_name, email, phone, password_hash, role, access_scope)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id, full_name, email, phone, role, access_scope, is_active, created_at`,
      [id, tenantId, provider_id || null, full_name, email, phone || null, passwordHash, role || 'viewer', access_scope || 'own']
    );
    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    if (err.code === '23505') { res.status(409).json({ error: true, message: 'Email already exists' }); return; }
    res.status(500).json({ error: true, message: err.message });
  }
});

router.put('/api/insurance/staff/:id', async (req: Request, res: Response) => {
  try {
    if (!canManageStaff(req)) { res.status(403).json({ error: true, message: 'Forbidden' }); return; }
    const { full_name, phone, role, access_scope, provider_id, is_active, password } = req.body;

    // Insurance admin cannot promote someone to admin
    const user = getInsuranceUser(req);
    if (user && user.role === 'admin' && role === 'admin' && !isSuperAdmin(req)) {
      res.status(403).json({ error: true, message: 'Only Super Admin can set an insurance admin role.' });
      return;
    }

    if (password) {
      const passwordHash = await bcrypt.hash(password, 10);
      await pool.query(
        `UPDATE insurance_staff_users SET password_hash = $1 WHERE id = $2`,
        [passwordHash, req.params.id]
      );
    }

    const result = await pool.query(
      `UPDATE insurance_staff_users SET
        full_name = COALESCE($1, full_name), phone = COALESCE($2, phone),
        role = COALESCE($3, role), access_scope = COALESCE($4, access_scope),
        provider_id = COALESCE($5, provider_id), is_active = COALESCE($6, is_active)
       WHERE id = $7 RETURNING id, full_name, email, phone, role, access_scope, is_active`,
      [full_name || null, phone || null, role || null, access_scope || null, provider_id || null, is_active !== undefined ? is_active : null, req.params.id]
    );
    if (result.rows.length === 0) { res.status(404).json({ error: true, message: 'Staff not found' }); return; }
    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.patch('/api/insurance/staff/:id/status', async (req: Request, res: Response) => {
  try {
    if (!canManageStaff(req)) { res.status(403).json({ error: true, message: 'Forbidden' }); return; }
    const { is_active } = req.body;
    const result = await pool.query(
      'UPDATE insurance_staff_users SET is_active = $1 WHERE id = $2 RETURNING id, full_name, email, is_active',
      [is_active, req.params.id]
    );
    if (result.rows.length === 0) { res.status(404).json({ error: true, message: 'Staff not found' }); return; }
    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// Hard-delete staff (Super Admin only — requires master token)
router.delete('/api/insurance/staff/:id', async (req: Request, res: Response) => {
  try {
    if (!isSuperAdmin(req)) { res.status(403).json({ error: true, message: 'Forbidden. Only Super Admin can delete staff permanently.' }); return; }
    const result = await pool.query(
      'DELETE FROM insurance_staff_users WHERE id = $1 RETURNING id, full_name, email',
      [req.params.id]
    );
    if (result.rows.length === 0) { res.status(404).json({ error: true, message: 'Staff not found' }); return; }
    res.json({ message: `Staff "${result.rows[0].full_name}" permanently deleted.`, staff: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

export default router;
