import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import pool from '../db/pool';

const router = Router();

function generateReceiptNumber(): string {
  const date = new Date();
  const y = date.getFullYear().toString().slice(2);
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const rand = Math.floor(Math.random() * 9000) + 1000;
  return `RCP-${y}${m}${d}-${rand}`;
}

// --- Get pending/unpaid services for a patient ---
router.get('/api/payments/pending/:patientId', async (req: Request, res: Response) => {
  try {
    const { patientId } = req.params;
    const [folderRes, prescriptionsRes, labRes, radiologyRes, admissionsRes] = await Promise.all([
      pool.query('SELECT folder_activated FROM patients WHERE id = $1', [patientId]),
      pool.query('SELECT id, drug_name, dosage, quantity, prescription_date FROM prescriptions WHERE patient_id = $1 AND is_paid = false AND status != $2 ORDER BY prescription_date DESC', [patientId, 'cancelled']),
      pool.query('SELECT id, test_name, status, created_at FROM lab_orders WHERE patient_id = $1 AND is_paid = false AND status NOT IN ($2, $3) ORDER BY created_at DESC', [patientId, 'cancelled', 'completed']),
      pool.query('SELECT id, imaging_type, status, created_at FROM radiology_orders WHERE patient_id = $1 AND is_paid = false AND status NOT IN ($2, $3) ORDER BY created_at DESC', [patientId, 'cancelled', 'completed']),
      pool.query('SELECT id, ward_name, admitted_at FROM admissions WHERE patient_id = $1 AND is_paid = false AND status = $2 ORDER BY admitted_at DESC', [patientId, 'active']),
    ]);

    var items: any[] = [];
    var patient = folderRes.rows[0];

    if (!patient?.folder_activated) {
      items.push({ service_type: 'folder_activation', service_id: null, description: 'Folder Activation / Registration Fee', quantity: 1, unit_price: 0, needsPrice: true });
    }

    (prescriptionsRes.rows || []).forEach((r: any) => {
      items.push({ service_type: 'prescription', service_id: r.id, description: `Prescription: ${r.drug_name} ${r.dosage} × ${r.quantity}`, quantity: 1, unit_price: 0, needsPrice: true });
    });

    (labRes.rows || []).forEach((r: any) => {
      items.push({ service_type: 'lab', service_id: r.id, description: `Lab: ${r.test_name}`, quantity: 1, unit_price: 0, needsPrice: true });
    });

    (radiologyRes.rows || []).forEach((r: any) => {
      items.push({ service_type: 'radiology', service_id: r.id, description: `Radiology: ${r.imaging_type}`, quantity: 1, unit_price: 0, needsPrice: true });
    });

    (admissionsRes.rows || []).forEach((r: any) => {
      items.push({ service_type: 'admission', service_id: r.id, description: `Admission: ${r.ward_name}`, quantity: 1, unit_price: 0, needsPrice: true });
    });

    res.json({ items, patient_name: '', hospital_number: '' });
  } catch (err: any) { res.status(500).json({ error: true, message: err.message }); }
});

// --- Create payment ---
router.post('/api/payments', async (req: Request, res: Response) => {
  try {
    const { patient_id, walkin_name, walkin_phone, items, payment_method, notes, created_by } = req.body;
    if ((!items || items.length === 0)) {
      res.status(400).json({ error: true, message: 'At least one item is required' });
      return;
    }

    var totalAmount = items.reduce((sum: number, i: any) => sum + ((i.unit_price || 0) * (i.quantity || 1)), 0);
    var receiptNumber = generateReceiptNumber();
    var paymentId = uuidv4();

    await pool.query(
      'INSERT INTO payments (id, receipt_number, patient_id, walkin_name, walkin_phone, total_amount, payment_method, notes, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
      [paymentId, receiptNumber, patient_id || null, walkin_name || null, walkin_phone || null, totalAmount, payment_method || 'cash', notes || null, created_by || null]
    );

    for (const item of items) {
      var itemId = uuidv4();
      var totalPrice = (item.unit_price || 0) * (item.quantity || 1);
      await pool.query(
        'INSERT INTO payment_items (id, payment_id, service_type, service_id, description, quantity, unit_price, total_price) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
        [itemId, paymentId, item.service_type, item.service_id || null, item.description, item.quantity || 1, item.unit_price || 0, totalPrice]
      );

      // Mark service as paid
      if (item.service_type === 'folder_activation' && patient_id) {
        await pool.query('UPDATE patients SET folder_activated = true WHERE id = $1', [patient_id]);
      } else if (item.service_type === 'prescription' && item.service_id) {
        await pool.query('UPDATE prescriptions SET is_paid = true WHERE id = $1', [item.service_id]);
      } else if (item.service_type === 'lab' && item.service_id) {
        await pool.query('UPDATE lab_orders SET is_paid = true WHERE id = $1', [item.service_id]);
      } else if (item.service_type === 'radiology' && item.service_id) {
        await pool.query('UPDATE radiology_orders SET is_paid = true WHERE id = $1', [item.service_id]);
      } else if (item.service_type === 'admission' && item.service_id) {
        await pool.query('UPDATE admissions SET is_paid = true WHERE id = $1', [item.service_id]);
      }
    }

    // Fetch the complete payment with items
    var payment = await pool.query('SELECT * FROM payments WHERE id = $1', [paymentId]);
    var paymentItems = await pool.query('SELECT * FROM payment_items WHERE payment_id = $1', [paymentId]);
    var patientData = patient_id ? await pool.query('SELECT full_name, hospital_number FROM patients WHERE id = $1', [patient_id]) : null;

    res.status(201).json({
      ...payment.rows[0],
      items: paymentItems.rows,
      patient_name: patientData?.rows[0]?.full_name || walkin_name || 'Walk-in',
      hospital_number: patientData?.rows[0]?.hospital_number || null,
    });
  } catch (err: any) { res.status(500).json({ error: true, message: err.message }); }
});

// --- List payments ---
router.get('/api/payments', async (req: Request, res: Response) => {
  try {
    const { patient_id, date_from, date_to } = req.query;
    var query = `SELECT p.*, s.name as staff_name, pat.full_name as patient_name, pat.hospital_number
                 FROM payments p
                 LEFT JOIN staff_users s ON s.id = p.created_by
                 LEFT JOIN patients pat ON pat.id = p.patient_id
                 WHERE 1=1`;
    var params: any[] = [];
    var idx = 1;

    if (patient_id) { query += ` AND p.patient_id = $${idx}`; params.push(patient_id); idx++; }
    if (date_from) { query += ` AND p.created_at >= $${idx}`; params.push(date_from); idx++; }
    if (date_to) { query += ` AND p.created_at <= $${idx}`; params.push(date_to); idx++; }

    query += ' ORDER BY p.created_at DESC LIMIT 100';
    var result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err: any) { res.status(500).json({ error: true, message: err.message }); }
});

// --- Get payment detail with items ---
router.get('/api/payments/:id', async (req: Request, res: Response) => {
  try {
    var payment = await pool.query(
      'SELECT p.*, s.name as staff_name, pat.full_name as patient_name, pat.hospital_number FROM payments p LEFT JOIN staff_users s ON s.id = p.created_by LEFT JOIN patients pat ON pat.id = p.patient_id WHERE p.id = $1',
      [req.params.id]
    );
    if (payment.rows.length === 0) { res.status(404).json({ error: true, message: 'Payment not found' }); return; }
    var items = await pool.query('SELECT * FROM payment_items WHERE payment_id = $1 ORDER BY service_type', [req.params.id]);
    res.json({ ...payment.rows[0], items: items.rows });
  } catch (err: any) { res.status(500).json({ error: true, message: err.message }); }
});

// --- Revenue stats ---
router.get('/api/payments/revenue/stats', async (req: Request, res: Response) => {
  try {
    var today = new Date().toISOString().slice(0, 10);
    var stats = await pool.query(
      `SELECT COUNT(*) as total_transactions, COALESCE(SUM(total_amount), 0) as total_revenue,
              COUNT(*) FILTER (WHERE created_at::date = $1::date) as today_count,
              COALESCE(SUM(total_amount) FILTER (WHERE created_at::date = $1::date), 0) as today_revenue,
              COUNT(*) FILTER (WHERE payment_method = 'cash') as cash_count,
              COALESCE(SUM(total_amount) FILTER (WHERE payment_method = 'cash'), 0) as cash_total,
              COUNT(*) FILTER (WHERE payment_method = 'card') as card_count,
              COALESCE(SUM(total_amount) FILTER (WHERE payment_method = 'card'), 0) as card_total,
              COUNT(*) FILTER (WHERE payment_method = 'transfer') as transfer_count,
              COALESCE(SUM(total_amount) FILTER (WHERE payment_method = 'transfer'), 0) as transfer_total,
              COUNT(*) FILTER (WHERE payment_method = 'pos') as pos_count,
              COALESCE(SUM(total_amount) FILTER (WHERE payment_method = 'pos'), 0) as pos_total
       FROM payments WHERE status = 'completed'`,
      [today]
    );
    res.json(stats.rows[0]);
  } catch (err: any) { res.status(500).json({ error: true, message: err.message }); }
});

// --- Revenue by service type ---
router.get('/api/payments/revenue/by-service', async (req: Request, res: Response) => {
  try {
    var result = await pool.query(
      `SELECT pi.service_type, COUNT(*) as count, COALESCE(SUM(pi.total_price), 0) as total
       FROM payment_items pi JOIN payments p ON p.id = pi.payment_id
       WHERE p.status = 'completed'
       GROUP BY pi.service_type ORDER BY total DESC`
    );
    res.json(result.rows);
  } catch (err: any) { res.status(500).json({ error: true, message: err.message }); }
});

export default router;
