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
    const { drug_name, batch_number, stock_count, reorder_level, expiry_date, supplier, category, unit_price, amount_type } = req.body;

    if (!drug_name) {
      res.status(400).json({ error: true, message: 'drug_name is required' });
      return;
    }

    const id = uuidv4();
    const result = await pool.query(
      `INSERT INTO inventory_items (id, tenant_id, drug_name, batch_number, stock_count, reorder_level, expiry_date, supplier, category, price, amount_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [id, tenantId, drug_name, batch_number || null, stock_count || 0, reorder_level || 10, expiry_date || null, supplier || null, category || 'pharmacy', unit_price || 0, amount_type || 'units']
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
    const { stock_count, stock_count_delta, drug_name, batch_number, reorder_level, expiry_date, supplier, unit_price, cost_price, amount_type, is_active } = req.body;

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
        is_active = COALESCE($10, is_active)
       WHERE id = $11 AND tenant_id = $12
       RETURNING *`,
      [drug_name || null, batch_number || null, finalStock !== undefined ? finalStock : null, reorder_level || null, expiry_date || null, supplier || null,
       unit_price !== undefined ? unit_price : null, cost_price !== undefined ? cost_price : null, amount_type || null, is_active !== undefined ? is_active : null, id, tenantId]
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
    const { prescription_id, quantity_dispensed, bill_to_insurance, created_by } = req.body;

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

    // Determine drug unit price for insurance billing
    let drugUnitPrice = 0;
    try {
      const priceRes = await pool.query(
        `SELECT price, selling_price FROM inventory_items WHERE drug_name = $1 AND tenant_id = $2 AND category = 'pharmacy' LIMIT 1`,
        [prescription.drug_name, tenantId]
      );
      if (priceRes.rows.length > 0) {
        const item = priceRes.rows[0];
        drugUnitPrice = parseFloat(item.selling_price ?? item.price ?? 0) || 0;
      }
    } catch {}

    // If billing to insurance, add drug charge to the active insurance case and allow dispensing without cash payment
    if (bill_to_insurance) {
      const encounterRes = await pool.query('SELECT patient_id FROM encounters WHERE id = $1', [prescription.encounter_id]);
      const patientId = encounterRes.rows[0]?.patient_id;
      if (!patientId) {
        res.status(400).json({ error: true, message: 'Could not determine patient for this prescription' });
        return;
      }
      const activeCase = await pool.query(
        `SELECT id, tenant_id FROM insurance_cases WHERE patient_id = $1 AND status = 'active' ORDER BY created_at DESC LIMIT 1`,
        [patientId]
      );
      if (activeCase.rows.length === 0) {
        res.status(400).json({ error: true, message: 'Patient has no active insurance case. Create one first.' });
        return;
      }
      const caseId = activeCase.rows[0].id;
      const caseTenant = activeCase.rows[0].tenant_id;
      // Check if drug already added to this case (by source prescription)
      const exists = await pool.query(
        `SELECT id FROM insurance_case_services WHERE case_id = $1 AND source_type = 'prescription' AND source_id = $2`,
        [caseId, prescription_id]
      );
      if (exists.rows.length === 0) {
        const svcId = uuidv4();
        const total = qty * drugUnitPrice;
        await pool.query(
          `INSERT INTO insurance_case_services (id, tenant_id, case_id, service_type, service_name, quantity, unit_price, total_price, source_type, source_id, added_by)
           VALUES ($1, $2, $3, 'pharmacy', $4, $5, $6, $7, 'prescription', $8, $9)`,
          [svcId, caseTenant, caseId, prescription.drug_name, qty, drugUnitPrice, total, prescription_id, created_by || null]
        );
        await pool.query(
          'UPDATE insurance_cases SET total_billed = (SELECT COALESCE(SUM(total_price),0) FROM insurance_case_services WHERE case_id = $1) WHERE id = $1',
          [caseId]
        );
      }
    } else if (!prescription.is_paid) {
      res.status(402).json({ error: true, message: 'Payment required: Prescription has not been paid for' });
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
