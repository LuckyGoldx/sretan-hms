import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import pool from '../db/pool';
import { readClinicProfile } from '../config/reader';
import { clockGuard } from '../middleware/clockGuard';
import { parsePagination } from '../utils/pagination';
import { isAdminRequest, actingUserId } from '../utils/authRole';

const router = Router();

function getTenantId(): string {
  return readClinicProfile().GLOBAL_SAAS_TENANT_ID;
}

router.get('/api/inventory', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const { search, below_reorder, category, show_inactive } = req.query;
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

    if (show_inactive !== 'true') {
      query += ' AND is_active = true';
    }

    query += ' ORDER BY drug_name ASC';

    const { limit, offset } = parsePagination(req.query);
    query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

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
    const { drug_name, batch_number, stock_count, reorder_level, expiry_date, supplier, category, unit_price, amount_type,
            base_unit, pack_label, units_per_pack, pack_price } = req.body;

    if (!drug_name) {
      res.status(400).json({ error: true, message: 'drug_name is required' });
      return;
    }

    const id = uuidv4();
    // The category-prefixed unique code is assigned by a database trigger.
    const result = await pool.query(
      `INSERT INTO inventory_items (id, tenant_id, drug_name, batch_number, stock_count, reorder_level, expiry_date, supplier, category, price, amount_type, base_unit, pack_label, units_per_pack, pack_price)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING *`,
      [id, tenantId, drug_name, batch_number || null, stock_count || 0, reorder_level || 10, expiry_date || null, supplier || null, category || 'pharmacy', unit_price || 0, amount_type || 'units',
       base_unit || null, pack_label || null,
       units_per_pack !== undefined && units_per_pack !== null ? Math.max(1, parseInt(String(units_per_pack), 10) || 1) : 1,
       pack_price !== undefined && pack_price !== null && pack_price !== '' ? pack_price : null]
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
    const { stock_count, stock_count_delta, drug_name, batch_number, reorder_level, expiry_date, supplier, unit_price, cost_price, amount_type, is_active,
            base_unit, pack_label, units_per_pack, pack_price } = req.body;

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
        cost_price = COALESCE($8, cost_price),
        amount_type = COALESCE($9, amount_type),
        is_active = COALESCE($10, is_active),
        base_unit = COALESCE($11, base_unit),
        pack_label = COALESCE($12, pack_label),
        units_per_pack = COALESCE($13, units_per_pack),
        pack_price = COALESCE($14, pack_price)
       WHERE id = $15 AND tenant_id = $16
       RETURNING *`,
      [drug_name || null, batch_number || null, finalStock !== undefined ? finalStock : null, reorder_level || null, expiry_date || null, supplier || null,
       unit_price !== undefined ? unit_price : null, cost_price !== undefined ? cost_price : null, amount_type || null, is_active !== undefined ? is_active : null,
       base_unit || null, pack_label || null,
       units_per_pack !== undefined && units_per_pack !== null ? Math.max(1, parseInt(String(units_per_pack), 10) || 1) : null,
       pack_price !== undefined && pack_price !== null && pack_price !== '' ? pack_price : null,
       id, tenantId]
    );

    const oldItem = existing.rows[0];
    const newItem = result.rows[0];

    // Audit price/cost changes (old -> new) so price history is visible even
    // after later edits; billing itself uses immutable per-sale snapshots.
    const priceChanged =
      Number(oldItem.price || 0) !== Number(newItem.price || 0) ||
      Number(oldItem.cost_price || 0) !== Number(newItem.cost_price || 0);
    if (priceChanged) {
      try {
        await pool.query(
          `INSERT INTO audit_logs (tenant_id, action, table_name, record_id, performed_by, old_data, new_data)
           VALUES ($1, 'UPDATE', 'inventory_items', $2, $3, $4, $5)`,
          [tenantId, id, req.body.performed_by || null, JSON.stringify(oldItem), JSON.stringify(newItem)]
        );
      } catch {}
    }

    res.json(newItem);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.delete('/api/inventory/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    if (!isAdminRequest(req)) {
      res.status(403).json({ error: true, message: 'Only administrators can delete inventory items' });
      return;
    }
    const { id } = req.params;

    const existing = await pool.query(
      'SELECT * FROM inventory_items WHERE id = $1 AND tenant_id = $2',
      [id, tenantId]
    );
    if (existing.rows.length === 0) {
      res.status(404).json({ error: true, message: 'Inventory item not found' });
      return;
    }
    const item = existing.rows[0];

    // Never leave dangling references: block the delete while the item is used
    // by insurance coverage rules or the lab test catalogue. Deactivate instead.
    const refs = await pool.query(
      `SELECT
         (SELECT COUNT(*)::int FROM insurance_provider_coverage_rules WHERE inventory_item_id = $1) AS coverage_rules,
         (SELECT COUNT(*)::int FROM lab_test_catalog WHERE inventory_item_id = $1) AS lab_catalog`,
      [id]
    );
    const ref = refs.rows[0] || { coverage_rules: 0, lab_catalog: 0 };
    if (ref.coverage_rules > 0 || ref.lab_catalog > 0) {
      const parts: string[] = [];
      if (ref.coverage_rules > 0) parts.push(`${ref.coverage_rules} insurance coverage rule(s)`);
      if (ref.lab_catalog > 0) parts.push(`${ref.lab_catalog} lab catalogue test(s)`);
      res.status(409).json({
        error: true,
        message: `This item is referenced by ${parts.join(' and ')}. Deactivate it (mark it Inactive) instead of deleting.`,
      });
      return;
    }

    await pool.query('DELETE FROM insurance_provider_coverage_rules WHERE inventory_item_id = $1', [id]);
    const result = await pool.query(
      'DELETE FROM inventory_items WHERE id = $1 AND tenant_id = $2 RETURNING *',
      [id, tenantId]
    );
    // Audit the deletion (performed_by may be null when the header is absent).
    await pool.query(
      `INSERT INTO audit_logs (tenant_id, action, table_name, record_id, performed_by, old_data)
       VALUES ($1, 'DELETE', 'inventory_items', $2, $3, $4)`,
      [tenantId, id, actingUserId(req), JSON.stringify(item)]
    ).catch(() => {});
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

    if (quantity_dispensed !== undefined && quantity_dispensed <= 0) {
      res.status(400).json({ error: true, message: 'Quantity to dispense must be greater than 0' });
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

    const qty = quantity_dispensed || prescription.quantity || 1;

    // Pharmacy only dispenses prescriptions that are already settled. Cash and
    // insurance billing (including any co-pay) happen at Paypoint before the
    // patient reaches the pharmacy, so there is no bill-to-insurance here.
    if (!prescription.is_paid) {
      res.status(402).json({
        error: true,
        message: 'Payment required: this prescription has not been paid or billed at Paypoint yet.',
      });
      return;
    }

    // Stock gate: never dispense more than is in stock.
    const stockRes = await pool.query(
      `SELECT COALESCE(SUM(stock_count), 0)::int AS available
         FROM inventory_items
        WHERE tenant_id = $1 AND category = 'pharmacy' AND is_active = true
          AND lower(trim(drug_name)) = lower(trim($2))`,
      [tenantId, prescription.drug_name]
    );
    const available = stockRes.rows[0]?.available || 0;
    if (available < qty) {
      res.status(400).json({ error: true, message: `Insufficient stock: only ${available} unit(s) of ${prescription.drug_name} available.` });
      return;
    }

    const inventoryResult = await pool.query(
      `SELECT * FROM inventory_items WHERE drug_name = $1 AND tenant_id = $2 AND category = 'pharmacy' AND stock_count > 0
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
    const { category } = req.query;
    let query = `SELECT * FROM inventory_items
       WHERE tenant_id = $1
         AND expiry_date IS NOT NULL
         AND expiry_date <= CURRENT_DATE + INTERVAL '30 days'
         AND expiry_date >= CURRENT_DATE`;
    const params: any[] = [tenantId];
    if (category) {
      query += ` AND category = $2`;
      params.push(category);
    }
    query += ` ORDER BY expiry_date ASC`;
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

export default router;
