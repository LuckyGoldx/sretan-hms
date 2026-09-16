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
                 WHERE o.tenant_id = $1 AND o.voided_at IS NULL`;
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
    const { drug_name, quantity, unit_price, customer_name, payment_method, notes, sold_by, unit, base_quantity } = req.body;

    if (!drug_name || !quantity || quantity <= 0) {
      res.status(400).json({ error: true, message: 'drug_name and quantity > 0 are required' });
      return;
    }

    // Resolve the inventory batches (FEFO) so we can convert the sold unit to
    // BASE units for stock, and snapshot the cost price at the moment of sale.
    const invRes = await pool.query(
      `SELECT id, cost_price, stock_count, units_per_pack, pack_label
         FROM inventory_items
        WHERE tenant_id = $1 AND category = 'pharmacy' AND is_active = true
          AND lower(trim(drug_name)) = lower(trim($2))
        ORDER BY expiry_date ASC NULLS LAST, created_at ASC`,
      [tenantId, drug_name]
    );
    if (invRes.rows.length === 0) {
      res.status(400).json({ error: true, message: `${drug_name} is not in the pharmacy inventory.` });
      return;
    }
    const batches = invRes.rows;
    const totalStock = batches.reduce((s: number, r: any) => s + (Number(r.stock_count) || 0), 0);
    const unitsPerPack = Math.max(1, Number(batches[0].units_per_pack) || 1);
    const isPack = unit && batches[0].pack_label && String(unit).toLowerCase() === String(batches[0].pack_label).toLowerCase();
    const baseQty = Number(base_quantity) > 0
      ? Math.round(Number(base_quantity))
      : (isPack ? Math.round(Number(quantity) * unitsPerPack) : Math.round(Number(quantity)));

    if (baseQty > totalStock) {
      res.status(400).json({ error: true, message: `Insufficient stock: only ${totalStock} base unit(s) of ${drug_name} available.` });
      return;
    }

    const id = uuidv4();
    const totalAmount = (unit_price || 0) * quantity;
    const costPrice = parseFloat(batches[0].cost_price) || 0;

    const result = await pool.query(
      `INSERT INTO otc_sales (id, tenant_id, drug_name, quantity, unit_price, total_amount, cost_price, customer_name, payment_method, notes, sold_by, unit, base_quantity)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
      [id, tenantId, drug_name, quantity, unit_price || 0, totalAmount, costPrice, customer_name || null, payment_method || 'cash', notes || null, sold_by || null,
       unit || null, baseQty]
    );

    // Deduct the BASE quantity across batches, first-expiry-first-out.
    let remaining = baseQty;
    for (const b of batches) {
      if (remaining <= 0) break;
      const stock = Number(b.stock_count) || 0;
      if (stock <= 0) continue;
      const deduct = Math.min(stock, remaining);
      await pool.query('UPDATE inventory_items SET stock_count = stock_count - $1 WHERE id = $2', [deduct, b.id]);
      remaining -= deduct;
    }

    res.status(201).json({ ...result.rows[0], base_quantity: baseQty });
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// Void a sale (restores stock, keeps immutable audit trail of who voided and when)
router.put('/api/otc-sales/:id/void', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const { id } = req.params;
    const { voided_by } = req.body;

    const existing = await pool.query(
      'SELECT * FROM otc_sales WHERE id = $1 AND tenant_id = $2',
      [id, tenantId]
    );
    if (existing.rows.length === 0) {
      res.status(404).json({ error: true, message: 'Sale not found' });
      return;
    }
    const sale = existing.rows[0];
    if (sale.voided_at) {
      res.status(400).json({ error: true, message: 'Sale has already been voided' });
      return;
    }

    await pool.query(
      'UPDATE otc_sales SET voided_at = NOW(), voided_by = $1 WHERE id = $2',
      [voided_by || null, id]
    );

    // Restore the BASE quantity to one batch (no stock ledger to know which
    // batches the sale drew from; totals stay correct). Previously this added
    // the quantity to EVERY matching batch, over-restoring stock.
    const restoreQty = Number(sale.base_quantity) > 0 ? Number(sale.base_quantity) : Number(sale.quantity) || 0;
    const batch = await pool.query(
      `SELECT id FROM inventory_items
        WHERE tenant_id = $1 AND category = 'pharmacy' AND lower(trim(drug_name)) = lower(trim($2))
        ORDER BY expiry_date ASC NULLS LAST, created_at ASC LIMIT 1`,
      [tenantId, sale.drug_name]
    );
    if (batch.rows[0]) {
      await pool.query('UPDATE inventory_items SET stock_count = stock_count + $1 WHERE id = $2', [restoreQty, batch.rows[0].id]);
    }

    res.json({ success: true, message: 'Sale voided and stock restored' });
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

export default router;
