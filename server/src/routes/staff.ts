import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import pool from '../db/pool';
import { readClinicProfile } from '../config/reader';

const router = Router();

function getTenantId(): string {
  return readClinicProfile().GLOBAL_SAAS_TENANT_ID;
}

const VALID_ROLES = ['Doctor', 'Nurse', 'Lab Scientist', 'Pharmacist', 'Records', 'Paypoint', 'Admin'];

router.get('/api/staff', async (_req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const result = await pool.query(
      `SELECT id, email, name, role, phone, status, created_at FROM staff_users WHERE tenant_id = $1 ORDER BY name`,
      [tenantId]
    );
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.get('/api/staff/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const { id } = req.params;
    const result = await pool.query(
      `SELECT id, email, name, role, phone, status, created_at FROM staff_users WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: true, message: 'Staff not found' });
      return;
    }
    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.post('/api/staff', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const { name, email, role, phone, password } = req.body;

    if (!name || !email || !role || !password) {
      res.status(400).json({ error: true, message: 'Required: name, email, role, password' });
      return;
    }

    if (!VALID_ROLES.includes(role)) {
      res.status(400).json({ error: true, message: `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}` });
      return;
    }

    const existing = await pool.query(
      `SELECT id FROM staff_users WHERE email = $1 AND tenant_id = $2`,
      [email, tenantId]
    );
    if (existing.rows.length > 0) {
      res.status(409).json({ error: true, message: 'A user with this email already exists' });
      return;
    }

    const hash = await bcrypt.hash(password, 10);
    const id = uuidv4();
    const result = await pool.query(
      `INSERT INTO staff_users (id, tenant_id, email, name, role, phone, password, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'active')
       RETURNING id, email, name, role, phone, status, created_at`,
      [id, tenantId, email, name, role, phone || null, hash]
    );

    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.put('/api/staff/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const { id } = req.params;
    const { name, email, role, phone, password, status } = req.body;

    if (role && !VALID_ROLES.includes(role)) {
      res.status(400).json({ error: true, message: `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}` });
      return;
    }

    let query = `UPDATE staff_users SET name = COALESCE($1, name), email = COALESCE($2, email), role = COALESCE($3, role), phone = COALESCE($4, phone), status = COALESCE($5, status)`;
    const params: any[] = [name || null, email || null, role || null, phone || null, status || null];
    let paramIdx = 6;

    if (password) {
      const hash = await bcrypt.hash(password, 10);
      query += `, password = $${paramIdx}`;
      params.push(hash);
      paramIdx++;
    }

    query += ` WHERE id = $${paramIdx} AND tenant_id = $${paramIdx + 1} RETURNING id, email, name, role, phone, status, created_at`;
    params.push(id, tenantId);

    const result = await pool.query(query, params);
    if (result.rows.length === 0) {
      res.status(404).json({ error: true, message: 'Staff not found' });
      return;
    }

    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.delete('/api/staff/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const { id } = req.params;
    const result = await pool.query(
      `DELETE FROM staff_users WHERE id = $1 AND tenant_id = $2 RETURNING id`,
      [id, tenantId]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: true, message: 'Staff not found' });
      return;
    }
    res.json({ message: 'Staff deleted' });
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

export default router;
