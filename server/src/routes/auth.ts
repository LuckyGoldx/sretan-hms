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
      `SELECT id, name, email, username, role, password FROM staff_users
       WHERE (LOWER(username) = LOWER($1) OR LOWER(email) = LOWER($1)) AND tenant_id = $2 AND status = 'active'`,
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
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

export default router;
