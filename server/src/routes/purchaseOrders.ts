import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import pool from '../db/pool';
import { readClinicProfile } from '../config/reader';

const router = Router();

function getTenantId(): string {
  return readClinicProfile().GLOBAL_SAAS_TENANT_ID;
}

router.get('/api/purchase-orders', async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(
      'SELECT * FROM purchase_orders WHERE tenant_id = $1 ORDER BY ordered_at DESC',
      [getTenantId()]
    );
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.post('/api/purchase-orders', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const { drug_name, quantity, unit_price, supplier, notes } = req.body;
    if (!drug_name || !quantity) {
      res.status(400).json({ error: true, message: 'drug_name and quantity are required' });
      return;
    }
    const poNumber = `PO-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const id = uuidv4();
    const result = await pool.query(
      `INSERT INTO purchase_orders (id, tenant_id, po_number, drug_name, quantity, unit_price, supplier, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [id, tenantId, poNumber, drug_name, quantity, unit_price || 0, supplier || null, notes || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.put('/api/purchase-orders/:id/receive', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `UPDATE purchase_orders SET status = 'received', received_at = NOW() WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [id, getTenantId()]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: true, message: 'Purchase order not found' });
      return;
    }
    const po = result.rows[0];
    await pool.query(
      `INSERT INTO inventory_items (tenant_id, drug_name, batch_number, stock_count, supplier)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT DO NOTHING`,
      [getTenantId(), po.drug_name, `PO-${po.po_number}`, po.quantity, po.supplier]
    );
    await pool.query(
      `UPDATE inventory_items SET stock_count = stock_count + $1 WHERE drug_name = $2 AND tenant_id = $3`,
      [po.quantity, po.drug_name, getTenantId()]
    );
    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.delete('/api/purchase-orders/:id', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      'DELETE FROM purchase_orders WHERE id = $1 AND tenant_id = $2 RETURNING id',
      [req.params.id, getTenantId()]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: true, message: 'Purchase order not found' });
      return;
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

export default router;
