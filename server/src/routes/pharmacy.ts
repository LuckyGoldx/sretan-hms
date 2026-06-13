import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import pool from '../db/pool';
import { readClinicProfile } from '../config/reader';
import { clockGuard } from '../middleware/clockGuard';

const router = Router();

function getTenantId(): string {
  return readClinicProfile().GLOBAL_SAAS_TENANT_ID;
}

router.get('/api/inventory', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const { search, below_reorder, category } = req.query;
    let query = 'SELECT * FROM inventory_items WHERE tenant_id = $1';
    const params: any[] = [tenantId];
    let paramIndex = 2;

    if (category) {
      query += ` AND category = $${paramIndex}`;
      params.push(category);
      paramIndex++;
    }

    if (search) {
      query += ` AND drug_name ILIKE $${paramIndex}`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    if (below_reorder === 'true') {
      query += ` AND stock_count <= reorder_level`;
    }

    query += ' ORDER BY drug_name ASC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.post('/api/inventory', async (req: Request, res: Response) => {
  try {
    await clockGuard(pool, 'inventory_items');

    const tenantId = getTenantId();
    const { drug_name, batch_number, stock_count, reorder_level, expiry_date, supplier, category, unit_price } = req.body;

    if (!drug_name) {
      res.status(400).json({ error: true, message: 'drug_name is required' });
      return;
    }

    const id = uuidv4();
    const result = await pool.query(
      `INSERT INTO inventory_items (id, tenant_id, drug_name, batch_number, stock_count, reorder_level, expiry_date, supplier, category, price)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [id, tenantId, drug_name, batch_number || null, stock_count || 0, reorder_level || 10, expiry_date || null, supplier || null, category || 'pharmacy', unit_price || 0]
    );

    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.put('/api/inventory/:id', async (req: Request, res: Response) => {
  try {
    await clockGuard(pool, 'inventory_items');

    const tenantId = getTenantId();
    const { id } = req.params;
    const { stock_count, stock_count_delta, drug_name, batch_number, reorder_level, expiry_date, supplier, unit_price, cost_price } = req.body;

    const existing = await pool.query(
      'SELECT * FROM inventory_items WHERE id = $1 AND tenant_id = $2',
      [id, tenantId]
    );

    if (existing.rows.length === 0) {
      res.status(404).json({ error: true, message: 'Inventory item not found' });
      return;
    }

    var finalStock = stock_count !== undefined ? stock_count : undefined;
    if (stock_count_delta !== undefined) {
      finalStock = existing.rows[0].stock_count + stock_count_delta;
    }

    const result = await pool.query(
      `UPDATE inventory_items SET
        drug_name = COALESCE($1, drug_name),
        batch_number = COALESCE($2, batch_number),
        stock_count = COALESCE($3, stock_count),
        reorder_level = COALESCE($4, reorder_level),
        expiry_date = COALESCE($5, expiry_date),
        supplier = COALESCE($6, supplier),
        price = COALESCE($7, price),
        cost_price = COALESCE($8, cost_price)
       WHERE id = $9 AND tenant_id = $10
       RETURNING *`,
      [drug_name || null, batch_number || null, finalStock !== undefined ? finalStock : null, reorder_level || null, expiry_date || null, supplier || null,
       unit_price !== undefined ? unit_price : null, cost_price !== undefined ? cost_price : null, id, tenantId]
    );

    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.delete('/api/inventory/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM inventory_items WHERE id = $1 RETURNING *', [id]);
    if (result.rows.length === 0) {
      res.status(404).json({ error: true, message: 'Inventory item not found' });
      return;
    }
    res.json({ success: true, deleted: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.post('/api/dispense', async (req: Request, res: Response) => {
  try {
    await clockGuard(pool, 'inventory_items');

    const tenantId = getTenantId();
    const { prescription_id, quantity_dispensed } = req.body;

    if (!prescription_id) {
      res.status(400).json({ error: true, message: 'prescription_id is required' });
      return;
    }

    const prescResult = await pool.query(
      'SELECT * FROM prescriptions WHERE id = $1 AND tenant_id = $2',
      [prescription_id, tenantId]
    );

    if (prescResult.rows.length === 0) {
      res.status(404).json({ error: true, message: 'Prescription not found' });
      return;
    }

    const prescription = prescResult.rows[0];

    if (!prescription.is_paid) {
      res.status(402).json({ error: true, message: 'Payment required: Prescription has not been paid for' });
      return;
    }
    const qty = quantity_dispensed || prescription.quantity || 1;

    const inventoryResult = await pool.query(
      `SELECT * FROM inventory_items WHERE drug_name = $1 AND tenant_id = $2 AND stock_count > 0
       ORDER BY expiry_date ASC`,
      [prescription.drug_name, tenantId]
    );

    let remaining = qty;
    for (const item of inventoryResult.rows) {
      if (remaining <= 0) break;
      const deduct = Math.min(item.stock_count, remaining);
      await pool.query(
        'UPDATE inventory_items SET stock_count = stock_count - $1 WHERE id = $2',
        [deduct, item.id]
      );
      remaining -= deduct;
    }

    await pool.query(
      `UPDATE prescriptions SET status = 'dispensed' WHERE id = $1`,
      [prescription_id]
    );

    res.json({ message: 'Medication dispensed', quantity_dispensed: qty - remaining });
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.get('/api/inventory/expiring', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const result = await pool.query(
      `SELECT * FROM inventory_items
       WHERE tenant_id = $1
         AND expiry_date IS NOT NULL
         AND expiry_date <= CURRENT_DATE + INTERVAL '30 days'
         AND expiry_date >= CURRENT_DATE
       ORDER BY expiry_date ASC`,
      [tenantId]
    );
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

export default router;
