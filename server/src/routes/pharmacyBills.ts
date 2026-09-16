import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import pool from '../db/pool';
import { readClinicProfile } from '../config/reader';

const router = Router();

function getTenantId(): string {
  return readClinicProfile().GLOBAL_SAAS_TENANT_ID;
}

// Sale tiers -> base units and price for a chosen tier.
function unitsPerTier(item: any, unit?: string | null): number {
  const u = String(unit || '').toLowerCase();
  if (item.carton_label && u === String(item.carton_label).toLowerCase()) return Math.max(1, Number(item.units_per_carton) || 1);
  if (item.pack_label && u === String(item.pack_label).toLowerCase()) return Math.max(1, Number(item.units_per_pack) || 1);
  return 1;
}
function priceForTier(item: any, unit?: string | null): number {
  const base = Number(item.price) || 0;
  const perPack = Math.max(1, Number(item.units_per_pack) || 1);
  const perCarton = Math.max(1, Number(item.units_per_carton) || 1);
  const u = String(unit || '').toLowerCase();
  if (item.carton_label && u === String(item.carton_label).toLowerCase()) {
    if (item.carton_price !== null && item.carton_price !== undefined) return Number(item.carton_price) || 0;
    if (item.pack_price !== null && item.pack_price !== undefined) return Math.round(Number(item.pack_price) * (perCarton / perPack) * 100) / 100;
    return Math.round(base * perCarton * 100) / 100;
  }
  if (item.pack_label && u === String(item.pack_label).toLowerCase()) {
    if (item.pack_price !== null && item.pack_price !== undefined) return Number(item.pack_price) || 0;
    return Math.round(base * perPack * 100) / 100;
  }
  return base;
}

// Deduct `qty` base units across an item's batches, first-expiry-first-out.
async function deductStock(client: any, tenantId: string, drugName: string, qty: number): Promise<number> {
  const batches = await client.query(
    `SELECT id, stock_count FROM inventory_items
      WHERE tenant_id = $1 AND category = 'pharmacy' AND is_active = true
        AND lower(trim(drug_name)) = lower(trim($2))
      ORDER BY expiry_date ASC NULLS LAST, created_at ASC`,
    [tenantId, drugName]
  );
  let remaining = qty;
  for (const b of batches.rows) {
    if (remaining <= 0) break;
    const stock = Number(b.stock_count) || 0;
    if (stock <= 0) continue;
    const d = Math.min(stock, remaining);
    await client.query('UPDATE inventory_items SET stock_count = stock_count - $1 WHERE id = $2', [d, b.id]);
    remaining -= d;
  }
  return remaining;
}

// Restore `qty` base units to one batch (totals stay correct).
async function restoreStock(client: any, tenantId: string, drugName: string, qty: number): Promise<void> {
  const b = await client.query(
    `SELECT id FROM inventory_items
      WHERE tenant_id = $1 AND category = 'pharmacy' AND lower(trim(drug_name)) = lower(trim($2))
      ORDER BY expiry_date ASC NULLS LAST, created_at ASC LIMIT 1`,
    [tenantId, drugName]
  );
  if (b.rows[0]) await client.query('UPDATE inventory_items SET stock_count = stock_count + $1 WHERE id = $2', [qty, b.rows[0].id]);
}

// GET /api/pharmacy-bills/queue -- prescriptions with no quantity yet.
router.get('/api/pharmacy-bills/queue', async (_req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const result = await pool.query(
      `SELECT pr.id, pr.drug_name, pr.dosage, pr.instructions, pr.created_at,
              enc.patient_id, p.full_name AS patient_name, p.hospital_number,
              (SELECT CASE WHEN COUNT(*) > 0 THEN (SELECT id FROM insurance_cases c WHERE c.patient_id = enc.patient_id AND c.status='active' ORDER BY c.created_at DESC LIMIT 1) END
                 FROM insurance_cases c WHERE c.patient_id = enc.patient_id AND c.status='active') AS active_case_id
         FROM prescriptions pr
         JOIN encounters enc ON enc.id = pr.encounter_id
         JOIN patients p ON p.id = enc.patient_id
        WHERE pr.tenant_id = $1
          AND COALESCE(pr.is_paid, false) = false
          AND pr.status <> 'cancelled'
          AND COALESCE(pr.quantity, 0) = 0
          AND NOT EXISTS (SELECT 1 FROM pharmacy_bills pb WHERE pb.prescription_id = pr.id AND pb.status <> 'cancelled')
        ORDER BY pr.created_at ASC`,
      [tenantId]
    );
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// POST /api/pharmacy-bills -- pharmacist quantifies an order and creates the bill.
router.post('/api/pharmacy-bills', async (req: Request, res: Response) => {
  const tenantId = getTenantId();
  const { patient_id, prescription_id, encounter_id, billed_by, notes, items } = req.body || {};
  if (!patient_id || !Array.isArray(items) || items.length === 0) {
    res.status(400).json({ error: true, message: 'patient_id and at least one item are required' });
    return;
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Resolve + validate each line and compute base units / price.
    const lines: any[] = [];
    for (const raw of items) {
      const inventoryItemId = raw.inventory_item_id || raw.service_id;
      const qty = parseInt(String(raw.quantity ?? 1), 10) || 1;
      if (qty <= 0) { await client.query('ROLLBACK'); res.status(400).json({ error: true, message: 'Quantity must be greater than 0' }); return; }
      const invRes = await client.query(
        `SELECT * FROM inventory_items WHERE id = $1 AND tenant_id = $2 AND category = 'pharmacy' AND is_active = true`,
        [inventoryItemId, tenantId]
      );
      if (invRes.rows.length === 0) { await client.query('ROLLBACK'); res.status(400).json({ error: true, message: 'Item not found in pharmacy inventory' }); return; }
      const item = invRes.rows[0];
      const unit = raw.unit || item.base_unit || 'unit';
      const per = unitsPerTier(item, unit);
      const baseQty = Math.round(qty * per);
      const unitPrice = priceForTier(item, unit);
      const total = Math.round(unitPrice * qty * 100) / 100;
      lines.push({ item, unit, qty, baseQty, unitPrice, total, drugName: item.drug_name });
    }

    // Hold stock (deduct base units) — enough for every line.
    for (const l of lines) {
      const remaining = await deductStock(client, tenantId, l.drugName, l.baseQty);
      if (remaining > 0) {
        await client.query('ROLLBACK');
        res.status(400).json({ error: true, message: `Insufficient stock for ${l.drugName}` });
        return;
      }
    }

    const billId = uuidv4();
    const numRes = await client.query(
      `SELECT COALESCE(MAX(SUBSTRING(bill_number FROM '(\\d+)$')::int), 0) + 1 AS n
         FROM pharmacy_bills WHERE tenant_id = $1 AND bill_number LIKE 'PHB-%'`,
      [tenantId]
    );
    const billNumber = `PHB-${String(numRes.rows[0]?.n || 1).padStart(5, '0')}`;
    const total = lines.reduce((s, l) => s + l.total, 0);

    await client.query(
      `INSERT INTO pharmacy_bills (id, tenant_id, bill_number, patient_id, prescription_id, encounter_id, status, total, billed_by, notes)
       VALUES ($1, $2, $3, $4, $5, $6, 'awaiting_payment', $7, $8, $9)`,
      [billId, tenantId, billNumber, patient_id, prescription_id || null, encounter_id || null, total, billed_by || null, notes || null]
    );
    for (const l of lines) {
      await client.query(
        `INSERT INTO pharmacy_bill_items (id, tenant_id, bill_id, inventory_item_id, drug_name, unit, quantity, base_quantity, unit_price, total_price)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [uuidv4(), tenantId, billId, l.item.id, l.drugName, l.unit, l.qty, l.baseQty, l.unitPrice, l.total]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({ id: billId, bill_number: billNumber, total, status: 'awaiting_payment' });
  } catch (err: any) {
    try { await client.query('ROLLBACK'); } catch {}
    res.status(500).json({ error: true, message: err.message });
  } finally {
    client.release();
  }
});

// GET /api/pharmacy-bills -- list (optionally by status / patient).
router.get('/api/pharmacy-bills', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const { status, patient_id } = req.query;
    let q = `SELECT b.*, p.full_name AS patient_name, p.hospital_number,
                    (SELECT json_agg(row_to_json(i)) FROM pharmacy_bill_items i WHERE i.bill_id = b.id) AS items
               FROM pharmacy_bills b JOIN patients p ON p.id = b.patient_id
              WHERE b.tenant_id = $1`;
    const params: any[] = [tenantId];
    if (status) { params.push(status); q += ` AND b.status = $${params.length}`; }
    if (patient_id) { params.push(patient_id); q += ` AND b.patient_id = $${params.length}`; }
    q += ' ORDER BY b.created_at DESC';
    const result = await pool.query(q, params);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// POST /api/pharmacy-bills/:id/cancel -- release the stock hold.
router.post('/api/pharmacy-bills/:id/cancel', async (req: Request, res: Response) => {
  const tenantId = getTenantId();
  const { id } = req.params;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const bill = await client.query('SELECT * FROM pharmacy_bills WHERE id = $1 AND tenant_id = $2 FOR UPDATE', [id, tenantId]);
    if (bill.rows.length === 0) { await client.query('ROLLBACK'); res.status(404).json({ error: true, message: 'Bill not found' }); return; }
    if (bill.rows[0].status === 'cancelled') { await client.query('ROLLBACK'); res.json({ success: true }); return; }
    if (bill.rows[0].status === 'dispensed' || bill.rows[0].status === 'partially_dispensed') {
      await client.query('ROLLBACK');
      res.status(400).json({ error: true, message: 'Dispensed bills cannot be cancelled' });
      return;
    }
    const items = await client.query('SELECT drug_name, base_quantity FROM pharmacy_bill_items WHERE bill_id = $1', [id]);
    for (const it of items.rows) await restoreStock(client, tenantId, it.drug_name, Number(it.base_quantity) || 0);
    await client.query(`UPDATE pharmacy_bills SET status = 'cancelled', notes = COALESCE(notes,'') || ' [cancelled]' WHERE id = $1`, [id]);
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err: any) {
    try { await client.query('ROLLBACK'); } catch {}
    res.status(500).json({ error: true, message: err.message });
  } finally {
    client.release();
  }
});

// POST /api/pharmacy-bills/:id/dispense -- hand the (paid) medication over.
router.post('/api/pharmacy-bills/:id/dispense', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const { id } = req.params;
    const { dispensed_by } = req.body || {};
    const bill = await pool.query('SELECT * FROM pharmacy_bills WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
    if (bill.rows.length === 0) { res.status(404).json({ error: true, message: 'Bill not found' }); return; }
    if (bill.rows[0].status === 'cancelled') { res.status(400).json({ error: true, message: 'Bill is cancelled' }); return; }
    if (bill.rows[0].status !== 'paid') {
      res.status(402).json({ error: true, message: 'Payment required: this bill has not been paid at Paypoint yet.' });
      return;
    }
    await pool.query(
      `UPDATE pharmacy_bills SET status = 'dispensed', dispensed_by = $1, dispensed_at = NOW() WHERE id = $2`,
      [dispensed_by || null, id]
    );
    await pool.query(`UPDATE pharmacy_bill_items SET dispensed_quantity = quantity WHERE bill_id = $1`, [id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

export default router;
