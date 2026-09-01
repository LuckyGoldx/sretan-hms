import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import pool from '../db/pool';
import { readClinicProfile } from '../config/reader';
import { clockGuard } from '../middleware/clockGuard';

const router = Router();

function getTenantId(): string {
  return readClinicProfile().GLOBAL_SAAS_TENANT_ID;
}

router.get('/api/prescriptions', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const { encounter_id, status, doctor_id, encounter_type } = req.query;
    let query = `SELECT p.*, s.name as doctor_name, s.role as doctor_role,
                  e.is_consultation, e.department_id, dept.name AS department_name,
                  (EXISTS(SELECT 1 FROM insurance_case_services ics WHERE ics.source_id = p.id AND ics.tenant_id = p.tenant_id)) as billed_to_insurance
                  FROM prescriptions p
                  LEFT JOIN encounters e ON e.id = p.encounter_id
                  LEFT JOIN staff_users s ON s.id = e.staff_id
                  LEFT JOIN departments dept ON dept.id = e.department_id
                  WHERE p.tenant_id = $1`;
    const params: any[] = [tenantId];
    let paramIndex = 2;

    if (encounter_id) {
      query += ` AND p.encounter_id = $${paramIndex}`;
      params.push(encounter_id);
      paramIndex++;
    }

    if (status) {
      query += ` AND p.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (doctor_id) {
      query += ` AND e.staff_id = $${paramIndex}`;
      params.push(doctor_id);
      paramIndex++;
    }
    if (encounter_type) { query += ` AND e.encounter_type = $${paramIndex}`; params.push(encounter_type); paramIndex++; }
    query += ' ORDER BY p.created_at DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.get('/api/prescriptions/unpaid', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const result = await pool.query(
      `SELECT pr.id, pr.drug_name, pr.dosage, pr.quantity, pr.instructions, pr.status,
              COALESCE(pr.is_paid, false) as is_paid, pr.created_at,
              enc.patient_id, p.full_name, p.hospital_number, p.phone,
              s.name as doctor_name, s.role as doctor_role,
              enc.is_consultation, enc.department_id, dept.name AS department_name,
              (SELECT COALESCE(MAX(ii.price), 0) FROM inventory_items ii WHERE ii.drug_name ILIKE pr.drug_name AND ii.category = 'pharmacy' AND ii.is_active = true) as unit_price
       FROM prescriptions pr
       JOIN encounters enc ON enc.id = pr.encounter_id
       JOIN patients p ON p.id = enc.patient_id
       LEFT JOIN staff_users s ON s.id = enc.staff_id
       LEFT JOIN departments dept ON dept.id = enc.department_id
       WHERE pr.tenant_id = $1 AND pr.status = 'pending' AND COALESCE(pr.is_paid, false) = false
       ORDER BY pr.created_at DESC`,
      [tenantId]
    );
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.post('/api/prescriptions', async (req: Request, res: Response) => {
  try {
    await clockGuard(pool, 'prescriptions');

    const tenantId = getTenantId();
    const { encounter_id, drug_name, dosage, quantity, instructions } = req.body;

    if (!encounter_id || !drug_name) {
      res.status(400).json({ error: true, message: 'encounter_id and drug_name are required' });
      return;
    }

    const id = uuidv4();
    const result = await pool.query(
      `INSERT INTO prescriptions (id, tenant_id, encounter_id, drug_name, dosage, quantity, instructions)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [id, tenantId, encounter_id, drug_name, dosage || null, quantity || null, instructions || null]
    );

    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.put('/api/prescriptions/:id/dispense', async (req: Request, res: Response) => {
  try {
    await clockGuard(pool, 'prescriptions');

    const tenantId = getTenantId();
    const { id } = req.params;

    const prescResult = await pool.query(
      'SELECT * FROM prescriptions WHERE id = $1 AND tenant_id = $2',
      [id, tenantId]
    );

    if (prescResult.rows.length === 0) {
      res.status(404).json({ error: true, message: 'Prescription not found' });
      return;
    }

    const prescription = prescResult.rows[0];

    const inventoryResult = await pool.query(
      `SELECT * FROM inventory_items WHERE drug_name = $1 AND tenant_id = $2 AND stock_count > 0
       ORDER BY expiry_date ASC`,
      [prescription.drug_name, tenantId]
    );

    let qtyToDispense = prescription.quantity || 1;

    for (const item of inventoryResult.rows) {
      if (qtyToDispense <= 0) break;

      const deduct = Math.min(item.stock_count, qtyToDispense);
      await pool.query(
        'UPDATE inventory_items SET stock_count = stock_count - $1 WHERE id = $2',
        [deduct, item.id]
      );
      qtyToDispense -= deduct;
    }

    const result = await pool.query(
      `UPDATE prescriptions SET status = 'dispensed' WHERE id = $1 RETURNING *`,
      [id]
    );

    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

export default router;
