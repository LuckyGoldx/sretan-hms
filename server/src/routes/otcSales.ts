import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import pool from '../db/pool';
import { readClinicProfile } from '../config/reader';

const router = Router();

function getTenantId(): string {
  return readClinicProfile().GLOBAL_SAAS_TENANT_ID;
}

router.get('/api/otc-sales', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const { date_from, date_to } = req.query;
    let query = `SELECT o.*, s.name as sold_by_name FROM otc_sales o
                 LEFT JOIN staff_users s ON s.id = o.sold_by
                 WHERE o.tenant_id = $1`;
    const params: any[] = [tenantId];
    let idx = 2;

    if (date_from) { query += ` AND o.sold_at >= $${idx}`; params.push(date_from); idx++; }
    if (date_to) { query += ` AND o.sold_at <= $${idx}`; params.push(date_to); idx++; }

    query += ' ORDER BY o.sold_at DESC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.post('/api/otc-sales', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const { drug_name, quantity, unit_price, customer_name, payment_method, notes, sold_by } = req.body;

    if (!drug_name || !quantity || quantity <= 0) {
      res.status(400).json({ error: true, message: 'drug_name and quantity > 0 are required' });
      return;
    }

    const id = uuidv4();
    const totalAmount = (unit_price || 0) * quantity;

    const result = await pool.query(
      `INSERT INTO otc_sales (id, tenant_id, drug_name, quantity, unit_price, total_amount, customer_name, payment_method, notes, sold_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [id, tenantId, drug_name, quantity, unit_price || 0, totalAmount, customer_name || null, payment_method || 'cash', notes || null, sold_by || null]
    );

    await pool.query(
      `UPDATE inventory_items SET stock_count = GREATEST(stock_count - $1, 0) WHERE drug_name = $2 AND tenant_id = $3 AND category = 'pharmacy'`,
      [quantity, drug_name, tenantId]
    );

    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

export default router;
