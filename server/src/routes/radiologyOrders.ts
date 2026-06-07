import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import pool from '../db/pool';
import { readClinicProfile } from '../config/reader';
import { clockGuard } from '../middleware/clockGuard';

const router = Router();

function getTenantId(): string {
  return readClinicProfile().GLOBAL_SAAS_TENANT_ID;
}

router.get('/api/radiology-orders', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const { status, encounter_id, doctor_id } = req.query;
    let query = 'SELECT r.* FROM radiology_orders r WHERE r.tenant_id = $1';
    const params: any[] = [tenantId];
    let paramIndex = 2;

    if (status) {
      query += ` AND r.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (encounter_id) {
      query += ` AND r.encounter_id = $${paramIndex}`;
      params.push(encounter_id);
      paramIndex++;
    }

    if (doctor_id) {
      query += ` AND r.encounter_id IN (SELECT id FROM encounters WHERE staff_id = $${paramIndex} AND tenant_id = $1)`;
      params.push(doctor_id);
      paramIndex++;
    }

    query += ' ORDER BY r.created_at DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.post('/api/radiology-orders', async (req: Request, res: Response) => {
  try {
    await clockGuard(pool, 'radiology_orders');

    const tenantId = getTenantId();
    const { encounter_id, imaging_type } = req.body;

    if (!encounter_id || !imaging_type) {
      res.status(400).json({ error: true, message: 'encounter_id and imaging_type are required' });
      return;
    }

    const id = uuidv4();
    const result = await pool.query(
      `INSERT INTO radiology_orders (id, tenant_id, encounter_id, imaging_type)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [id, tenantId, encounter_id, imaging_type]
    );

    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.put('/api/radiology-orders/:id', async (req: Request, res: Response) => {
  try {
    await clockGuard(pool, 'radiology_orders');

    const tenantId = getTenantId();
    const { id } = req.params;
    const { report_text, image_path, status } = req.body;

    const result = await pool.query(
      `UPDATE radiology_orders SET report_text = COALESCE($1, report_text), image_path = COALESCE($2, image_path), status = COALESCE($3, status), updated_at = NOW()
       WHERE id = $4 AND tenant_id = $5 RETURNING *`,
      [report_text || null, image_path || null, status || null, id, tenantId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: true, message: 'Radiology order not found' });
      return;
    }

    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

export default router;
