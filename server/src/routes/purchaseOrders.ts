import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import pool from '../db/pool';
import { readClinicProfile } from '../config/reader';

const router = Router();

function getTenantId(): string {
  return readClinicProfile().GLOBAL_SAAS_TENANT_ID;
}

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * Recompute an order's subtotal/total and payment totals from its items and
 * ledger, then set the lifecycle status. Single source of truth so the header
 * can never drift from the lines.
 */
async function recomputeOrder(orderId: string): Promise<any> {
  const head = await pool.query('SELECT discount, tax, status, status_source FROM purchase_orders WHERE id = $1', [orderId]);
  if (head.rows.length === 0) return null;
  const discount = Number(head.rows[0].discount) || 0;
  const tax = Number(head.rows[0].tax) || 0;

  const items = await pool.query(
    'SELECT COALESCE(SUM(total_price), 0) AS subtotal FROM purchase_order_items WHERE order_id = $1',
    [orderId]
  );
  const ledger = await pool.query(
    `SELECT
       COALESCE(SUM(CASE WHEN kind = 'payment' THEN amount ELSE 0 END), 0) AS paid,
       COALESCE(SUM(CASE WHEN kind = 'refund' THEN amount ELSE 0 END), 0) AS refunded
     FROM purchase_order_payments WHERE order_id = $1`,
    [orderId]
  );

  const subtotal = round2(items.rows[0].subtotal);
  const total = round2(subtotal - discount + tax);
  const paid = round2(ledger.rows[0].paid);
  const refunded = round2(ledger.rows[0].refunded);
  const net = round2(paid - refunded);

  let status = head.rows[0].status;
  // A manually-set status is respected until a new payment forces re-derivation.
  if (head.rows[0].status_source !== 'manual' && status !== 'received' && status !== 'cancelled') {
    if (net <= 0) status = 'pending';
    else if (net + 0.005 >= total && total > 0) status = 'paid';
    else status = 'partially_paid';
  }

  await pool.query(
    `UPDATE purchase_orders
        SET subtotal = $1, total = $2, amount_paid = $3, refunded_amount = $4, status = $5
      WHERE id = $6`,
    [subtotal, total, paid, refunded, status, orderId]
  );
  return { subtotal, total, paid, refunded, net, status };
}

const DETAIL_SELECT = `
  SELECT po.*, su.name AS created_by_name,
         GREATEST(po.total - (po.amount_paid - po.refunded_amount), 0) AS outstanding,
         COALESCE((
           SELECT json_agg(json_build_object(
                    'id', i.id, 'inventory_item_id', i.inventory_item_id, 'drug_name', i.drug_name,
                    'unit', i.unit, 'quantity', i.quantity, 'unit_price', i.unit_price,
                    'total_price', i.total_price, 'received_quantity', i.received_quantity)
                  ORDER BY i.created_at)
             FROM purchase_order_items i WHERE i.order_id = po.id
         ), '[]'::json) AS items,
         COALESCE((
           SELECT json_agg(json_build_object(
                    'id', pm.id, 'kind', pm.kind, 'amount', pm.amount, 'method', pm.method,
                    'reference', pm.reference, 'note', pm.note, 'paid_at', pm.paid_at,
                    'receipt_url', pm.receipt_url, 'created_by_name', su2.name)
                  ORDER BY pm.paid_at DESC)
             FROM purchase_order_payments pm
             LEFT JOIN staff_users su2 ON su2.id = pm.created_by
            WHERE pm.order_id = po.id
         ), '[]'::json) AS payments
    FROM purchase_orders po
    LEFT JOIN staff_users su ON su.id = po.created_by
`;

function normaliseItems(raw: any): Array<{ drug_name: string; unit: string | null; quantity: number; unit_price: number; inventory_item_id: string | null; total_price: number }> | { error: string } {
  if (!Array.isArray(raw) || raw.length === 0) return { error: 'At least one item is required' };
  const items: any[] = [];
  for (const it of raw) {
    const name = String(it?.drug_name || '').trim();
    if (!name) return { error: 'Every item needs a name' };
    const quantity = parseInt(it?.quantity, 10);
    if (!Number.isFinite(quantity) || quantity <= 0) return { error: `Quantity for ${name} must be greater than zero` };
    const unitPrice = Number(it?.unit_price);
    if (!Number.isFinite(unitPrice) || unitPrice < 0) return { error: `Unit price for ${name} must be zero or greater` };
      items.push({
        drug_name: name,
        unit: it?.unit ? String(it.unit).trim() : null,
        quantity,
        unit_price: round2(unitPrice),
        total_price: round2(quantity * unitPrice),
        inventory_item_id: it?.inventory_item_id || null,
      });
    }

  // Collapse duplicates: the same item (by inventory link or name) increases the
  // existing line's quantity instead of appearing twice.
  const merged: typeof items = [];
  for (const it of items) {
    const key = it.inventory_item_id ? `id:${it.inventory_item_id}` : `name:${it.drug_name.toLowerCase()}`;
    const found = merged.find((m) => (m.inventory_item_id ? `id:${m.inventory_item_id}` : `name:${m.drug_name.toLowerCase()}`) === key);
    if (found) {
      found.quantity += it.quantity;
      found.total_price = round2(found.quantity * found.unit_price);
    } else {
      merged.push({ ...it });
    }
  }
  return merged;
}

// GET /api/purchase-orders -- list with items, totals and outstanding
router.get('/api/purchase-orders', async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `${DETAIL_SELECT} WHERE po.tenant_id = $1 ORDER BY po.ordered_at DESC`,
      [getTenantId()]
    );
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// GET /api/purchase-orders/:id -- one order with items + payment ledger
router.get('/api/purchase-orders/:id', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `${DETAIL_SELECT} WHERE po.id = $1 AND po.tenant_id = $2`,
      [req.params.id, getTenantId()]
    );
    if (result.rows.length === 0) { res.status(404).json({ error: true, message: 'Purchase order not found' }); return; }
    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// POST /api/purchase-orders -- create a multi-item order (optional first payment)
router.post('/api/purchase-orders', async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const tenantId = getTenantId();
    const { supplier, supplier_address, supplier_phone, expected_at, notes, discount, tax, items, created_by, initial_payment, payment_method, payment_reference, payment_receipt_url } = req.body;

    const normalised = normaliseItems(items);
    if ('error' in normalised) { res.status(400).json({ error: true, message: normalised.error }); return; }
    const disc = Number(discount) || 0;
    const taxAmount = Number(tax) || 0;
    if (disc < 0 || taxAmount < 0) { res.status(400).json({ error: true, message: 'Discount and tax must be zero or greater' }); return; }
    const first = Number(initial_payment) || 0;
    if (first < 0) { res.status(400).json({ error: true, message: 'Initial payment must be zero or greater' }); return; }
    const previewSubtotal = normalised.reduce((s, it) => s + it.total_price, 0);
    const previewTotal = round2(previewSubtotal - disc + taxAmount);
    if (first > previewTotal + 0.005) {
      res.status(400).json({ error: true, message: `Initial payment cannot exceed the order total (₦${previewTotal.toLocaleString()})` });
      return;
    }

    const id = uuidv4();
    const poNumber = `PO-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

    await client.query('BEGIN');
    await client.query(
      `INSERT INTO purchase_orders
         (id, tenant_id, po_number, drug_name, quantity, unit_price, supplier, supplier_address, supplier_phone,
          expected_at, notes, discount, tax, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [
        id, tenantId, poNumber,
        normalised[0].drug_name, normalised[0].quantity, normalised[0].unit_price,
        supplier || null, supplier_address || null, supplier_phone || null,
        expected_at || null, notes || null, disc, taxAmount, created_by || null,
      ]
    );
    for (const it of normalised) {
      await client.query(
        `INSERT INTO purchase_order_items
           (tenant_id, order_id, inventory_item_id, drug_name, unit, quantity, unit_price, total_price)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [tenantId, id, it.inventory_item_id, it.drug_name, it.unit, it.quantity, it.unit_price, it.total_price]
      );
    }
    if (first > 0) {
      await client.query(
        `INSERT INTO purchase_order_payments (tenant_id, order_id, kind, amount, method, reference, receipt_url, created_by)
         VALUES ($1,$2,'payment',$3,$4,$5,$6,$7)`,
        [tenantId, id, round2(first), payment_method || null, payment_reference || null, payment_receipt_url || null, created_by || null]
      );
    }    await client.query('COMMIT');
    await recomputeOrder(id);

    const result = await pool.query(`${DETAIL_SELECT} WHERE po.id = $1`, [id]);
    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    try { await client.query('ROLLBACK'); } catch {}
    res.status(500).json({ error: true, message: err.message });
  } finally {
    client.release();
  }
});

// PUT /api/purchase-orders/:id -- edit header + items (not once received/cancelled)
router.put('/api/purchase-orders/:id', async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const tenantId = getTenantId();
    const orderId = String(req.params.id);
    const existing = await client.query('SELECT * FROM purchase_orders WHERE id = $1 AND tenant_id = $2', [orderId, tenantId]);
    if (existing.rows.length === 0) { res.status(404).json({ error: true, message: 'Purchase order not found' }); return; }
    const order = existing.rows[0];
    if (order.status === 'received' || order.status === 'cancelled') {
      res.status(409).json({ error: true, message: `A ${order.status} order cannot be edited` });
      return;
    }

    const { supplier, supplier_address, supplier_phone, expected_at, notes, discount, tax, items, status } = req.body;
    const disc = discount !== undefined ? Number(discount) : Number(order.discount);
    const taxAmount = tax !== undefined ? Number(tax) : Number(order.tax);
    if (disc < 0 || taxAmount < 0) { res.status(400).json({ error: true, message: 'Discount and tax must be zero or greater' }); return; }

    // Manual status override (paid / partially paid / pending). Received and
    // cancelled have their own flows and can never be overridden here.
    const MANUAL_STATUSES = ['pending', 'partially_paid', 'paid'];
    const manualStatus = typeof status === 'string'
      && MANUAL_STATUSES.includes(status)
      && MANUAL_STATUSES.includes(order.status)
      ? status
      : null;

    await client.query('BEGIN');
    await client.query(
      `UPDATE purchase_orders SET
         supplier = $1, supplier_address = $2, supplier_phone = $3, expected_at = $4, notes = $5,
         discount = $6, tax = $7,
         status = COALESCE($8, status),
         status_source = CASE WHEN $9 THEN 'manual' ELSE status_source END
       WHERE id = $10 AND tenant_id = $11`,
      [
        supplier !== undefined ? (supplier || null) : order.supplier,
        supplier_address !== undefined ? (supplier_address || null) : order.supplier_address,
        supplier_phone !== undefined ? (supplier_phone || null) : order.supplier_phone,
        expected_at !== undefined ? (expected_at || null) : order.expected_at,
        notes !== undefined ? (notes || null) : order.notes,
        disc, taxAmount, manualStatus, !!manualStatus, orderId, tenantId,
      ]
    );

    if (items !== undefined) {
      const normalised = normaliseItems(items);
      if ('error' in normalised) { await client.query('ROLLBACK'); res.status(400).json({ error: true, message: normalised.error }); return; }
      await client.query('DELETE FROM purchase_order_items WHERE order_id = $1', [orderId]);
      for (const it of normalised) {
        await client.query(
          `INSERT INTO purchase_order_items
             (tenant_id, order_id, inventory_item_id, drug_name, unit, quantity, unit_price, total_price)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [tenantId, orderId, it.inventory_item_id, it.drug_name, it.unit, it.quantity, it.unit_price, it.total_price]
        );
      }
    }
    await client.query('COMMIT');
    await recomputeOrder(orderId);

    const result = await pool.query(`${DETAIL_SELECT} WHERE po.id = $1`, [orderId]);
    res.json(result.rows[0]);
  } catch (err: any) {
    try { await client.query('ROLLBACK'); } catch {}
    res.status(500).json({ error: true, message: err.message });
  } finally {
    client.release();
  }
});

// POST /api/purchase-orders/:id/payments -- record a payment or a refund
router.post('/api/purchase-orders/:id/payments', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const orderId = String(req.params.id);
    const { kind, amount, method, reference, note, receipt_url, created_by } = req.body;
    const type = kind === 'refund' ? 'refund' : 'payment';
    const value = round2(Number(amount));
    if (!Number.isFinite(value) || value <= 0) { res.status(400).json({ error: true, message: 'Amount must be greater than zero' }); return; }

    const order = await pool.query('SELECT * FROM purchase_orders WHERE id = $1 AND tenant_id = $2', [orderId, tenantId]);
    if (order.rows.length === 0) { res.status(404).json({ error: true, message: 'Purchase order not found' }); return; }
    if (order.rows[0].status === 'cancelled') { res.status(409).json({ error: true, message: 'A cancelled order cannot take payments or refunds' }); return; }

    const net = round2(Number(order.rows[0].amount_paid) - Number(order.rows[0].refunded_amount));
    if (type === 'refund') {
      if (value > net) { res.status(400).json({ error: true, message: `Refund cannot exceed the amount held (₦${net.toLocaleString()})` }); return; }
    } else {
      const outstanding = round2(Math.max(Number(order.rows[0].total) - net, 0));
      if (outstanding <= 0) { res.status(409).json({ error: true, message: 'This order is already fully paid' }); return; }
      if (value > outstanding + 0.005) {
        res.status(400).json({ error: true, message: `Amount exceeds the outstanding balance (₦${outstanding.toLocaleString()})` });
        return;
      }
      // A real payment re-derives the payment status.
      await pool.query(`UPDATE purchase_orders SET status_source = 'auto' WHERE id = $1`, [orderId]);
    }

    await pool.query(
      `INSERT INTO purchase_order_payments (tenant_id, order_id, kind, amount, method, reference, note, receipt_url, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [tenantId, orderId, type, value, method || null, reference || null, note || null, receipt_url || null, created_by || null]
    );
    await recomputeOrder(orderId);

    const result = await pool.query(`${DETAIL_SELECT} WHERE po.id = $1`, [orderId]);
    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// POST /api/purchase-orders/:id/receive -- receive stock for every item
router.post('/api/purchase-orders/:id/receive', async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const tenantId = getTenantId();
    const orderId = String(req.params.id);
    const { performed_by } = req.body || {};

    const head = await client.query('SELECT * FROM purchase_orders WHERE id = $1 AND tenant_id = $2', [orderId, tenantId]);
    if (head.rows.length === 0) { res.status(404).json({ error: true, message: 'Purchase order not found' }); return; }
    if (head.rows[0].status === 'received') { res.status(409).json({ error: true, message: 'This order has already been received' }); return; }
    if (head.rows[0].status === 'cancelled') { res.status(409).json({ error: true, message: 'A cancelled order cannot be received' }); return; }

    const items = await client.query(
      `SELECT * FROM purchase_order_items WHERE order_id = $1 ORDER BY created_at`,
      [orderId]
    );

    await client.query('BEGIN');
    for (const it of items.rows) {
      let inventoryId = it.inventory_item_id as string | null;
      if (inventoryId) {
        const upd = await client.query(
          'UPDATE inventory_items SET stock_count = stock_count + $1 WHERE id = $2 AND tenant_id = $3',
          [it.quantity, inventoryId, tenantId]
        );
        if (upd.rowCount === 0) inventoryId = null;
      }
      if (!inventoryId) {
        const match = await client.query(
          `SELECT id FROM inventory_items
            WHERE tenant_id = $1 AND category = 'pharmacy' AND lower(trim(drug_name)) = lower(trim($2))
            ORDER BY created_at DESC LIMIT 1`,
          [tenantId, it.drug_name]
        );
        if (match.rows.length > 0) {
          inventoryId = match.rows[0].id;
          await client.query('UPDATE inventory_items SET stock_count = stock_count + $1 WHERE id = $2', [it.quantity, inventoryId]);
        } else {
          const created = await client.query(
            `INSERT INTO inventory_items (tenant_id, drug_name, category, amount_type, price, cost_price, stock_count, supplier)
             VALUES ($1,$2,'pharmacy','units',$3,$3,$4,$5) RETURNING id`,
            [tenantId, it.drug_name, it.unit_price, it.quantity, head.rows[0].supplier]
          );
          inventoryId = created.rows[0].id;
        }
      }
      await client.query(
        'UPDATE purchase_order_items SET received_quantity = quantity, inventory_item_id = $1 WHERE id = $2',
        [inventoryId, it.id]
      );
    }
    await client.query(
      `UPDATE purchase_orders SET status = 'received', received_at = NOW() WHERE id = $1`,
      [orderId]
    );
    await client.query(
      `INSERT INTO audit_logs (tenant_id, action, table_name, record_id, performed_by, old_data, new_data)
       VALUES ($1, 'RECEIVE', 'purchase_orders', $2, $3, $4, $5)`,
      [tenantId, orderId, performed_by || null, JSON.stringify({ status: head.rows[0].status }), JSON.stringify({ status: 'received' })]
    );
    await client.query('COMMIT');

    const result = await pool.query(`${DETAIL_SELECT} WHERE po.id = $1`, [orderId]);
    res.json(result.rows[0]);
  } catch (err: any) {
    try { await client.query('ROLLBACK'); } catch {}
    res.status(500).json({ error: true, message: err.message });
  } finally {
    client.release();
  }
});

// POST /api/purchase-orders/:id/cancel
router.post('/api/purchase-orders/:id/cancel', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const orderId = String(req.params.id);
    const { reason, performed_by } = req.body || {};
    const head = await pool.query('SELECT * FROM purchase_orders WHERE id = $1 AND tenant_id = $2', [orderId, tenantId]);
    if (head.rows.length === 0) { res.status(404).json({ error: true, message: 'Purchase order not found' }); return; }
    if (head.rows[0].status === 'cancelled') { res.status(409).json({ error: true, message: 'This order is already cancelled' }); return; }

    await pool.query(
      `UPDATE purchase_orders SET status = 'cancelled', cancelled_at = NOW(), cancel_reason = $1 WHERE id = $2`,
      [reason || null, orderId]
    );
    await pool.query(
      `INSERT INTO audit_logs (tenant_id, action, table_name, record_id, performed_by, old_data, new_data)
       VALUES ($1, 'CANCEL', 'purchase_orders', $2, $3, $4, $5)`,
      [tenantId, orderId, performed_by || null, JSON.stringify({ status: head.rows[0].status }), JSON.stringify({ status: 'cancelled', reason: reason || null })]
    );
    const result = await pool.query(`${DETAIL_SELECT} WHERE po.id = $1`, [orderId]);
    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// DELETE /api/purchase-orders/:id -- only untouched (unpaid, unreceived) orders
router.delete('/api/purchase-orders/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const orderId = String(req.params.id);
    const head = await pool.query('SELECT * FROM purchase_orders WHERE id = $1 AND tenant_id = $2', [orderId, tenantId]);
    if (head.rows.length === 0) { res.status(404).json({ error: true, message: 'Purchase order not found' }); return; }
    const order = head.rows[0];
    const ledger = await pool.query('SELECT COUNT(*)::int AS n FROM purchase_order_payments WHERE order_id = $1', [orderId]);
    if (order.status === 'received' || (ledger.rows[0]?.n || 0) > 0) {
      res.status(409).json({ error: true, message: 'An order with payments or received stock cannot be deleted. Cancel it instead.' });
      return;
    }
    await pool.query('DELETE FROM purchase_orders WHERE id = $1 AND tenant_id = $2', [orderId, tenantId]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

export default router;
