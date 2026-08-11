import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import pool from '../db/pool';
import { getCoverageForService, getPatientPrimaryInsurance } from '../utils/coverageLookup';

const router = Router();

function generateReceiptNumber(): string {
  const date = new Date();
  const y = date.getFullYear().toString().slice(2);
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const rand = Math.floor(Math.random() * 9000) + 1000;
  return `RCP-${y}${m}${d}-${rand}`;
}

// Helper: add a service to an insurance case (auto-coverage billing)
async function autoBillToCase(caseId: string, tenantId: string, item: any, amount: number, sourceId: string | null, svcType: string): Promise<void> {
  try {
    // For dedup, use sourceId or a deterministic compound key for items without an order ID
    const dedupKey = sourceId || `auto_${caseId}_${svcType}_${item.description?.slice(0, 50) || 'unknown'}`;
    const existing = await pool.query(
      `SELECT id FROM insurance_case_services WHERE case_id = $1 AND source_type = 'coverage_auto' AND source_id = $2`,
      [caseId, dedupKey]
    );
    if (existing.rows.length > 0) return;

    const svcId = uuidv4();
    await pool.query(
      `INSERT INTO insurance_case_services (id, tenant_id, case_id, service_type, service_name, quantity, unit_price, total_price, source_type, source_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'coverage_auto', $9, 'pending')`,
      [svcId, tenantId, caseId, svcType, item.description || 'Service', item.quantity || 1, item.unit_price || 0, amount, dedupKey]
    );
  } catch {}
}

// Helper: mark a source order as paid (prescriptions, lab_orders, radiology_orders, admissions)
async function markOrderAsPaid(item: any): Promise<void> {
  try {
    if (!item.service_id) {
      // Items without a source order (e.g., folder_activation) cannot be marked paid in an order table.
      // They are excluded from pending after being auto-billed by the above dedup logic.
      return;
    }
    const tableMap: Record<string, string> = {
      prescription: 'prescriptions',
      lab: 'lab_orders',
      radiology: 'radiology_orders',
      admission: 'admissions',
    };
    const table = tableMap[item.service_type];
    if (table) {
      await pool.query(`UPDATE ${table} SET is_paid = true WHERE id = $1`, [item.service_id]);
    }
  } catch {}
}

// --- Get pending/unpaid services for a patient ---
router.get('/api/payments/pending/:patientId', async (req: Request, res: Response) => {
  try {
    const { patientId } = req.params;
    const [folderRes, prescriptionsRes, labRes, radiologyRes, admissionsRes] = await Promise.all([
      pool.query('SELECT folder_activated FROM patients WHERE id = $1', [patientId]),
      pool.query(`SELECT pr.id, pr.drug_name, pr.dosage, pr.quantity, pr.created_at
        FROM prescriptions pr JOIN encounters enc ON enc.id = pr.encounter_id
        WHERE enc.patient_id = $1 AND COALESCE(pr.is_paid, false) = false AND pr.status != $2
        ORDER BY pr.created_at DESC`, [patientId, 'cancelled']),
      pool.query(`SELECT l.id, l.test_name, l.status, l.created_at
        FROM lab_orders l JOIN encounters enc ON enc.id = l.encounter_id
        WHERE enc.patient_id = $1 AND COALESCE(l.is_paid, false) = false AND l.status NOT IN ($2, $3)
        ORDER BY l.created_at DESC`, [patientId, 'cancelled', 'completed']),
      pool.query(`SELECT r.id, r.imaging_type, r.status, r.created_at
        FROM radiology_orders r JOIN encounters enc ON enc.id = r.encounter_id
        WHERE enc.patient_id = $1 AND COALESCE(r.is_paid, false) = false AND r.status NOT IN ($2, $3)
        ORDER BY r.created_at DESC`, [patientId, 'cancelled', 'completed']),
      pool.query('SELECT a.id, a.admitted_at FROM admissions a WHERE a.patient_id = $1 AND COALESCE(a.is_paid, false) = false AND a.status = $2 ORDER BY a.admitted_at DESC', [patientId, 'active']),
    ]);

    var items: any[] = [];
    var patient = folderRes.rows[0];

    if (!patient?.folder_activated) {
      items.push({ service_type: 'folder_activation', service_id: null, description: 'Folder Activation / Registration Fee', quantity: 1, unit_price: 5000, needsPrice: true });
    }

    for (const r of (prescriptionsRes.rows || [])) {
      var rxPrice = 0;
      var rxCost = 0;
      try {
        var rxInv = await pool.query('SELECT price, cost_price FROM inventory_items WHERE drug_name ILIKE $1 AND category = $2 AND is_active = true LIMIT 1', [r.drug_name, 'pharmacy']);
        if (rxInv.rows.length > 0) { rxPrice = rxInv.rows[0].price || 0; rxCost = rxInv.rows[0].cost_price || 0; }
      } catch {}
      items.push({ service_type: 'prescription', service_id: r.id, description: `Prescription: ${r.drug_name} ${r.dosage || ''} × ${r.quantity || ''}`, quantity: r.quantity || 1, unit_price: rxPrice, cost_price: rxCost, needsPrice: !rxPrice });
    }

    for (const r of (labRes.rows || [])) {
      var labPrice = 0;
      var labCost = 0;
      try {
        var labInv = await pool.query('SELECT price, cost_price FROM inventory_items WHERE drug_name ILIKE $1 AND category = $2 AND is_active = true LIMIT 1', [r.test_name, 'lab']);
        if (labInv.rows.length > 0) { labPrice = labInv.rows[0].price || 0; labCost = labInv.rows[0].cost_price || 0; }
      } catch {}
      items.push({ service_type: 'lab', service_id: r.id, description: `Lab: ${r.test_name}`, quantity: 1, unit_price: labPrice, cost_price: labCost, needsPrice: !labPrice });
    }

    for (const r of (radiologyRes.rows || [])) {
      var radPrice = 0;
      var radCost = 0;
      try {
        var radInv = await pool.query('SELECT price, cost_price FROM inventory_items WHERE drug_name ILIKE $1 AND category = $2 AND is_active = true LIMIT 1', [r.imaging_type, 'radiology']);
        if (radInv.rows.length > 0) { radPrice = radInv.rows[0].price || 0; radCost = radInv.rows[0].cost_price || 0; }
      } catch {}
      items.push({ service_type: 'radiology', service_id: r.id, description: `Radiology: ${r.imaging_type}`, quantity: 1, unit_price: radPrice, cost_price: radCost, needsPrice: !radPrice });
    }

    (admissionsRes.rows || []).forEach((r: any) => {
      items.push({ service_type: 'admission', service_id: r.id, description: `Admission: ${r.ward_name}`, quantity: 1, unit_price: 0, needsPrice: true });
    });

    // --- Auto-apply insurance coverage for insured patients ---
    let insuredCoverage: any = { active: false };
    try {
      insuredCoverage = (await getPatientPrimaryInsurance(String(patientId))) || { active: false };
      if (insuredCoverage.active && insuredCoverage.caseId) {
        const cid = insuredCoverage.caseId;
        const caseTenant = await pool.query('SELECT tenant_id FROM insurance_cases WHERE id = $1', [cid]);
        const tenantId = caseTenant.rows[0]?.tenant_id || '00000000-0000-0000-0000-000000000000';

        const filteredItems: any[] = [];
        for (const item of items) {
          const itemName = item.description?.split(': ')[1]?.split(' ×')[0] || item.description || '';
          const svcType = item.service_type === 'prescription' ? 'pharmacy' : item.service_type;
          const coveragePct = await getCoverageForService(insuredCoverage.providerId, svcType, itemName);
          const totalPrice = (item.unit_price || 0) * (item.quantity || 1);
          const insurancePortion = Math.round(totalPrice * coveragePct) / 100;
          const patientPortion = Math.round((totalPrice - insurancePortion) * 100) / 100;

          if (coveragePct === 100) {
            // Fully covered — auto-bill to insurance, mark source as paid, skip Paypoint
            await autoBillToCase(cid, tenantId, item, totalPrice, item.service_id, svcType);
            await markOrderAsPaid(item);
          } else if (coveragePct > 0) {
            // Partially covered — bill insurance portion to case, patient pays the rest at Paypoint
            if (insurancePortion > 0) {
              await autoBillToCase(cid, tenantId, item, insurancePortion, item.service_id, svcType);
            }
            filteredItems.push({
              ...item,
              unit_price: Math.round(patientPortion / (item.quantity || 1)),
              original_price: item.unit_price,
              coverage_pct: coveragePct,
              insurance_covered: insurancePortion,
              patient_owes: patientPortion,
              coverage_label: `${coveragePct}% covered by ${insuredCoverage.providerName}`,
            });
          } else {
            // Not covered — patient pays full at Paypoint
            filteredItems.push({ ...item, coverage_pct: 0, coverage_label: 'Not covered by insurance' });
          }
        }
        items = filteredItems;
      }
    } catch {}

    res.json({ items, patient_name: '', hospital_number: '', insured: insuredCoverage });
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

    for (const item of items) {
      if ((item.unit_price !== undefined && item.unit_price < 0) || (item.quantity !== undefined && item.quantity <= 0)) {
        res.status(400).json({ error: true, message: 'Payment items cannot have negative price or zero/negative quantity.' });
        return;
      }
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
      // Look up cost_price from inventory if available
      var costPrice = item.cost_price || 0;
      if (!costPrice && (item.service_type === 'pharmacy' || item.service_type === 'lab' || item.service_type === 'radiology' || item.service_type === 'general')) {
        try {
          var invRes = await pool.query('SELECT cost_price, price FROM inventory_items WHERE drug_name ILIKE $1 AND category = $2 LIMIT 1',
            [item.description?.replace(/^(OTC|Lab|Radiology|Service):\s*/i, '').trim(), item.service_type === 'pharmacy' ? 'pharmacy' : item.service_type === 'lab' ? 'lab' : item.service_type === 'radiology' ? 'radiology' : 'general']);
          if (invRes.rows.length > 0) {
            costPrice = invRes.rows[0].cost_price || 0;
            if (!item.unit_price || item.unit_price === 0) item.unit_price = invRes.rows[0].price || 0;
          }
        } catch {}
      }
      await pool.query(
        'INSERT INTO payment_items (id, payment_id, service_type, service_id, description, item_name, quantity, unit_price, total_price, cost_price) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)',
        [itemId, paymentId, item.service_type, item.service_id || null, item.description, item.description, item.quantity || 1, item.unit_price || 0, totalPrice, costPrice]
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
    var query = `SELECT p.*, s.name as staff_name, pat.full_name as patient_name, pat.hospital_number,
                  (SELECT COUNT(*) FROM payment_items pi WHERE pi.payment_id = p.id)::int as item_count
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

// --- Pending summary - all patients with unpaid items ---
router.get('/api/payments/pending-summary', async (req: Request, res: Response) => {
  try {
    var result = await pool.query(`
      WITH folder AS (
        SELECT id as patient_id, full_name, hospital_number, 'folder_activation' as service_type,
               'Folder Activation Fee' as description, 1 as item_count FROM patients
        WHERE folder_activated = false
      ),
      rx AS (
        SELECT enc.patient_id, p.full_name, p.hospital_number, 'prescription' as service_type,
               COUNT(*)::int || ' Prescription(s)' as description, COUNT(*) as item_count
        FROM prescriptions pr
        JOIN encounters enc ON enc.id = pr.encounter_id
        JOIN patients p ON p.id = enc.patient_id
        WHERE COALESCE(pr.is_paid, false) = false AND pr.status != 'cancelled'
        GROUP BY enc.patient_id, p.full_name, p.hospital_number
      ),
      lab AS (
        SELECT enc.patient_id, p.full_name, p.hospital_number, 'lab' as service_type,
               COUNT(*)::int || ' Lab Test(s)' as description, COUNT(*) as item_count
        FROM lab_orders l
        JOIN encounters enc ON enc.id = l.encounter_id
        JOIN patients p ON p.id = enc.patient_id
        WHERE COALESCE(l.is_paid, false) = false AND l.status NOT IN ('cancelled','completed')
        GROUP BY enc.patient_id, p.full_name, p.hospital_number
      ),
      rad AS (
        SELECT enc.patient_id, p.full_name, p.hospital_number, 'radiology' as service_type,
               COUNT(*)::int || ' Radiology Order(s)' as description, COUNT(*) as item_count
        FROM radiology_orders r
        JOIN encounters enc ON enc.id = r.encounter_id
        JOIN patients p ON p.id = enc.patient_id
        WHERE COALESCE(r.is_paid, false) = false AND r.status NOT IN ('cancelled','completed')
        GROUP BY enc.patient_id, p.full_name, p.hospital_number
      ),
      adm AS (
        SELECT a.patient_id, p.full_name, p.hospital_number, 'admission' as service_type,
               'Admission Fee' as description, 1 as item_count
        FROM admissions a JOIN patients p ON p.id = a.patient_id
        WHERE COALESCE(a.is_paid, false) = false AND a.status = 'active'
      ),
      all_pending AS (
        SELECT * FROM folder UNION ALL SELECT * FROM rx UNION ALL
        SELECT * FROM lab UNION ALL SELECT * FROM rad UNION ALL SELECT * FROM adm
      )
      SELECT patient_id, full_name, hospital_number,
             json_agg(json_build_object('service_type', service_type, 'description', description, 'item_count', item_count)) as services,
             SUM(item_count) as total_items
      FROM all_pending GROUP BY patient_id, full_name, hospital_number
      ORDER BY full_name
    `);
    res.json(result.rows);
  } catch (err: any) { res.status(500).json({ error: true, message: err.message }); }
});

// --- All pending items across all patients (comprehensive, with prices) ---
router.get('/api/payments/all-pending-items', async (req: Request, res: Response) => {
  try {
    var result = await pool.query(`
      WITH       folder AS (
        SELECT id as patient_id, full_name, hospital_number,
               'folder_activation'::text as service_type, NULL::uuid as service_id,
               'Folder Activation / Registration Fee'::text as description,
               1::int as quantity, 5000::numeric as unit_price, false as needs_price,
               created_at
        FROM patients WHERE folder_activated = false
      ),
      rx_items AS (
        SELECT enc.patient_id, p.full_name, p.hospital_number, 'prescription' as service_type,
               pr.id as service_id, (pr.drug_name || COALESCE(' ' || pr.dosage, '') || ' × ' || COALESCE(pr.quantity::text, '1')) as description,
               pr.quantity, (SELECT COALESCE(MAX(ii.price), 0) FROM inventory_items ii WHERE ii.drug_name ILIKE pr.drug_name AND ii.category = 'pharmacy' AND ii.is_active = true) as unit_price,
               (SELECT COALESCE(MAX(ii.price), 0) FROM inventory_items ii WHERE ii.drug_name ILIKE pr.drug_name AND ii.category = 'pharmacy' AND ii.is_active = true) = 0 as needs_price,
               pr.created_at
        FROM prescriptions pr JOIN encounters enc ON enc.id = pr.encounter_id
        JOIN patients p ON p.id = enc.patient_id
        WHERE COALESCE(pr.is_paid, false) = false AND pr.status != 'cancelled'
      ),
      lab_items AS (
        SELECT enc.patient_id, p.full_name, p.hospital_number, 'lab' as service_type,
               l.id as service_id, l.test_name as description,
               1 as quantity, (SELECT COALESCE(MAX(ii.price), 0) FROM inventory_items ii WHERE ii.drug_name ILIKE l.test_name AND ii.category = 'lab' AND ii.is_active = true) as unit_price,
               (SELECT COALESCE(MAX(ii.price), 0) FROM inventory_items ii WHERE ii.drug_name ILIKE l.test_name AND ii.category = 'lab' AND ii.is_active = true) = 0 as needs_price,
               l.created_at
        FROM lab_orders l JOIN encounters enc ON enc.id = l.encounter_id
        JOIN patients p ON p.id = enc.patient_id
        WHERE COALESCE(l.is_paid, false) = false AND l.status NOT IN ('cancelled', 'completed')
      ),
      rad_items AS (
        SELECT enc.patient_id, p.full_name, p.hospital_number, 'radiology' as service_type,
               r.id as service_id, r.imaging_type as description,
               1 as quantity, (SELECT COALESCE(MAX(ii.price), 0) FROM inventory_items ii WHERE ii.drug_name ILIKE r.imaging_type AND ii.category = 'radiology' AND ii.is_active = true) as unit_price,
               (SELECT COALESCE(MAX(ii.price), 0) FROM inventory_items ii WHERE ii.drug_name ILIKE r.imaging_type AND ii.category = 'radiology' AND ii.is_active = true) = 0 as needs_price,
               r.created_at
        FROM radiology_orders r JOIN encounters enc ON enc.id = r.encounter_id
        JOIN patients p ON p.id = enc.patient_id
        WHERE COALESCE(r.is_paid, false) = false AND r.status NOT IN ('cancelled', 'completed')
      ),
      adm_items AS (
        SELECT a.patient_id, p.full_name, p.hospital_number, 'admission' as service_type,
               a.id as service_id, ('Admission Fee') as description,
               1 as quantity, 0::numeric as unit_price, true as needs_price,
               a.admitted_at as created_at
        FROM admissions a JOIN patients p ON p.id = a.patient_id
        WHERE COALESCE(a.is_paid, false) = false AND a.status = 'active'
      )
      SELECT * FROM (
        SELECT * FROM folder UNION ALL SELECT * FROM rx_items UNION ALL
        SELECT * FROM lab_items UNION ALL SELECT * FROM rad_items UNION ALL SELECT * FROM adm_items
      ) sub ORDER BY created_at DESC NULLS LAST
    `);
    res.json(result.rows);
  } catch (err: any) { res.status(500).json({ error: true, message: err.message }); }
});

router.get('/api/payments/pending-orders', async (req: Request, res: Response) => {
  try {
    const { service_type } = req.query;
    var result = await pool.query(`
      SELECT p.id as payment_id, p.receipt_number, p.walkin_name, p.walkin_phone, p.created_at,
             pi.id as item_id, pi.service_type, pi.description, pi.unit_price, pi.quantity, pi.is_converted
      FROM payments p
      JOIN payment_items pi ON pi.payment_id = p.id
      WHERE pi.is_converted = false
        AND ($1::text IS NULL OR pi.service_type = $1)
        AND p.status = 'completed'
      ORDER BY p.created_at DESC
    `, [service_type || null]);
    res.json(result.rows);
  } catch (err: any) { res.status(500).json({ error: true, message: err.message }); }
});

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



// --- Get payments with unconverted lab/radiology items ---

// --- Mark payment items as converted ---
router.put('/api/payments/items/convert', async (req: Request, res: Response) => {
  try {
    const { item_ids } = req.body;
    if (!item_ids || !Array.isArray(item_ids) || item_ids.length === 0) {
      res.status(400).json({ error: true, message: 'item_ids array is required' });
      return;
    }
    await pool.query(
      'UPDATE payment_items SET is_converted = true WHERE id = ANY($1)',
      [item_ids]
    );
    res.json({ success: true, converted: item_ids.length });
  } catch (err: any) { res.status(500).json({ error: true, message: err.message }); }
});

// --- Patient billing summary (stats + payment history) ---
router.get('/api/payments/patient-billing/:patientId', async (req: Request, res: Response) => {
  try {
    const { patientId } = req.params;
    var result = await pool.query(
      `SELECT json_build_object(
        'total_paid', COALESCE(SUM(p.total_amount), 0),
        'payment_count', COUNT(p.id),
        'first_payment', MIN(p.created_at),
        'last_payment', MAX(p.created_at),
        'cash_total', COALESCE(SUM(CASE WHEN p.payment_method = 'cash' THEN p.total_amount ELSE 0 END), 0),
        'card_total', COALESCE(SUM(CASE WHEN p.payment_method = 'card' THEN p.total_amount ELSE 0 END), 0),
        'transfer_total', COALESCE(SUM(CASE WHEN p.payment_method = 'transfer' THEN p.total_amount ELSE 0 END), 0),
        'walkin_count', COUNT(CASE WHEN p.walkin_name IS NOT NULL THEN 1 END),
        'patient_count', COUNT(CASE WHEN p.patient_id IS NOT NULL THEN 1 END)
      ) as stats,
      COALESCE(
        json_agg(json_build_object(
          'id', p.id, 'receipt_number', p.receipt_number, 'total_amount', p.total_amount,
          'payment_method', p.payment_method, 'created_at', p.created_at,
          'notes', p.notes, 'item_count', (SELECT COUNT(*) FROM payment_items pi WHERE pi.payment_id = p.id)
        ) ORDER BY p.created_at DESC),
        '[]'::json
      ) as payments
      FROM payments p WHERE p.patient_id = $1 AND p.status = 'completed'`,
      [patientId]
    );
    res.json(result.rows[0] || { stats: { total_paid: 0, payment_count: 0 }, payments: [] });
  } catch (err: any) { res.status(500).json({ error: true, message: err.message }); }
});

export default router;
