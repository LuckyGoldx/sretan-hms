import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import pool from '../db/pool';

const router = Router();

router.post('/api/insurance/auth/login', async (req: Request, res: Response) => {
  try {
    const { username, email, password } = req.body;
    const identifier = (username || email || '').trim();
    if (!identifier || !password) {
      res.status(400).json({ error: true, message: 'Username/email and password required' });
      return;
    }

    const result = await pool.query(
      `SELECT id, full_name, email, username, role, access_scope, provider_id, password_hash, is_active
       FROM insurance_staff_users WHERE LOWER(username) = LOWER($1) OR LOWER(email) = LOWER($1)`,
      [identifier]
    );

    if (result.rows.length === 0) {
      res.status(401).json({ error: true, message: 'Invalid credentials' });
      return;
    }

    const user = result.rows[0];

    if (!user.is_active) {
      res.status(401).json({ error: true, message: 'Account is deactivated' });
      return;
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      res.status(401).json({ error: true, message: 'Invalid credentials' });
      return;
    }

    await pool.query(
      'UPDATE insurance_staff_users SET last_login = NOW() WHERE id = $1',
      [user.id]
    );

    res.json({
      token: 'sretan-emr-master-token-2026',
      user: {
        id: user.id,
        name: user.full_name,
        email: user.email,
        username: user.username || '',
        role: user.role,
        user_type: 'insurance_staff',
        provider_id: user.provider_id,
        access_scope: user.access_scope,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.get('/api/insurance/auth/me', async (req: Request, res: Response) => {
  try {
    const token = req.headers['x-master-token'] as string;
    if (!token || token !== 'sretan-emr-master-token-2026') {
      res.status(401).json({ error: true, message: 'Unauthorized' });
      return;
    }

    const email = req.headers['x-user-email'] as string;
    if (!email) {
      res.status(400).json({ error: true, message: 'User email required' });
      return;
    }

    const result = await pool.query(
      `SELECT id, full_name, email, role, access_scope, provider_id
       FROM insurance_staff_users WHERE email = $1 AND is_active = true`,
      [email]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: true, message: 'User not found' });
      return;
    }

    const user = result.rows[0];
    res.json({
      user: {
        id: user.id,
        name: user.full_name,
        email: user.email,
        role: user.role,
        user_type: 'insurance_staff',
        provider_id: user.provider_id,
        access_scope: user.access_scope,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.post('/api/insurance/auth/logout', (_req: Request, res: Response) => {
  res.json({ message: 'Logged out' });
});

export default router;
