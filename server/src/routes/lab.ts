import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import pool from '../db/pool';
import { readClinicProfile } from '../config/reader';
import { clockGuard } from '../middleware/clockGuard';

const router = Router();

function getTenantId(): string {
  return readClinicProfile().GLOBAL_SAAS_TENANT_ID;
}

router.get('/api/lab-orders', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const { status, encounter_id, doctor_id } = req.query;
    let query = 'SELECT l.* FROM lab_orders l WHERE l.tenant_id = $1';
    const params: any[] = [tenantId];
    let paramIndex = 2;

    if (status) {
      query += ` AND l.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (encounter_id) {
      query += ` AND l.encounter_id = $${paramIndex}`;
      params.push(encounter_id);
      paramIndex++;
    }

    if (doctor_id) {
      query += ` AND l.encounter_id IN (SELECT id FROM encounters WHERE staff_id = $${paramIndex} AND tenant_id = $1)`;
      params.push(doctor_id);
      paramIndex++;
    }

    query += ' ORDER BY l.created_at DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.post('/api/lab-orders', async (req: Request, res: Response) => {
  try {
    await clockGuard(pool, 'lab_orders');

    const tenantId = getTenantId();
    const { encounter_id, test_name } = req.body;

    if (!encounter_id || !test_name) {
      res.status(400).json({ error: true, message: 'encounter_id and test_name are required' });
      return;
    }

    const id = uuidv4();
    const result = await pool.query(
      `INSERT INTO lab_orders (id, tenant_id, encounter_id, test_name)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [id, tenantId, encounter_id, test_name]
    );

    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.post('/api/lab-results', async (req: Request, res: Response) => {
  try {
    await clockGuard(pool, 'lab_results');

    const tenantId = getTenantId();
    const { lab_order_id, analyte_name, value, reference_range_low, reference_range_high, is_abnormal } = req.body;

    if (!lab_order_id || !analyte_name) {
      res.status(400).json({ error: true, message: 'lab_order_id and analyte_name are required' });
      return;
    }

    const id = uuidv4();
    const result = await pool.query(
      `INSERT INTO lab_results (id, tenant_id, lab_order_id, analyte_name, value, reference_range_low, reference_range_high, is_abnormal)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [id, tenantId, lab_order_id, analyte_name, value || null, reference_range_low || null, reference_range_high || null, is_abnormal || false]
    );

    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.put('/api/lab-results/:id/approve', async (req: Request, res: Response) => {
  try {
    await clockGuard(pool, 'lab_results');

    const tenantId = getTenantId();
    const { id } = req.params;
    const { approved_by } = req.body;

    const result = await pool.query(
      `UPDATE lab_results SET approved_by = $1, approved_at = NOW(), status = 'completed'
       WHERE id = $2 AND tenant_id = $3 RETURNING *`,
      [approved_by || null, id, tenantId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: true, message: 'Lab result not found' });
      return;
    }

    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.get('/api/lab-results/:orderId', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const { orderId } = req.params;

    const result = await pool.query(
      'SELECT * FROM lab_results WHERE lab_order_id = $1 AND tenant_id = $2 ORDER BY created_at ASC',
      [orderId, tenantId]
    );

    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

export default router;
