import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import pool from '../db/pool';
import { readClinicProfile } from '../config/reader';

const router = Router();

function getTenantId(): string {
  return readClinicProfile().GLOBAL_SAAS_TENANT_ID;
}

const SPECIMEN_TYPES = ['Blood', 'Urine', 'Stool', 'Sputum', 'CSF', 'Swab', 'Tissue', 'Serum', 'Plasma', 'Other'];
const PRIORITIES = ['routine', 'urgent', 'stat'];

router.get('/api/lab-orders', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const { status, encounter_id, doctor_id, specimen_type, priority } = req.query;

    let query = `SELECT l.* FROM lab_orders l WHERE l.tenant_id = $1`;
    const params: any[] = [tenantId];
    let idx = 2;

    if (status) { query += ` AND l.status = $${idx}`; params.push(status); idx++; }
    if (encounter_id) { query += ` AND l.encounter_id = $${idx}`; params.push(encounter_id); idx++; }
    if (specimen_type) { query += ` AND l.specimen_type = $${idx}`; params.push(specimen_type); idx++; }
    if (priority) { query += ` AND l.priority = $${idx}`; params.push(priority); idx++; }
    if (doctor_id) {
      query += ` AND l.encounter_id IN (SELECT id FROM encounters WHERE staff_id = $${idx} AND tenant_id = $1)`;
      params.push(doctor_id);
      idx++;
    }

    query += ' ORDER BY l.created_at DESC';
    const result = await pool.query(query, params);

    const enriched = await Promise.all(result.rows.map(async (row: any) => {
      let patient_name = row.patient_name || '';
      if (!patient_name && row.encounter_id) {
        try {
          const enc = await pool.query('SELECT patient_id FROM encounters WHERE id = $1', [row.encounter_id]);
          if (enc.rows[0]) {
            const pat = await pool.query('SELECT full_name FROM patients WHERE id = $1', [enc.rows[0].patient_id]);
            patient_name = pat.rows[0]?.full_name || '';
          }
        } catch {}
      }
      let doctor_name = '';
      if (row.encounter_id) {
        try {
          const enc = await pool.query('SELECT staff_id FROM encounters WHERE id = $1', [row.encounter_id]);
          if (enc.rows[0]?.staff_id) {
            const doc = await pool.query('SELECT name FROM staff_users WHERE id = $1', [enc.rows[0].staff_id]);
            doctor_name = doc.rows[0]?.name || '';
          }
        } catch {}
      }
      return { ...row, patient_name, doctor_name };
    }));

    res.json(enriched);
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
    const { encounter_id, test_name, specimen_type, priority, patient_name, patient_phone, referred_by, request_number, lab_number: providedLabNumber, payment_id, walkin_phone } = req.body;

    if (!test_name) {
      res.status(400).json({ error: true, message: 'test_name is required' });
      return;
    }

    let labNumber = providedLabNumber
    if (!labNumber) {
      const seqResult = await pool.query(`SELECT COALESCE(MAX(SUBSTRING(lab_number FROM 'LAB-2026-(\\d+)')::int), 0) + 1 AS next_num FROM lab_orders WHERE lab_number ~ '^LAB-2026-'`);
      const nextNum = seqResult.rows[0]?.next_num || 1;
      labNumber = `LAB-2026-${String(nextNum).padStart(5, '0')}`;
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
      `INSERT INTO lab_orders (id, tenant_id, lab_number, request_number, order_number, encounter_id, test_name, specimen_type, priority, patient_name, patient_phone, referred_by, payment_id, is_paid, walkin_phone)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING *`,
      [id, tenantId, labNumber, request_number || null, orderNumber, encounter_id || null, test_name, specimen_type || null, priority || 'routine',
       patient_name || null, patient_phone || null, referred_by || null, payment_id || null, payment_id ? true : (!encounter_id ? true : false), walkin_phone || null]
    );

    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.put('/api/lab-orders/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status, specimen_type, priority, collected_at, results_collected_at, doctor_read_at } = req.body;

    if (status === 'processing' || status === 'collected') {
      var paidCheck = await pool.query('SELECT is_paid FROM lab_orders WHERE id = $1', [id]);
      if (paidCheck.rows.length > 0 && !paidCheck.rows[0].is_paid) {
        res.status(402).json({ error: true, message: 'Payment required: Lab order has not been paid for' });
        return;
      }
    }

    const result = await pool.query(
      `UPDATE lab_orders SET
        status = COALESCE($1, status),
        specimen_type = COALESCE($2, specimen_type),
        priority = COALESCE($3, priority),
        collected_at = COALESCE($4, collected_at),
        results_collected_at = COALESCE($5, results_collected_at),
        doctor_read_at = COALESCE($6, doctor_read_at)
       WHERE id = $7 RETURNING *`,
      [status || null, specimen_type || null, priority || null, collected_at || null, results_collected_at || null, doctor_read_at || null, id]
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
    const { lab_order_id, analyte_name, value, reference_range_low, reference_range_high, is_abnormal } = req.body;

    if (!lab_order_id || !analyte_name || value === undefined) {
      res.status(400).json({ error: true, message: 'lab_order_id, analyte_name, and value are required' });
      return;
    }

    const seqResult = await pool.query(`SELECT COALESCE(MAX(SUBSTRING(result_number FROM 'RES-2026-(\\d+)')::int), 0) + 1 AS next_num FROM lab_results WHERE result_number ~ '^RES-2026-'`);
    const nextNum = seqResult.rows[0]?.next_num || 1;
    const resultNumber = `RES-2026-${String(nextNum).padStart(5, '0')}`;

    const id = uuidv4();
    const abnormal = is_abnormal !== undefined ? is_abnormal : (
      (reference_range_low && reference_range_high && (parseFloat(value) < parseFloat(reference_range_low) || parseFloat(value) > parseFloat(reference_range_high)))
    );

    const result = await pool.query(
      `INSERT INTO lab_results (id, tenant_id, lab_order_id, result_number, analyte_name, value, reference_range_low, reference_range_high, is_abnormal)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [id, tenantId, lab_order_id, resultNumber, analyte_name, value, reference_range_low || null, reference_range_high || null, abnormal]
    );

    await pool.query(`UPDATE lab_orders SET status = 'processing' WHERE id = $1 AND status = 'ordered'`, [lab_order_id]);

    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.put('/api/lab-results/:id/approve', async (req: Request, res: Response) => {
  try {
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

    const labOrderId = result.rows[0].lab_order_id;
    const allCompleted = await pool.query(
      `SELECT COUNT(*) = SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as done FROM lab_results WHERE lab_order_id = $1`,
      [labOrderId]
    );
    if (allCompleted.rows[0]?.done) {
      await pool.query(`UPDATE lab_orders SET status = 'completed' WHERE id = $1`, [labOrderId]);
    }

    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.get('/api/lab-results/:orderId', async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const result = await pool.query(
      `SELECT * FROM lab_results WHERE lab_order_id = $1 ORDER BY created_at`, [orderId]
    );
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.put('/api/lab-results/:id/reject', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `UPDATE lab_results SET status = 'draft' WHERE id = $1 RETURNING *`, [id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: true, message: 'Lab result not found' });
      return;
    }
    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.get('/api/lab-results', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const { status } = req.query;
    let query = `SELECT lr.*, lo.test_name, lo.patient_name, lo.encounter_id, s.name as approved_by_name
                 FROM lab_results lr
                 JOIN lab_orders lo ON lo.id = lr.lab_order_id
                 LEFT JOIN staff_users s ON s.id = lr.approved_by
                 WHERE lr.tenant_id = $1`;
    const params: any[] = [tenantId];
    let idx = 2;

    if (status) { query += ` AND lr.status = $${idx}`; params.push(status); idx++; }

    query += ' ORDER BY lr.created_at DESC';
    const result = await pool.query(query, params);

    const enriched = await Promise.all(result.rows.map(async (row: any) => {
      let full_patient_name = row.patient_name || '';
      if (!full_patient_name && row.encounter_id) {
        try {
          const enc = await pool.query('SELECT patient_id FROM encounters WHERE id = $1', [row.encounter_id]);
          if (enc.rows[0]) {
            const pat = await pool.query('SELECT full_name FROM patients WHERE id = $1', [enc.rows[0].patient_id]);
            full_patient_name = pat.rows[0]?.full_name || '';
          }
        } catch {}
      }
      return { ...row, full_patient_name };
    }));

    res.json(enriched);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.get('/api/lab-specimen-types', (_req: Request, res: Response) => {
  res.json(SPECIMEN_TYPES);
});

router.get('/api/lab-test-catalog', async (req: Request, res: Response) => {
  try {
    const { search } = req.query;
    let query = 'SELECT * FROM lab_test_catalog';
    const params: any[] = [];

    if (search) {
      query += ` WHERE name ILIKE $1`;
      params.push(`%${search}%`);
    }

    query += ' ORDER BY name';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.post('/api/lab-test-catalog', async (req: Request, res: Response) => {
  try {
    const { name, category, price, specimen_type, description } = req.body;
    if (!name) { res.status(400).json({ error: true, message: 'name is required' }); return; }
    const result = await pool.query(
      `INSERT INTO lab_test_catalog (name, category, price, specimen_type, description) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [name, category || null, price || 0, specimen_type || null, description || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

export default router;
