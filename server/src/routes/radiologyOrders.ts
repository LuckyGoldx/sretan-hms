import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import pool from '../db/pool';
import { readClinicProfile } from '../config/reader';
import { generateNumber } from '../utils/numbering';
import { clockGuard } from '../middleware/clockGuard';

const router = Router();

function getTenantId(): string {
  return readClinicProfile().GLOBAL_SAAS_TENANT_ID;
}

async function autoImagingNumber(tenantId: string): Promise<string> {
  return generateNumber(tenantId, 'radiology', { prefix: 'RAD' });
}

// List radiology orders with filters
router.get('/api/radiology-orders', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const { status, encounter_id, doctor_id, is_paid, imaging_type, encounter_type } = req.query;
    let query = `SELECT r.*, enc.patient_id, pat.hospital_number, s.name as reported_by_name, sr.name as approved_by_name,
                  doc.name AS doctor_name, doc.role AS doctor_role,
                  enc.is_consultation, enc.department_id, dept.name AS department_name
                 FROM radiology_orders r
                 LEFT JOIN encounters enc ON enc.id = r.encounter_id
                 LEFT JOIN patients pat ON pat.id = enc.patient_id
                 LEFT JOIN staff_users doc ON doc.id = enc.staff_id
                 LEFT JOIN departments dept ON dept.id = enc.department_id
                 LEFT JOIN staff_users s ON s.id = r.reported_by
                 LEFT JOIN staff_users sr ON sr.id = r.approved_by
                 WHERE r.tenant_id = $1`;
    const params: any[] = [tenantId];
    let idx = 2;

    if (status) { query += ` AND r.status = $${idx}`; params.push(status); idx++; }
    if (encounter_id) { query += ` AND r.encounter_id = $${idx}`; params.push(encounter_id); idx++; }
    if (imaging_type) { query += ` AND r.imaging_type ILIKE $${idx}`; params.push(`%${imaging_type}%`); idx++; }
    if (is_paid !== undefined) { query += ` AND r.is_paid = $${idx}::boolean`; params.push(is_paid === 'true'); idx++; }
    if (doctor_id) {
      query += ` AND r.encounter_id IN (SELECT id FROM encounters WHERE staff_id = $${idx} AND tenant_id = $1)`;
      params.push(doctor_id); idx++;
    }
    if (encounter_type) { query += ` AND enc.encounter_type = $${idx}`; params.push(encounter_type); idx++; }
    query += ' ORDER BY r.created_at DESC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err: any) { res.status(500).json({ error: true, message: err.message }); }
});

// Stats endpoint
router.get('/api/radiology-orders/stats', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const result = await pool.query(
      `SELECT
        COUNT(*) FILTER (WHERE status = 'ordered')::int as ordered,
        COUNT(*) FILTER (WHERE status = 'processing')::int as processing,
        COUNT(*) FILTER (WHERE status = 'review')::int as review,
        COUNT(*) FILTER (WHERE status = 'completed')::int as completed,
        COUNT(*)::int as total
       FROM radiology_orders WHERE tenant_id = $1`, [tenantId]
    );
    res.json(result.rows[0] || { ordered: 0, processing: 0, review: 0, completed: 0, total: 0 });
  } catch (err: any) { res.status(500).json({ error: true, message: err.message }); }
});

// Create order
router.post('/api/radiology-orders', async (req: Request, res: Response) => {
  try {
    await clockGuard(pool, 'radiology_orders');
    const tenantId = getTenantId();
    const { encounter_id, imaging_type, doctor_name, patient_name, payment_id, doctor_comment } = req.body;

    if (!imaging_type) {
      res.status(400).json({ error: true, message: 'imaging_type is required' });
      return;
    }

    const id = uuidv4();
    const imgNum = await autoImagingNumber(tenantId);
    const result = await pool.query(
      `INSERT INTO radiology_orders (id, tenant_id, imaging_number, encounter_id, imaging_type, doctor_name, patient_name, payment_id, is_paid, doctor_comment)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [id, tenantId, imgNum, encounter_id || null, imaging_type, doctor_name || null, patient_name || null, payment_id || null, payment_id ? true : false, doctor_comment || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err: any) { res.status(500).json({ error: true, message: err.message }); }
});

// Update order (status, report, image)
router.put('/api/radiology-orders/:id', async (req: Request, res: Response) => {
  try {
    await clockGuard(pool, 'radiology_orders');
    const tenantId = getTenantId();
    const { id } = req.params;
    const { report_text, image_path, status, reported_by, approved_by } = req.body;

    if (status === 'processing' || status === 'completed' || status === 'review') {
      var paidCheck = await pool.query('SELECT is_paid FROM radiology_orders WHERE id = $1', [id]);
      if (paidCheck.rows.length > 0 && !paidCheck.rows[0].is_paid) {
        res.status(402).json({ error: true, message: 'Payment required: Radiology order has not been paid for' });
        return;
      }
    }

    // On initial report submit: set to 'review' and record reporter
    // On approve: set to 'completed' and record approver
    // On reject: keep as 'rejected' (back to worklist for editing)
    const result = await pool.query(
      `UPDATE radiology_orders SET
        report_text = COALESCE($1, report_text),
        image_path = COALESCE($2, image_path),
        status = COALESCE($3, status),
        reported_by = CASE WHEN $3 IN ('processing','review') AND reported_by IS NULL THEN COALESCE($4, reported_by) ELSE reported_by END,
        reported_at = CASE WHEN $3 IN ('processing','review') AND reported_at IS NULL THEN NOW() ELSE reported_at END,
        approved_by = CASE WHEN $3 = 'completed' THEN COALESCE($5, approved_by) ELSE approved_by END,
        approved_at = CASE WHEN $3 = 'completed' AND approved_at IS NULL THEN NOW() ELSE approved_at END,
        updated_at = NOW()
       WHERE id = $6 AND tenant_id = $7 RETURNING *`,
      [report_text || null, image_path || null, status || null, reported_by || null, approved_by || null, id, tenantId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: true, message: 'Radiology order not found' });
      return;
    }
    res.json(result.rows[0]);
  } catch (err: any) { res.status(500).json({ error: true, message: err.message }); }
});

export default router;
