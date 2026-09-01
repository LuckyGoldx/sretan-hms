import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import pool from '../db/pool';
import { readClinicProfile } from '../config/reader';

const router = Router();

function getTenantId(): string {
  return readClinicProfile().GLOBAL_SAAS_TENANT_ID;
}

const VALID_ROLES = ['Doctor', 'Nurse', 'Lab Scientist', 'Pharmacist', 'Records', 'Paypoint', 'Admin', 'Finance', 'Radiology', 'Consultant'];

router.get('/api/staff', async (_req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const result = await pool.query(
      `SELECT su.id, su.email, su.username, su.name, su.role, su.phone, su.status, su.department_id, su.created_at,
              d.name as department_name
       FROM staff_users su
       LEFT JOIN departments d ON d.id = su.department_id
       WHERE su.tenant_id = $1 ORDER BY su.name`,
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
      `SELECT su.id, su.email, su.username, su.name, su.role, su.phone, su.status, su.department_id, su.created_at,
              d.name as department_name
       FROM staff_users su
       LEFT JOIN departments d ON d.id = su.department_id
       WHERE su.id = $1 AND su.tenant_id = $2`,
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
    const { name, email, role, phone, password, username, department_id } = req.body;

    if (!name || !email || !role || !password) {
      res.status(400).json({ error: true, message: 'Required: name, email, role, password' });
      return;
    }

    if (!VALID_ROLES.includes(role)) {
      res.status(400).json({ error: true, message: `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}` });
      return;
    }

    if (role === 'Consultant' && !department_id) {
      res.status(400).json({ error: true, message: 'A department is required for a Consultant' });
      return;
    }

    const uname = (username || '').trim().toLowerCase() || email.trim().split('@')[0].toLowerCase() || null;
    if (!uname) {
      res.status(400).json({ error: true, message: 'Username is required (or an email to derive it from)' });
      return;
    }
    if (!/^[a-z0-9._-]+$/.test(uname)) {
      res.status(400).json({ error: true, message: 'Username may only contain letters, numbers, dots, dashes and underscores' });
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

    const dup = await pool.query(
      `SELECT id FROM staff_users WHERE LOWER(username) = LOWER($1) AND tenant_id = $2`,
      [uname, tenantId]
    );
    if (dup.rows.length > 0) {
      res.status(409).json({ error: true, message: 'This username is already taken' });
      return;
    }

    const hash = await bcrypt.hash(password, 10);
    const id = uuidv4();
    const result = await pool.query(
      `INSERT INTO staff_users (id, tenant_id, email, username, name, role, phone, password, status, department_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active', $9)
       RETURNING id, email, username, name, role, phone, status, department_id, created_at`,
      [id, tenantId, email, uname, name, role, phone || null, hash, department_id || null]
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
    const { name, email, role, phone, password, status, username, department_id } = req.body;

    if (role && !VALID_ROLES.includes(role)) {
      res.status(400).json({ error: true, message: `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}` });
      return;
    }

    if (role === 'Consultant' && !department_id) {
      res.status(400).json({ error: true, message: 'A department is required for a Consultant' });
      return;
    }

    const uname = username !== undefined && username !== null && username !== ''
      ? String(username).trim().toLowerCase()
      : null;
    if (uname !== null && !/^[a-z0-9._-]+$/.test(uname)) {
      res.status(400).json({ error: true, message: 'Username may only contain letters, numbers, dots, dashes and underscores' });
      return;
    }
    if (uname !== null) {
      const dup = await pool.query(
        `SELECT id FROM staff_users WHERE LOWER(username) = LOWER($1) AND tenant_id = $2 AND id <> $3`,
        [uname, tenantId, id]
      );
      if (dup.rows.length > 0) {
        res.status(409).json({ error: true, message: 'This username is already taken' });
        return;
      }
    }

    let query = `UPDATE staff_users SET name = COALESCE($1, name), email = COALESCE($2, email), username = COALESCE($3, username), role = COALESCE($4, role), phone = COALESCE($5, phone), status = COALESCE($6, status)`;
    const params: any[] = [name || null, email || null, uname, role || null, phone || null, status || null];
    let paramIdx = 7;

    if (department_id !== undefined) {
      query += `, department_id = $${paramIdx}`;
      params.push(department_id || null);
      paramIdx++;
    }

    if (password) {
      const hash = await bcrypt.hash(password, 10);
      query += `, password = $${paramIdx}`;
      params.push(hash);
      paramIdx++;
    }

    query += ` WHERE id = $${paramIdx} AND tenant_id = $${paramIdx + 1} RETURNING id, email, username, name, role, phone, status, department_id, created_at`;
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
