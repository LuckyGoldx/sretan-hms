import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import pool from '../db/pool';
import { readClinicProfile } from '../config/reader';

const router = Router();

router.post('/api/auth/login', async (req: Request, res: Response) => {
  try {
    const { username, email, password } = req.body;
    const identifier = (username || email || '').trim();

    if (!identifier || !password) {
      res.status(400).json({ error: true, message: 'Username/email and password required' });
      return;
    }

    const profile = readClinicProfile();
    const tenantId = profile.GLOBAL_SAAS_TENANT_ID;

    const result = await pool.query(
      `SELECT su.id, su.name, su.email, su.username, su.role, su.password, su.department_id,
              d.name as department_name, d.modules as department_modules
       FROM staff_users su
       LEFT JOIN departments d ON d.id = su.department_id
       WHERE (LOWER(su.username) = LOWER($1) OR LOWER(su.email) = LOWER($1)) AND su.tenant_id = $2 AND su.status = 'active'`,
      [identifier, tenantId]
    );

    if (result.rows.length === 0) {
      res.status(401).json({ error: true, message: 'Invalid credentials' });
      return;
    }

    const user = result.rows[0];
    if (!user.password) {
      res.status(401).json({ error: true, message: 'Invalid credentials' });
      return;
    }
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      res.status(401).json({ error: true, message: 'Invalid credentials' });
      return;
    }

    res.json({
      token: 'sretan-emr-master-token-2026',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        username: user.username || '',
        role: user.role,
        department_id: user.department_id || null,
        department_name: user.department_name || null,
        department_modules: user.department_modules || [],
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

export default router;
