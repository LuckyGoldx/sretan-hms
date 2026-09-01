import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import pool from '../db/pool';
import { readClinicProfile } from '../config/reader';
import { generateNumber } from '../utils/numbering';

const router = Router();

function getTenantId(): string {
  return readClinicProfile().GLOBAL_SAAS_TENANT_ID;
}

const SPECIMEN_TYPES = ['Blood', 'Urine', 'Stool', 'Sputum', 'CSF', 'Swab', 'Tissue', 'Serum', 'Plasma', 'Other'];
const PRIORITIES = ['routine', 'urgent', 'stat'];
const ORDER_STATUSES = ['ordered', 'collected', 'processing', 'review', 'completed', 'cancelled'];

// Replace an order's specimen list (source of truth = lab_order_specimens).
// Returns the cleaned list of specimen names.
async function replaceOrderSpecimens(orderId: string, specimenTypes: any[]): Promise<string[]> {
  const clean = Array.from(new Set(
    (specimenTypes || []).map((s) => String(s).trim()).filter(Boolean)
  ));
  await pool.query('DELETE FROM lab_order_specimens WHERE order_id = $1', [orderId]);
  if (clean.length) {
    const tenantId = getTenantId();
    for (const st of clean) {
      await pool.query(
        `INSERT INTO lab_order_specimens (tenant_id, order_id, specimen_type, collected_at)
         VALUES ($1, $2, $3, NOW()) ON CONFLICT (order_id, specimen_type) DO NOTHING`,
        [tenantId, orderId, st]
      );
    }
  }
  return clean;
}
router.get('/api/lab-orders', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const { status, encounter_id, doctor_id, specimen_type, priority, is_paid, encounter_type } = req.query;

    let query = `SELECT l.*, enc.patient_id, pat.hospital_number,
                  COALESCE(l.patient_name, pat.full_name, '') AS patient_name,
                  doc.name AS doctor_name, doc.role AS doctor_role,
                  enc.is_consultation, enc.department_id, dept.name AS department_name,
                  (SELECT COALESCE(json_agg(s.specimen_type ORDER BY s.created_at), '[]'::json) FROM lab_order_specimens s WHERE s.order_id = l.id) AS specimens,
                  (SELECT pr.name FROM patient_insurance_policies pp JOIN insurance_providers pr ON pp.provider_id = pr.id WHERE pp.patient_id = pat.id AND pp.is_active = true AND pp.coverage_type = 'primary' AND (pp.end_date IS NULL OR pp.end_date >= CURRENT_DATE) LIMIT 1) as primary_provider,
                  (SELECT s.name FROM lab_results lr JOIN staff_users s ON s.id = lr.entered_by WHERE lr.lab_order_id = l.id AND lr.entered_by IS NOT NULL AND lr.status = 'completed' LIMIT 1) as entered_by_name,
                  (SELECT s.name FROM lab_results lr JOIN staff_users s ON s.id = lr.approved_by WHERE lr.lab_order_id = l.id AND lr.approved_by IS NOT NULL LIMIT 1) as approved_by_name,
                  (SELECT MIN(lr.approved_at) FROM lab_results lr WHERE lr.lab_order_id = l.id AND lr.approved_at IS NOT NULL) as approved_at
                  FROM lab_orders l LEFT JOIN encounters enc ON enc.id = l.encounter_id LEFT JOIN patients pat ON pat.id = enc.patient_id LEFT JOIN staff_users doc ON doc.id = enc.staff_id LEFT JOIN departments dept ON dept.id = enc.department_id WHERE l.tenant_id = $1`;
    const params: any[] = [tenantId];
    let idx = 2;

    if (status) { query += ` AND l.status = $${idx}`; params.push(status); idx++; }
    if (encounter_id) { query += ` AND l.encounter_id = $${idx}`; params.push(encounter_id); idx++; }
    if (specimen_type) { query += ` AND l.specimen_type = $${idx}`; params.push(specimen_type); idx++; }
    if (priority) { query += ` AND l.priority = $${idx}`; params.push(priority); idx++; }
    if (is_paid !== undefined) { query += ` AND l.is_paid = $${idx}`; params.push(is_paid === 'true'); idx++; }
    if (doctor_id) {
      query += ` AND l.encounter_id IN (SELECT id FROM encounters WHERE staff_id = $${idx} AND tenant_id = $1)`;
      params.push(doctor_id);
      idx++;
    }
    if (encounter_type) { query += ` AND enc.encounter_type = $${idx}`; params.push(encounter_type); idx++; }

    query += ' ORDER BY l.created_at DESC';
    const result = await pool.query(query, params);

    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.post('/api/lab-orders/mark-read', async (req: Request, res: Response) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ error: true, message: 'ids array is required' });
      return;
    }
    const placeholders = ids.map((_: any, i: number) => `$${i + 1}`).join(',');
    await pool.query(`UPDATE lab_orders SET doctor_read_at = NOW() WHERE id IN (${placeholders})`, ids);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.get('/api/lab-orders/stats', async (_req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const result = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'ordered') as ordered,
        COUNT(*) FILTER (WHERE status = 'collected') as collected,
        COUNT(*) FILTER (WHERE status = 'processing') as processing,
        COUNT(*) FILTER (WHERE status = 'completed') as completed
      FROM lab_orders WHERE tenant_id = $1`, [tenantId]);
    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.post('/api/lab-orders', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const { encounter_id, test_name, specimen_type, priority, patient_name, patient_phone, referred_by, request_number, lab_number: providedLabNumber, payment_id, walkin_phone, doctor_comment } = req.body;

    if (!test_name) {
      res.status(400).json({ error: true, message: 'test_name is required' });
      return;
    }

    let labNumber = providedLabNumber
    if (!labNumber) {
      labNumber = await generateNumber(tenantId, 'lab', { prefix: 'LAB' });
    }

    let orderNumber: string | null = null
    if (request_number) {
      const ordResult = await pool.query(
        `SELECT COALESCE(MAX(SUBSTRING(order_number FROM 'ORD-(\\d+)')::int), 0) + 1 AS next_ord FROM lab_orders WHERE request_number = $1 AND order_number ~ '^ORD-'`,
        [request_number]
      );
      const nextOrd = ordResult.rows[0]?.next_ord || 1;
      orderNumber = `ORD-${String(nextOrd).padStart(3, '0')}`;
    }

    const id = uuidv4();
    const result = await pool.query(
      `INSERT INTO lab_orders (id, tenant_id, lab_number, request_number, order_number, encounter_id, test_name, specimen_type, priority, patient_name, patient_phone, referred_by, payment_id, is_paid, walkin_phone, doctor_comment)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16) RETURNING *`,
      [id, tenantId, labNumber, request_number || null, orderNumber, encounter_id || null, test_name, specimen_type || null, priority || 'routine',
       patient_name || null, patient_phone || null, referred_by || null, payment_id || null, payment_id ? true : (!encounter_id ? true : false), walkin_phone || null, doctor_comment || null]
    );

    // Keep lab_order_specimens in sync for backward compatibility.
    if (specimen_type && String(specimen_type).trim()) {
      await pool.query(
        `INSERT INTO lab_order_specimens (tenant_id, order_id, specimen_type) VALUES ($1, $2, $3)
         ON CONFLICT (order_id, specimen_type) DO NOTHING`,
        [tenantId, id, String(specimen_type).trim()]
      );
    }

    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.put('/api/lab-orders/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status, specimen_type, priority, collected_at, results_collected_at, doctor_read_at, results_collected_by, remarks, report_notes, method, specimens } = req.body;

    if (status !== undefined && !ORDER_STATUSES.includes(status)) {
      res.status(400).json({ error: true, message: `Invalid status: ${status}. Allowed: ${ORDER_STATUSES.join(', ')}` });
      return;
    }
    if (priority !== undefined && !PRIORITIES.includes(priority)) {
      res.status(400).json({ error: true, message: `Invalid priority: ${priority}. Allowed: ${PRIORITIES.join(', ')}` });
      return;
    }

    if (status === 'processing' || status === 'collected') {
      var paidCheck = await pool.query('SELECT is_paid FROM lab_orders WHERE id = $1', [id]);
      if (paidCheck.rows.length > 0 && !paidCheck.rows[0].is_paid) {
        res.status(402).json({ error: true, message: 'Payment required: Lab order has not been paid for' });
        return;
      }
    }

    // Resolve specimen list: explicit array (collect flow) > single specimen_type (edit flow) > keep existing.
    let primarySpecimen: string | null = null;
    const hasSpecimensPayload = Array.isArray(specimens) || specimen_type !== undefined;
    if (hasSpecimensPayload) {
      const list: any[] = Array.isArray(specimens) ? specimens : [specimen_type || ''];
      const clean = await replaceOrderSpecimens(id as string, list);
      primarySpecimen = clean.length ? clean[0] : null;
    }

    const result = await pool.query(
      `UPDATE lab_orders SET
        status = COALESCE($1, status),
        specimen_type = COALESCE($2, specimen_type),
        priority = COALESCE($3, priority),
        collected_at = COALESCE($4, collected_at),
        results_collected_at = COALESCE($5, results_collected_at),
        doctor_read_at = COALESCE($6, doctor_read_at),
        results_collected_by = COALESCE($7, results_collected_by),
        remarks = COALESCE($8, remarks),
        report_notes = COALESCE($9, report_notes),
        method = COALESCE($10, method)
       WHERE id = $11 RETURNING *`,
      [status || null, hasSpecimensPayload ? primarySpecimen : (specimen_type || null), priority || null, collected_at || null, results_collected_at || null, doctor_read_at || null, results_collected_by || null, remarks || null, report_notes || null, method || null, id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: true, message: 'Lab order not found' });
      return;
    }

    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.post('/api/lab-results', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const { lab_order_id, analyte_name, value, reference_range_low, reference_range_high, is_abnormal, entered_by,
            result_type, unit, ref_range_text, flag_status, remarks, method } = req.body;

    if (!lab_order_id || !analyte_name || value === undefined) {
      res.status(400).json({ error: true, message: 'lab_order_id, analyte_name, and value are required' });
      return;
    }

    const rtype = ['numeric', 'qualitative', 'narrative', 'ratio', 'range', 'free_text'].includes(result_type)
      ? result_type : 'numeric';
    const numericValue = typeof value === 'number' ? value : parseFloat(value);
    const numericLow = reference_range_low !== undefined && reference_range_low !== null && reference_range_low !== '' ? parseFloat(reference_range_low) : NaN;
    const numericHigh = reference_range_high !== undefined && reference_range_high !== null && reference_range_high !== '' ? parseFloat(reference_range_high) : NaN;

    const isNumericResult = !isNaN(numericValue);
    if (isNumericResult && numericValue < 0) {
      res.status(400).json({ error: true, message: 'Result value cannot be negative' });
      return;
    }
    if (!isNaN(numericLow) && !isNaN(numericHigh) && numericLow >= numericHigh) {
      res.status(400).json({ error: true, message: 'reference_range_low must be less than reference_range_high' });
      return;
    }

    // Determine abnormal + flag status
    // Priority: explicit client flag_status > client is_abnormal > auto computation.
    let computedAbnormal: boolean;
    let computedFlag: string;
    if (flag_status === 'abnormal' || flag_status === 'critical') {
      computedAbnormal = true;
      computedFlag = flag_status;
    } else if (flag_status === 'normal') {
      computedAbnormal = false;
      computedFlag = 'normal';
    } else if (is_abnormal !== undefined) {
      computedAbnormal = !!is_abnormal;
      computedFlag = computedAbnormal ? 'abnormal' : 'normal';
    } else {
      computedAbnormal = rtype === 'numeric'
        ? (!isNaN(numericLow) && !isNaN(numericHigh) && isNumericResult && (numericValue < numericLow || numericValue > numericHigh))
        : false;
      computedFlag = computedAbnormal ? 'abnormal' : 'normal';
    }

    const storedNumeric = (rtype === 'numeric' && isNumericResult) ? numericValue : null;

    const seqResult = await pool.query(`SELECT COALESCE(MAX(SUBSTRING(result_number FROM 'RES-2026-(\\d+)')::int), 0) + 1 AS next_num FROM lab_results WHERE result_number ~ '^RES-2026-'`);
    const nextNum = seqResult.rows[0]?.next_num || 1;
    const resultNumber = `RES-2026-${String(nextNum).padStart(5, '0')}`;

    const id = uuidv4();
    const now = new Date();
    const result = await pool.query(
      `INSERT INTO lab_results (id, tenant_id, lab_order_id, result_number, analyte_name, value,
         reference_range_low, reference_range_high, is_abnormal, entered_by,
         result_type, unit, numeric_value, ref_range_text, flag_status, remarks, method, entered_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18) RETURNING *`,
      [id, tenantId, lab_order_id, resultNumber, analyte_name, value,
       !isNaN(numericLow) ? reference_range_low : null, !isNaN(numericHigh) ? reference_range_high : null,
       computedAbnormal, entered_by || null,
       rtype, unit || null, storedNumeric, ref_range_text || null, computedFlag, remarks || null, method || null, now]
    );

    await pool.query(`UPDATE lab_orders SET status = 'processing' WHERE id = $1 AND status IN ('ordered', 'collected')`, [lab_order_id]);

    // Audit log INSERT
    await pool.query(
      `INSERT INTO audit_logs (tenant_id, action, table_name, record_id, performed_by, new_data)
       VALUES ($1, 'INSERT', 'lab_results', $2, $3, $4)`,
      [tenantId, id, entered_by || null, JSON.stringify(result.rows[0])]
    );

    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.put('/api/lab-results/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const { id } = req.params;
    const { analyte_name, value, reference_range_low, reference_range_high, is_abnormal, entered_by,
            result_type, unit, ref_range_text, flag_status, remarks, method } = req.body;

    if (!analyte_name || value === undefined) {
      res.status(400).json({ error: true, message: 'analyte_name and value are required' });
      return;
    }

    const rtype = ['numeric', 'qualitative', 'narrative', 'ratio', 'range', 'free_text'].includes(result_type)
      ? result_type : 'numeric';
    const numericValue = typeof value === 'number' ? value : parseFloat(value);
    const numericLow = reference_range_low !== undefined && reference_range_low !== null && reference_range_low !== '' ? parseFloat(reference_range_low) : NaN;
    const numericHigh = reference_range_high !== undefined && reference_range_high !== null && reference_range_high !== '' ? parseFloat(reference_range_high) : NaN;
    const isNumericResult = !isNaN(numericValue);

    if (isNumericResult && numericValue < 0) {
      res.status(400).json({ error: true, message: 'Result value cannot be negative' });
      return;
    }
    if (!isNaN(numericLow) && !isNaN(numericHigh) && numericLow >= numericHigh) {
      res.status(400).json({ error: true, message: 'reference_range_low must be less than reference_range_high' });
      return;
    }

    let computedAbnormal: boolean;
    let computedFlag: string;
    if (flag_status === 'abnormal' || flag_status === 'critical') {
      computedAbnormal = true;
      computedFlag = flag_status;
    } else if (flag_status === 'normal') {
      computedAbnormal = false;
      computedFlag = 'normal';
    } else if (is_abnormal !== undefined) {
      computedAbnormal = !!is_abnormal;
      computedFlag = computedAbnormal ? 'abnormal' : 'normal';
    } else {
      computedAbnormal = rtype === 'numeric'
        ? (!isNaN(numericLow) && !isNaN(numericHigh) && isNumericResult && (numericValue < numericLow || numericValue > numericHigh))
        : false;
      computedFlag = computedAbnormal ? 'abnormal' : 'normal';
    }

    const storedNumeric = (rtype === 'numeric' && isNumericResult) ? numericValue : null;

    const result = await pool.query(
      `UPDATE lab_results SET
        analyte_name = $1, value = $2,
        reference_range_low = $3, reference_range_high = $4,
        is_abnormal = $5, result_type = $6, unit = $7, numeric_value = $8,
        ref_range_text = $9, flag_status = $10, remarks = $11, method = $12,
        status = 'draft', edited_at = NOW()
       WHERE id = $13 RETURNING *`,
      [analyte_name, value,
       !isNaN(numericLow) ? reference_range_low : null, !isNaN(numericHigh) ? reference_range_high : null,
       computedAbnormal, rtype, unit || null, storedNumeric, ref_range_text || null, computedFlag, remarks || null, method || null, id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: true, message: 'Lab result not found' });
      return;
    }

    await pool.query(`UPDATE lab_orders SET status = 'processing' WHERE id = $1`, [result.rows[0].lab_order_id]);

    // Audit log UPDATE
    await pool.query(
      `INSERT INTO audit_logs (tenant_id, action, table_name, record_id, performed_by, new_data)
       VALUES ($1, 'UPDATE', 'lab_results', $2, $3, $4)`,
      [tenantId, id, entered_by || null, JSON.stringify(result.rows[0])]
    );

    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.put('/api/lab-results/:id/approve', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const { id } = req.params;
    const { approved_by } = req.body;

    const result = await pool.query(
      `UPDATE lab_results SET status = 'completed', approved_by = $1, approved_at = NOW() WHERE id = $2 RETURNING *`,
      [approved_by || null, id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: true, message: 'Lab result not found' });
      return;
    }

    // Audit log UPDATE
    await pool.query(
      `INSERT INTO audit_logs (tenant_id, action, table_name, record_id, performed_by, new_data)
       VALUES ($1, 'APPROVE', 'lab_results', $2, $3, $4)`,
      [tenantId, id, approved_by || null, JSON.stringify(result.rows[0])]
    );

    const labOrderId = result.rows[0].lab_order_id;
    const allCompleted = await pool.query(
      `SELECT COUNT(*) = SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as done FROM lab_results WHERE lab_order_id = $1`,
      [labOrderId]
    );
    if (allCompleted.rows[0]?.done) {
      await pool.query(`UPDATE lab_orders SET status = 'completed' WHERE id = $1`, [labOrderId]);
      // Reduce inventory for the completed test (never below zero)
        var orderData = await pool.query('SELECT test_name FROM lab_orders WHERE id = $1', [labOrderId]);
      if (orderData.rows.length > 0) {
        var testName = orderData.rows[0].test_name;
        await pool.query(
          `UPDATE inventory_items SET stock_count = GREATEST(0, stock_count - tim.quantity_consumed)
           FROM test_inventory_map tim WHERE tim.test_name = $1 AND tim.inventory_item_id = inventory_items.id
             AND inventory_items.category = 'lab' AND tim.tenant_id = $2`,
          [testName, getTenantId()]
        );
      }
    }

    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.get('/api/lab-results/:orderId', async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const { status } = req.query;
    var query = `SELECT lr.*, es.name as entered_by_name, es2.name as approved_by_name
                 FROM lab_results lr
                 LEFT JOIN staff_users es ON es.id = lr.entered_by
                 LEFT JOIN staff_users es2 ON es2.id = lr.approved_by
                 WHERE lr.lab_order_id = $1`;
    var params: any[] = [orderId];
    if (status) { query += ' AND lr.status = $2'; params.push(status); }
    query += ' ORDER BY lr.created_at';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.put('/api/lab-results/:id/reject', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const { id } = req.params;
    const { rejected_by } = req.body;
    const result = await pool.query(
      `UPDATE lab_results SET status = 'review', rejected_by = $1 WHERE id = $2 RETURNING *`, [rejected_by || null, id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: true, message: 'Lab result not found' });
      return;
    }
    // Return lab order to 'review' so it reappears in worklist for editing
    await pool.query(`UPDATE lab_orders SET status = 'review' WHERE id = $1`, [result.rows[0].lab_order_id]);

    // Audit log UPDATE
    await pool.query(
      `INSERT INTO audit_logs (tenant_id, action, table_name, record_id, performed_by, new_data)
       VALUES ($1, 'REJECT', 'lab_results', $2, $3, $4)`,
      [tenantId, id, rejected_by || null, JSON.stringify(result.rows[0])]
    );

    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.get('/api/lab-results', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const { status } = req.query;
    let query = `SELECT lr.*, lo.test_name, lo.encounter_id, lo.lab_number AS lab_number,
                  lo.patient_name AS walkin_name, lo.remarks AS order_remarks,
                  lo.specimen_type AS specimen_type, lo.priority AS priority,
                  lo.doctor_comment AS doctor_comment,
                  (SELECT COALESCE(json_agg(s.specimen_type ORDER BY s.created_at), '[]'::json) FROM lab_order_specimens s WHERE s.order_id = lo.id) AS specimens,
                  doc.name AS doctor_name, doc.role AS doctor_role,
                  enc.is_consultation, enc.department_id, dept.name AS department_name,
                  s.name as approved_by_name, es.name as entered_by_name,
                  COALESCE(lo.patient_name, pat.full_name, '') AS full_patient_name
                 FROM lab_results lr
                 JOIN lab_orders lo ON lo.id = lr.lab_order_id
                 LEFT JOIN encounters enc ON enc.id = lo.encounter_id
                 LEFT JOIN patients pat ON pat.id = enc.patient_id
                 LEFT JOIN staff_users doc ON doc.id = enc.staff_id
                 LEFT JOIN departments dept ON dept.id = enc.department_id
                 LEFT JOIN staff_users s ON s.id = lr.approved_by
                 LEFT JOIN staff_users es ON es.id = lr.entered_by
                 WHERE lr.tenant_id = $1`;
    const params: any[] = [tenantId];
    let idx = 2;

    if (status) { query += ` AND lr.status = $${idx}`; params.push(status); idx++; }

    query += ' ORDER BY lr.created_at DESC';
    const result = await pool.query(query, params);

    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.get('/api/lab-specimen-types', (_req: Request, res: Response) => {
  res.json(SPECIMEN_TYPES);
});

// Configurable lab specimens (Admin-managed; custom typed specimens are stored on the order only)
router.get('/api/lab-specimens', async (_req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const result = await pool.query(
      `SELECT * FROM lab_specimens WHERE tenant_id = $1 AND is_active = true ORDER BY sort_order ASC, name ASC`,
      [tenantId]
    );
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.post('/api/lab-specimens', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const { name, is_frequent } = req.body;
    if (!name || !String(name).trim()) {
      res.status(400).json({ error: true, message: 'name is required' });
      return;
    }
    const result = await pool.query(
      `INSERT INTO lab_specimens (tenant_id, name, is_frequent)
       VALUES ($1, $2, $3)
       ON CONFLICT (tenant_id, name) DO UPDATE SET is_frequent = $3
       RETURNING *`,
      [tenantId, String(name).trim(), !!is_frequent]
    );
    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.put('/api/lab-specimens/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, is_frequent, is_active } = req.body;
    const result = await pool.query(
      `UPDATE lab_specimens SET
        name = COALESCE($1, name),
        is_frequent = COALESCE($2, is_frequent),
        is_active = COALESCE($3, is_active)
       WHERE id = $4 RETURNING *`,
      [name !== undefined ? String(name).trim() : undefined, is_frequent !== undefined ? !!is_frequent : undefined, is_active !== undefined ? !!is_active : undefined, id]
    );
    if (result.rows.length === 0) { res.status(404).json({ error: true, message: 'Specimen not found' }); return; }
    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.delete('/api/lab-specimens/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`DELETE FROM lab_specimens WHERE id = $1 RETURNING id`, [id]);
    if (result.rows.length === 0) { res.status(404).json({ error: true, message: 'Specimen not found' }); return; }
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.get('/api/lab-test-catalog', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const { search } = req.query;
    let query = 'SELECT * FROM lab_test_catalog WHERE tenant_id = $1';
    const params: any[] = [tenantId];

    if (search) {
      query += ` AND name ILIKE $2`;
      params.push(`%${search}%`);
    }

    query += ' ORDER BY name';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.get('/api/lab-panels', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const { catalog_id, test_name } = req.query;
    let query = `SELECT lp.*, c.name AS test_name
                 FROM lab_panels lp
                 LEFT JOIN lab_test_catalog c ON c.id = lp.catalog_id`;
    const params: any[] = [tenantId];
    const conds: string[] = [`lp.tenant_id = $1`];
    if (catalog_id) { params.push(catalog_id); conds.push(`lp.catalog_id = $${params.length}`); }
    if (test_name) { params.push(`%${test_name}%`); conds.push(`c.name ILIKE $${params.length}`); }
    if (conds.length) { query += ' WHERE ' + conds.join(' AND '); }
    query += ' ORDER BY lp.sort_order ASC, lp.created_at ASC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.post('/api/lab-test-catalog', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const { name, category, price, specimen_type, description, reference_range_low, reference_range_high, reference_range_text,
            result_type, unit, allowed_values, abnormal_values, is_panel, loinc } = req.body;
    if (!name) { res.status(400).json({ error: true, message: 'name is required' }); return; }
    if (price !== undefined && (isNaN(parseFloat(price)) || parseFloat(price) < 0)) {
      res.status(400).json({ error: true, message: 'price cannot be negative' }); return;
    }
    const rtype = ['numeric', 'qualitative', 'narrative', 'ratio', 'range', 'free_text'].includes(result_type) ? result_type : 'numeric';
    const result = await pool.query(
      `INSERT INTO lab_test_catalog (tenant_id, name, category, price, specimen_type, description, reference_range_low, reference_range_high, reference_range_text, result_type, unit, allowed_values, abnormal_values, is_panel, loinc)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING *`,
      [tenantId, name, category || null, price || 0, specimen_type || null, description || null, reference_range_low || null, reference_range_high || null, reference_range_text || null,
       rtype, unit || null, allowed_values ? JSON.stringify(allowed_values) : null, abnormal_values ? JSON.stringify(abnormal_values) : null, !!is_panel, loinc || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.put('/api/lab-test-catalog/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const tenantId = getTenantId();
    const { name, category, price, specimen_type, description, reference_range_low, reference_range_high, reference_range_text,
            result_type, unit, allowed_values, abnormal_values, is_panel, loinc } = req.body;
    const rtype = result_type !== undefined && ['numeric', 'qualitative', 'narrative', 'ratio', 'range', 'free_text'].includes(result_type) ? result_type : result_type;
    const result = await pool.query(
      `UPDATE lab_test_catalog SET
        name = COALESCE($1, name), category = COALESCE($2, category), price = COALESCE($3, price),
        specimen_type = COALESCE($4, specimen_type), description = COALESCE($5, description),
        reference_range_low = COALESCE($6, reference_range_low), reference_range_high = COALESCE($7, reference_range_high),
        reference_range_text = COALESCE($8, reference_range_text), result_type = COALESCE($9, result_type),
        unit = COALESCE($10, unit),
        allowed_values = COALESCE($11, allowed_values), abnormal_values = COALESCE($12, abnormal_values),
        is_panel = COALESCE($13, is_panel), loinc = COALESCE($14, loinc)
       WHERE id = $15 AND tenant_id = $16 RETURNING *`,
      [name, category, price, specimen_type, description, reference_range_low, reference_range_high, reference_range_text,
       rtype, unit,
       allowed_values !== undefined ? JSON.stringify(allowed_values) : undefined,
       abnormal_values !== undefined ? JSON.stringify(abnormal_values) : undefined,
       is_panel !== undefined ? !!is_panel : undefined, loinc, id, tenantId]
    );
    if (result.rows.length === 0) { res.status(404).json({ error: true, message: 'Test not found' }); return; }
    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.delete('/api/lab-test-catalog/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const tenantId = getTenantId();
    const result = await pool.query(`DELETE FROM lab_test_catalog WHERE id = $1 AND tenant_id = $2 RETURNING id`, [id, tenantId]);
    if (result.rows.length === 0) { res.status(404).json({ error: true, message: 'Test not found' }); return; }
    res.json({ message: 'Test deleted', id });
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

export default router;
