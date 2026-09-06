import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import pool from '../db/pool';
import { getCoverageForService, getPatientPrimaryInsurance } from '../utils/coverageLookup';
import { readClinicProfile } from '../config/reader';
import { generateNumber } from '../utils/numbering';
import { accrueBedCharges, resolveOneTimeAdmissionFee, resolveWardPerNight } from '../utils/admissionBilling';

const router = Router();

async function generateReceiptNumber(): Promise<string> {
  return generateNumber(readClinicProfile().GLOBAL_SAAS_TENANT_ID, 'receipt', { prefix: 'RCP' });
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
      bed_day: 'admission_daily_charges',
    };
    const table = tableMap[item.service_type];
    if (table) {
      await pool.query(`UPDATE ${table} SET is_paid = true WHERE id = $1`, [item.service_id]);
    }
  } catch {}
}

// ---------------------------------------------------------------------------
// Cost-price snapshotting
//
// A payment must store the item's CURRENT cost price so true profit can be
// recalculated later even if the inventory price/cost changes. Wherever the
// item has a source order (prescription/lab/radiology/admission bed-day) or a
// resolvable inventory service, we read the live cost_price at payment time.
// ---------------------------------------------------------------------------

function cleanItemDescription(description: string | undefined): string {
  return String(description || '')
    .replace(/^(Prescription|Lab|Radiology|Service|Bed Fee|Admission Fee|Folder Activation)\s*[:—–-]?\s*/i, '')
    .split('×')[0]
    .split(' x ')[0]
    .trim();
}

async function inventoryCostByName(tenantId: string, name: string, category: string): Promise<number | null> {
  if (!name) return null;
  const result = await pool.query(
    `SELECT cost_price FROM inventory_items
     WHERE tenant_id = $1 AND category = $2 AND is_active = true AND drug_name ILIKE $3
     ORDER BY created_at DESC LIMIT 1`,
    [tenantId, category, `%${name}%`]
  ).catch(() => ({ rows: [] }));
  return result.rows.length > 0 ? parseFloat(result.rows[0].cost_price) || 0 : null;
}

async function resolveCostAtPayment(item: any, tenantId: string): Promise<number | null> {
  const st = item.service_type;
  const name = cleanItemDescription(item.description);
  try {
    if (st === 'prescription' && item.service_id) {
      const r = await pool.query('SELECT drug_name FROM prescriptions WHERE id = $1', [item.service_id]);
      if (r.rows.length > 0) return await inventoryCostByName(tenantId, r.rows[0].drug_name, 'pharmacy');
    } else if (st === 'lab' && item.service_id) {
      const r = await pool.query('SELECT test_name FROM lab_orders WHERE id = $1', [item.service_id]);
      if (r.rows.length > 0) return await inventoryCostByName(tenantId, r.rows[0].test_name, 'lab');
    } else if (st === 'radiology' && item.service_id) {
      const r = await pool.query('SELECT imaging_type FROM radiology_orders WHERE id = $1', [item.service_id]);
      if (r.rows.length > 0) return await inventoryCostByName(tenantId, r.rows[0].imaging_type, 'radiology');
    } else if (st === 'folder_activation') {
      const r = await pool.query(
        `SELECT i.cost_price FROM inventory_items i
         WHERE i.tenant_id = $1 AND i.is_active = true
           AND (i.service_key = 'FOLDER_ACTIVATION'
                OR (i.category = 'general' AND i.drug_name ILIKE '%folder activation%'))
         ORDER BY (i.service_key = 'FOLDER_ACTIVATION') DESC,
                  (i.drug_name ILIKE '%folder activation fee%') DESC, i.created_at DESC LIMIT 1`,
        [tenantId]
      );
      return r.rows.length > 0 ? parseFloat(r.rows[0].cost_price) || 0 : null;
    } else if (st === 'admission' && item.service_id) {
      // One-time hospital-wide Admission Fee item (keyed first, legacy fallback).
      const r = await pool.query(
        `SELECT i.cost_price FROM inventory_items i
         WHERE i.tenant_id = $1 AND i.is_active = true
           AND (i.service_key = 'ADMISSION_FEE'
                OR (i.category = 'general' AND i.drug_name ILIKE '%Admission%'
                    AND i.drug_name NOT ILIKE '%per night%'
                    AND NOT EXISTS (
                      SELECT 1 FROM wards ww
                      WHERE ww.tenant_id = i.tenant_id AND i.drug_name ILIKE '%' || ww.name || '%'
                    )))
         ORDER BY (i.service_key = 'ADMISSION_FEE') DESC,
                  (i.drug_name ILIKE '%admission fee%') DESC, i.created_at DESC LIMIT 1`,
        [tenantId]
      );
      return r.rows.length > 0 ? parseFloat(r.rows[0].cost_price) || 0 : null;
    } else if (st === 'bed_day' && item.service_id) {
      // Cost is the ward's linked per-night item's current cost (keyed first).
      const w = await pool.query(
        `SELECT a.ward_id AS ward_id, w.name AS ward_name
         FROM admission_daily_charges dc
         JOIN admissions a ON a.id = dc.admission_id
         JOIN wards w ON w.id = a.ward_id
         WHERE dc.id = $1`,
        [item.service_id]
      );
      if (w.rows.length > 0) {
        const wardRate = await resolveWardPerNight(tenantId, w.rows[0].ward_id, w.rows[0].ward_name);
        return wardRate ? wardRate.cost : null;
      }
    } else if ((st === 'pharmacy' || st === 'general') && name) {
      return await inventoryCostByName(tenantId, name, st === 'pharmacy' ? 'pharmacy' : 'general');
    }
  } catch {}
  return null;
}

// --- Get pending/unpaid services for a patient ---
router.get('/api/payments/pending/:patientId', async (req: Request, res: Response) => {
  try {
    const { patientId } = req.params;
    const tenantId = readClinicProfile().GLOBAL_SAAS_TENANT_ID;
    try { await accrueBedCharges(tenantId); } catch {}
    const [folderRes, prescriptionsRes, labRes, radiologyRes, admissionsRes, visitsRes, referralsRes] = await Promise.all([
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
      pool.query(`SELECT a.id, a.admitted_at, w.name as ward_name
        FROM admissions a LEFT JOIN wards w ON w.id = a.ward_id
        WHERE a.patient_id = $1 AND COALESCE(a.is_paid, false) = false
        ORDER BY a.admitted_at DESC`, [patientId]),
      pool.query(`SELECT v.id, v.visit_type, v.consultation_fee, v.consultation_status, v.created_at
        FROM visits v WHERE v.patient_id = $1 AND v.consultation_status = 'pending' AND COALESCE(v.consultation_fee, 0) > 0
        ORDER BY v.created_at DESC`, [patientId]),
      pool.query(`SELECT r.id, r.referral_number, r.consultant_fee, r.consultant_fee_status, r.created_at
        FROM referrals r WHERE r.patient_id = $1 AND r.consultant_fee_status = 'pending' AND COALESCE(r.consultant_fee, 0) > 0
        ORDER BY r.created_at DESC`, [patientId]),
    ]);

    var items: any[] = [];
    var patient = folderRes.rows[0];

    if (!patient?.folder_activated) {
      const folderFee = await pool.query(
        `SELECT price FROM inventory_items
         WHERE tenant_id = $1 AND is_active = true
           AND (service_key = 'FOLDER_ACTIVATION'
                OR (category = 'general' AND drug_name ILIKE '%folder activation%'))
         ORDER BY (service_key = 'FOLDER_ACTIVATION') DESC,
                  (drug_name ILIKE '%folder activation fee%') DESC, created_at DESC LIMIT 1`,
        [tenantId]
      ).catch(() => ({ rows: [] }));
      const folderFeePrice = folderFee.rows.length > 0 ? parseFloat(folderFee.rows[0].price) || 0 : 0;
      items.push({ service_type: 'folder_activation', service_id: null, description: 'Folder Activation / Registration Fee', quantity: 1, unit_price: folderFeePrice, needsPrice: !(folderFeePrice > 0) });
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

    // One-time hospital-wide Admission (processing) fee, once per admission.
    const admissionFee = await resolveOneTimeAdmissionFee(tenantId).catch(() => null);
    const admissionFeePrice = admissionFee ? admissionFee.price : 0;
    for (const r of (admissionsRes.rows || [])) {
      items.push({ service_type: 'admission', service_id: r.id, description: 'Admission Fee', quantity: 1, unit_price: admissionFeePrice, needsPrice: !(admissionFeePrice > 0) });
    }

    // Accrued bed-day charges (24-hour cycle anchored at the admission time)
    const bedDaysRes = await pool.query(
      `SELECT dc.id, dc.day_index, dc.amount, dc.period_start, w.name as ward_name
       FROM admission_daily_charges dc
       JOIN admissions a ON a.id = dc.admission_id
       LEFT JOIN wards w ON w.id = a.ward_id
       WHERE dc.patient_id = $1 AND dc.is_paid = false
       ORDER BY dc.day_index`,
      [patientId]
    );
    for (const b of (bedDaysRes.rows || [])) {
      const bedPrice = parseFloat(b.amount) || 0;
      items.push({
        service_type: 'bed_day',
        service_id: b.id,
        description: `Bed Fee: ${b.ward_name || 'Ward'} (Day ${b.day_index})`,
        quantity: 1,
        unit_price: bedPrice,
        needsPrice: !(bedPrice > 0),
      });
    }

    (visitsRes.rows || []).forEach((r: any) => {
      const typeLabel = r.visit_type === 'follow_up' ? 'Follow-up' : r.visit_type === 'review' ? 'Review' : 'New';
      items.push({ service_type: 'consultation', service_id: r.id, description: `Consultation (${typeLabel} visit)`, quantity: 1, unit_price: parseFloat(r.consultation_fee) || 0, needsPrice: !(parseFloat(r.consultation_fee) > 0) });
    });

    (referralsRes.rows || []).forEach((r: any) => {
      items.push({ service_type: 'referral_fee', service_id: r.id, description: `Specialist (Consultant) Fee — ${r.referral_number}`, quantity: 1, unit_price: parseFloat(r.consultant_fee) || 0, needsPrice: !(parseFloat(r.consultant_fee) > 0) });
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
    // Fall back to the patient_id carried on the line items (some clients only send it per-item)
    const effectivePatientId: string | null = patient_id || (items as any[]).find((i: any) => i.patient_id)?.patient_id || null;
    const tenantId = readClinicProfile().GLOBAL_SAAS_TENANT_ID;

    for (const item of items) {
      if ((item.unit_price !== undefined && item.unit_price < 0) || (item.quantity !== undefined && item.quantity <= 0)) {
        res.status(400).json({ error: true, message: 'Payment items cannot have negative price or zero/negative quantity.' });
        return;
      }
    }

    // Guard payments.created_by FK -> staff_users(id): a stale/invalid creator id
    // (e.g. left over in localStorage from a consolidated account) would otherwise
    // abort the whole payment with a foreign-key violation.
    let creatorId: string | null = created_by || null;
    if (creatorId) {
      try {
        const creatorCheck = await pool.query('SELECT 1 FROM staff_users WHERE id = $1', [creatorId]);
        if (creatorCheck.rows.length === 0) creatorId = null;
      } catch { creatorId = null; }
    }

    var totalAmount = items.reduce((sum: number, i: any) => sum + ((i.unit_price || 0) * (i.quantity || 1)), 0);
    var receiptNumber = await generateReceiptNumber();
    var paymentId = uuidv4();

    await pool.query(
      'INSERT INTO payments (id, tenant_id, receipt_number, patient_id, walkin_name, walkin_phone, total_amount, payment_method, notes, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)',
      [paymentId, tenantId, receiptNumber, effectivePatientId, walkin_name || null, walkin_phone || null, totalAmount, payment_method || 'cash', notes || null, creatorId]
    );

    for (const item of items) {
      var itemId = uuidv4();
      var totalPrice = (item.unit_price || 0) * (item.quantity || 1);
      // Snapshot the CURRENT cost price of the item at the moment of payment so
      // true profit stays calculable even if inventory prices change later.
      var costPrice: number | null = await resolveCostAtPayment(item, tenantId).catch(() => null);
      if (costPrice === null || costPrice === undefined) costPrice = item.cost_price || 0;
      if (!item.unit_price || item.unit_price === 0) {
        try {
          const invRes = await pool.query('SELECT cost_price, price FROM inventory_items WHERE drug_name ILIKE $1 AND category = $2 LIMIT 1',
            [cleanItemDescription(item.description), item.service_type === 'pharmacy' ? 'pharmacy' : item.service_type === 'lab' ? 'lab' : item.service_type === 'radiology' ? 'radiology' : 'general']);
          if (invRes.rows.length > 0) {
            if (costPrice === 0) costPrice = invRes.rows[0].cost_price || 0;
            item.unit_price = invRes.rows[0].price || 0;
          }
        } catch {}
      }
      await pool.query(
        'INSERT INTO payment_items (id, tenant_id, payment_id, service_type, service_id, description, item_name, quantity, unit_price, total_price, cost_price) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)',
        [itemId, tenantId, paymentId, item.service_type, item.service_id || null, item.description, item.description, item.quantity || 1, item.unit_price || 0, totalPrice, costPrice || 0]
      );

      // Mark service as paid
      if (item.service_type === 'folder_activation' && effectivePatientId) {
        await pool.query('UPDATE patients SET folder_activated = true WHERE id = $1', [effectivePatientId]);
      } else if (item.service_type === 'prescription' && item.service_id) {
        await pool.query('UPDATE prescriptions SET is_paid = true WHERE id = $1', [item.service_id]);
      } else if (item.service_type === 'lab' && item.service_id) {
        await pool.query('UPDATE lab_orders SET is_paid = true WHERE id = $1', [item.service_id]);
      } else if (item.service_type === 'radiology' && item.service_id) {
        await pool.query('UPDATE radiology_orders SET is_paid = true WHERE id = $1', [item.service_id]);
      } else if (item.service_type === 'admission' && item.service_id) {
        await pool.query('UPDATE admissions SET is_paid = true WHERE id = $1', [item.service_id]);
      } else if (item.service_type === 'bed_day' && item.service_id) {
        await pool.query('UPDATE admission_daily_charges SET is_paid = true WHERE id = $1', [item.service_id]);
      } else if (item.service_type === 'consultation' && item.service_id) {
        await pool.query(`UPDATE visits SET consultation_status = 'paid' WHERE id = $1`, [item.service_id]);
      } else if (item.service_type === 'referral_fee' && item.service_id) {
        await pool.query(`UPDATE referrals SET consultant_fee_status = 'paid' WHERE id = $1`, [item.service_id]);
      }
    }

    // Materialize consultation fees sold through the service catalog (e.g. "General Consultation (New)")
    // into a paid, unused visit so the patient shows up in the claimable / unassigned queues.
    // Visit-linked consultations (service_type === 'consultation' with a service_id) were handled above.
    for (const item of items) {
      // Referral fees are handled above — never materialize them into a visit.
      if (item.service_type === 'referral_fee') continue;
      const desc = String(item.description || '').toLowerCase();
      const isConsultationSale = item.service_type === 'consultation' || desc.includes('consultation');
      if (!isConsultationSale) continue;
      if (item.service_type === 'consultation' && item.service_id) continue;
      if (!effectivePatientId) continue;

      const visitType = desc.includes('follow-up') || desc.includes('follow up') ? 'follow_up'
        : desc.includes('review') ? 'review' : 'new';
      const fee = parseFloat(item.unit_price) || 0;

      // Reuse the patient's open waiting visit if one exists; otherwise create a paid, unused one.
      const existing = await pool.query(
        `SELECT id FROM visits
         WHERE tenant_id = $1 AND patient_id = $2 AND status = 'waiting'
           AND consultation_status IN ('pending', 'paid', 'insurance_authorized')
         ORDER BY created_at DESC LIMIT 1`,
        [tenantId, effectivePatientId]
      );
      if (existing.rows.length > 0) {
        await pool.query(
          `UPDATE visits SET consultation_status = 'paid',
             consultation_fee = GREATEST(consultation_fee, $1)
           WHERE id = $2`,
          [fee, existing.rows[0].id]
        );
      } else {
        await pool.query(
          `INSERT INTO visits (id, tenant_id, patient_id, assigned_doctor_id, department_id, visit_type, consultation_fee, consultation_status, status)
           VALUES ($1, $2, $3, NULL, NULL, $4, $5, 'paid', 'waiting')`,
          [uuidv4(), tenantId, effectivePatientId, visitType, fee]
        );
      }
    }

    // Fetch the complete payment with items
    var payment = await pool.query('SELECT * FROM payments WHERE id = $1', [paymentId]);
    var paymentItems = await pool.query('SELECT * FROM payment_items WHERE payment_id = $1', [paymentId]);
    var patientData = effectivePatientId ? await pool.query('SELECT full_name, hospital_number FROM patients WHERE id = $1', [effectivePatientId]) : null;

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
    const tenantId = readClinicProfile().GLOBAL_SAAS_TENANT_ID;
    const { patient_id, date_from, date_to } = req.query;
    var query = `SELECT p.*, s.name as staff_name, pat.full_name as patient_name, pat.hospital_number,
                  (SELECT COUNT(*) FROM payment_items pi WHERE pi.payment_id = p.id)::int as item_count
                  FROM payments p
                  LEFT JOIN staff_users s ON s.id = p.created_by
                  LEFT JOIN patients pat ON pat.id = p.patient_id
                  WHERE p.tenant_id = $1`;
    var params: any[] = [tenantId];
    var idx = 2;

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
    const tenantId = readClinicProfile().GLOBAL_SAAS_TENANT_ID;
    try { await accrueBedCharges(tenantId); } catch {}
    var result = await pool.query(`
      WITH folder AS (
        SELECT id as patient_id, full_name, hospital_number, phone, created_at,
               'folder_activation' as service_type,
               'Folder Activation Fee' as description, 1 as item_count FROM patients
        WHERE folder_activated = false AND tenant_id = $1
      ),
      rx AS (
        SELECT enc.patient_id, p.full_name, p.hospital_number, p.phone, MAX(pr.created_at) as created_at,
               'prescription' as service_type,
               COUNT(*)::int || ' Prescription(s)' as description, COUNT(*) as item_count
        FROM prescriptions pr
        JOIN encounters enc ON enc.id = pr.encounter_id
        JOIN patients p ON p.id = enc.patient_id
        WHERE COALESCE(pr.is_paid, false) = false AND pr.status != 'cancelled' AND enc.tenant_id = $1
        GROUP BY enc.patient_id, p.full_name, p.hospital_number, p.phone
      ),
      lab AS (
        SELECT enc.patient_id, p.full_name, p.hospital_number, p.phone, MAX(l.created_at) as created_at,
               'lab' as service_type,
               COUNT(*)::int || ' Lab Test(s)' as description, COUNT(*) as item_count
        FROM lab_orders l
        JOIN encounters enc ON enc.id = l.encounter_id
        JOIN patients p ON p.id = enc.patient_id
        WHERE COALESCE(l.is_paid, false) = false AND l.status NOT IN ('cancelled','completed') AND enc.tenant_id = $1
        GROUP BY enc.patient_id, p.full_name, p.hospital_number, p.phone
      ),
      rad AS (
        SELECT enc.patient_id, p.full_name, p.hospital_number, p.phone, MAX(r.created_at) as created_at,
               'radiology' as service_type,
               COUNT(*)::int || ' Radiology Order(s)' as description, COUNT(*) as item_count
        FROM radiology_orders r
        JOIN encounters enc ON enc.id = r.encounter_id
        JOIN patients p ON p.id = enc.patient_id
        WHERE COALESCE(r.is_paid, false) = false AND r.status NOT IN ('cancelled','completed') AND enc.tenant_id = $1
        GROUP BY enc.patient_id, p.full_name, p.hospital_number, p.phone
      ),
      adm AS (
        SELECT a.patient_id, p.full_name, p.hospital_number, p.phone, a.admitted_at as created_at,
               'admission' as service_type,
               'Admission Fee' as description,
               1 as item_count
        FROM admissions a JOIN patients p ON p.id = a.patient_id
        WHERE COALESCE(a.is_paid, false) = false AND a.tenant_id = $1
      ),
      bed AS (
        SELECT dc.patient_id, p.full_name, p.hospital_number, p.phone, MAX(dc.period_start) as created_at,
               'bed_day' as service_type,
               COUNT(*)::int || ' Bed Day(s)' as description, COUNT(*) as item_count
        FROM admission_daily_charges dc
        JOIN patients p ON p.id = dc.patient_id
        WHERE dc.is_paid = false AND p.tenant_id = $1
        GROUP BY dc.patient_id, p.full_name, p.hospital_number, p.phone
      ),
      consult AS (
        SELECT v.patient_id, p.full_name, p.hospital_number, p.phone, MAX(v.created_at) as created_at,
               'consultation' as service_type,
               'Consultation Fee' as description, COUNT(*)::int as item_count
        FROM visits v JOIN patients p ON p.id = v.patient_id
        WHERE v.consultation_status = 'pending' AND COALESCE(v.consultation_fee, 0) > 0 AND v.tenant_id = $1
        GROUP BY v.patient_id, p.full_name, p.hospital_number, p.phone
      ),
      ref_fee AS (
        SELECT r.patient_id, p.full_name, p.hospital_number, p.phone, MAX(r.created_at) as created_at,
               'referral_fee' as service_type,
               'Specialist (Consultant) Fee' as description, COUNT(*)::int as item_count
        FROM referrals r JOIN patients p ON p.id = r.patient_id
        WHERE r.consultant_fee_status = 'pending' AND COALESCE(r.consultant_fee, 0) > 0 AND r.tenant_id = $1
        GROUP BY r.patient_id, p.full_name, p.hospital_number, p.phone
      ),
      all_pending AS (
        SELECT * FROM folder UNION ALL SELECT * FROM rx UNION ALL
        SELECT * FROM lab UNION ALL SELECT * FROM rad UNION ALL SELECT * FROM adm UNION ALL
        SELECT * FROM bed UNION ALL
        SELECT * FROM consult UNION ALL SELECT * FROM ref_fee
      )
      SELECT ap.patient_id, ap.full_name, ap.hospital_number, ap.phone,
             json_agg(json_build_object('service_type', ap.service_type, 'description', ap.description, 'item_count', ap.item_count)) as services,
             SUM(ap.item_count) as total_items,
             MAX(ap.created_at) as last_pending_at,
             (SELECT prv.name FROM patient_insurance_policies pp
                JOIN insurance_providers prv ON prv.id = pp.provider_id
              WHERE pp.patient_id = ap.patient_id AND pp.is_active = true AND pp.coverage_type = 'primary'
                AND (pp.end_date IS NULL OR pp.end_date >= CURRENT_DATE) AND prv.is_active = true
              ORDER BY pp.created_at LIMIT 1) as insurance_provider
      FROM all_pending ap
      GROUP BY ap.patient_id, ap.full_name, ap.hospital_number, ap.phone
      ORDER BY MAX(ap.created_at) DESC NULLS LAST
    `, [tenantId]);
    res.json(result.rows);
  } catch (err: any) { res.status(500).json({ error: true, message: err.message }); }
});

// --- All pending items across all patients (comprehensive, with prices) ---
router.get('/api/payments/all-pending-items', async (req: Request, res: Response) => {
  try {
    const tenantId = readClinicProfile().GLOBAL_SAAS_TENANT_ID;
    try { await accrueBedCharges(tenantId); } catch {}
    var result = await pool.query(`
      WITH       folder AS (
        SELECT id as patient_id, full_name, hospital_number, phone,
               'folder_activation'::text as service_type, NULL::uuid as service_id,
               'Folder Activation / Registration Fee'::text as description,
               1::int as quantity,
               COALESCE((SELECT i.price FROM inventory_items i
                         WHERE i.tenant_id = $1 AND i.is_active = true
                           AND (i.service_key = 'FOLDER_ACTIVATION'
                                OR (i.category = 'general' AND i.drug_name ILIKE '%folder activation%'))
                         ORDER BY (i.service_key = 'FOLDER_ACTIVATION') DESC,
                                  (i.drug_name ILIKE '%folder activation fee%') DESC, i.created_at DESC LIMIT 1), 0)::numeric as unit_price,
               (COALESCE((SELECT i.price FROM inventory_items i
                          WHERE i.tenant_id = $1 AND i.is_active = true
                            AND (i.service_key = 'FOLDER_ACTIVATION'
                                 OR (i.category = 'general' AND i.drug_name ILIKE '%folder activation%'))
                          ORDER BY (i.service_key = 'FOLDER_ACTIVATION') DESC,
                                   (i.drug_name ILIKE '%folder activation fee%') DESC, i.created_at DESC LIMIT 1), 0) <= 0) as needs_price,
               created_at
        FROM patients WHERE folder_activated = false AND tenant_id = $1
      ),
      rx_items AS (
        SELECT enc.patient_id, p.full_name, p.hospital_number, p.phone, 'prescription' as service_type,
               pr.id as service_id, (pr.drug_name || COALESCE(' ' || pr.dosage, '') || ' × ' || COALESCE(pr.quantity::text, '1')) as description,
               pr.quantity, (SELECT COALESCE(MAX(ii.price), 0) FROM inventory_items ii WHERE ii.drug_name ILIKE pr.drug_name AND ii.category = 'pharmacy' AND ii.is_active = true) as unit_price,
               (SELECT COALESCE(MAX(ii.price), 0) FROM inventory_items ii WHERE ii.drug_name ILIKE pr.drug_name AND ii.category = 'pharmacy' AND ii.is_active = true) = 0 as needs_price,
               pr.created_at
        FROM prescriptions pr JOIN encounters enc ON enc.id = pr.encounter_id
        JOIN patients p ON p.id = enc.patient_id
        WHERE COALESCE(pr.is_paid, false) = false AND pr.status != 'cancelled' AND enc.tenant_id = $1
      ),
      lab_items AS (
        SELECT enc.patient_id, p.full_name, p.hospital_number, p.phone, 'lab' as service_type,
               l.id as service_id, l.test_name as description,
               1 as quantity, (SELECT COALESCE(MAX(ii.price), 0) FROM inventory_items ii WHERE ii.drug_name ILIKE l.test_name AND ii.category = 'lab' AND ii.is_active = true) as unit_price,
               (SELECT COALESCE(MAX(ii.price), 0) FROM inventory_items ii WHERE ii.drug_name ILIKE l.test_name AND ii.category = 'lab' AND ii.is_active = true) = 0 as needs_price,
               l.created_at
        FROM lab_orders l JOIN encounters enc ON enc.id = l.encounter_id
        JOIN patients p ON p.id = enc.patient_id
        WHERE COALESCE(l.is_paid, false) = false AND l.status NOT IN ('cancelled', 'completed') AND enc.tenant_id = $1
      ),
      rad_items AS (
        SELECT enc.patient_id, p.full_name, p.hospital_number, p.phone, 'radiology' as service_type,
               r.id as service_id, r.imaging_type as description,
               1 as quantity, (SELECT COALESCE(MAX(ii.price), 0) FROM inventory_items ii WHERE ii.drug_name ILIKE r.imaging_type AND ii.category = 'radiology' AND ii.is_active = true) as unit_price,
               (SELECT COALESCE(MAX(ii.price), 0) FROM inventory_items ii WHERE ii.drug_name ILIKE r.imaging_type AND ii.category = 'radiology' AND ii.is_active = true) = 0 as needs_price,
               r.created_at
        FROM radiology_orders r JOIN encounters enc ON enc.id = r.encounter_id
        JOIN patients p ON p.id = enc.patient_id
        WHERE COALESCE(r.is_paid, false) = false AND r.status NOT IN ('cancelled', 'completed') AND enc.tenant_id = $1
      ),
      adm_items AS (
        SELECT a.patient_id, p.full_name, p.hospital_number, p.phone, 'admission' as service_type,
               a.id as service_id,
               'Admission Fee' as description,
               1 as quantity,
               COALESCE((SELECT i.price FROM inventory_items i
                         WHERE i.tenant_id = a.tenant_id AND i.is_active = true
                           AND (i.service_key = 'ADMISSION_FEE'
                                OR (i.category = 'general' AND i.drug_name ILIKE '%Admission%'
                                    AND i.drug_name NOT ILIKE '%per night%'
                                    AND NOT EXISTS (
                                      SELECT 1 FROM wards ww
                                      WHERE ww.tenant_id = i.tenant_id AND i.drug_name ILIKE '%' || ww.name || '%'
                                    )))
                         ORDER BY (i.service_key = 'ADMISSION_FEE') DESC,
                                  (i.drug_name ILIKE '%admission fee%') DESC, i.created_at DESC LIMIT 1), 0)::numeric as unit_price,
        (COALESCE((SELECT i.price FROM inventory_items i
                   WHERE i.tenant_id = a.tenant_id AND i.is_active = true
                     AND (i.service_key = 'ADMISSION_FEE'
                          OR (i.category = 'general' AND i.drug_name ILIKE '%Admission%'
                              AND i.drug_name NOT ILIKE '%per night%'
                              AND NOT EXISTS (
                                SELECT 1 FROM wards ww
                                WHERE ww.tenant_id = i.tenant_id AND i.drug_name ILIKE '%' || ww.name || '%'
                              )))
                   ORDER BY (i.service_key = 'ADMISSION_FEE') DESC,
                            (i.drug_name ILIKE '%admission fee%') DESC, i.created_at DESC LIMIT 1), 0) <= 0) as needs_price,
               a.admitted_at as created_at
        FROM admissions a JOIN patients p ON p.id = a.patient_id
        WHERE COALESCE(a.is_paid, false) = false AND a.tenant_id = $1
      ),
      bed_items AS (
        SELECT dc.patient_id, p.full_name, p.hospital_number, p.phone, 'bed_day' as service_type,
               dc.id as service_id,
               ('Bed Fee (Day ' || dc.day_index || ')' || CASE WHEN w.name IS NOT NULL THEN ' — ' || w.name ELSE '' END) as description,
               1 as quantity, dc.amount::numeric as unit_price,
               (dc.amount <= 0) as needs_price,
               dc.period_start as created_at
        FROM admission_daily_charges dc
        JOIN patients p ON p.id = dc.patient_id
        LEFT JOIN admissions a ON a.id = dc.admission_id
        LEFT JOIN wards w ON w.id = a.ward_id
        WHERE dc.is_paid = false AND p.tenant_id = $1
      ),
      consult_items AS (
        SELECT v.patient_id, p.full_name, p.hospital_number, p.phone, 'consultation' as service_type,
               v.id as service_id,
               ('Consultation (' || CASE v.visit_type WHEN 'follow_up' THEN 'follow-up' WHEN 'review' THEN 'review' ELSE 'new' END || ' visit)' ||
                CASE WHEN v.remarks IS NOT NULL THEN ' — ' || v.remarks ELSE '' END) as description,
               1 as quantity, COALESCE(v.consultation_fee, 0)::numeric as unit_price,
               (COALESCE(v.consultation_fee, 0) <= 0) as needs_price,
               v.created_at
        FROM visits v JOIN patients p ON p.id = v.patient_id
        WHERE v.consultation_status = 'pending' AND COALESCE(v.consultation_fee, 0) > 0 AND v.tenant_id = $1
      ),
      ref_fee_items AS (
        SELECT r.patient_id, p.full_name, p.hospital_number, p.phone, 'referral_fee' as service_type,
               r.id as service_id,
               ('Specialist (Consultant) Fee — ' || r.referral_number) as description,
               1 as quantity, COALESCE(r.consultant_fee, 0)::numeric as unit_price,
               (COALESCE(r.consultant_fee, 0) <= 0) as needs_price,
               r.created_at
        FROM referrals r JOIN patients p ON p.id = r.patient_id
        WHERE r.consultant_fee_status = 'pending' AND COALESCE(r.consultant_fee, 0) > 0 AND r.tenant_id = $1
      )
      SELECT sub.*,
        (SELECT prv.name FROM patient_insurance_policies pp
           JOIN insurance_providers prv ON prv.id = pp.provider_id
         WHERE pp.patient_id = sub.patient_id AND pp.is_active = true AND pp.coverage_type = 'primary'
           AND (pp.end_date IS NULL OR pp.end_date >= CURRENT_DATE) AND prv.is_active = true
         ORDER BY pp.created_at LIMIT 1) as insurance_provider
      FROM (
        SELECT * FROM folder UNION ALL SELECT * FROM rx_items UNION ALL
        SELECT * FROM lab_items UNION ALL SELECT * FROM rad_items UNION ALL SELECT * FROM adm_items UNION ALL
        SELECT * FROM bed_items UNION ALL
        SELECT * FROM consult_items UNION ALL SELECT * FROM ref_fee_items
      ) sub ORDER BY created_at DESC NULLS LAST
    `, [tenantId]);
    res.json(result.rows);
  } catch (err: any) { res.status(500).json({ error: true, message: err.message }); }
});

router.get('/api/payments/pending-orders', async (req: Request, res: Response) => {
  try {
    const tenantId = readClinicProfile().GLOBAL_SAAS_TENANT_ID;
    const { service_type } = req.query;
    var result = await pool.query(`
      SELECT p.id as payment_id, p.receipt_number, p.walkin_name, p.walkin_phone, p.created_at,
             pi.id as item_id, pi.service_type, pi.description, pi.unit_price, pi.quantity, pi.is_converted
      FROM payments p
      JOIN payment_items pi ON pi.payment_id = p.id
      WHERE pi.is_converted = false
        AND ($1::text IS NULL OR pi.service_type = $1)
        AND p.status = 'completed'
        AND p.tenant_id = $2
      ORDER BY p.created_at DESC
    `, [service_type || null, tenantId]);
    res.json(result.rows);
  } catch (err: any) { res.status(500).json({ error: true, message: err.message }); }
});

router.get('/api/payments/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = readClinicProfile().GLOBAL_SAAS_TENANT_ID;
    var payment = await pool.query(
      'SELECT p.*, s.name as staff_name, pat.full_name as patient_name, pat.hospital_number FROM payments p LEFT JOIN staff_users s ON s.id = p.created_by LEFT JOIN patients pat ON pat.id = p.patient_id WHERE p.id = $1 AND p.tenant_id = $2',
      [String(req.params.id), tenantId]
    );
    if (payment.rows.length === 0) { res.status(404).json({ error: true, message: 'Payment not found' }); return; }
    var items = await pool.query('SELECT * FROM payment_items WHERE payment_id = $1 ORDER BY service_type', [req.params.id]);
    res.json({ ...payment.rows[0], items: items.rows });
  } catch (err: any) { res.status(500).json({ error: true, message: err.message }); }
});

// --- Revenue stats ---
router.get('/api/payments/revenue/stats', async (req: Request, res: Response) => {
  try {
    const tenantId = readClinicProfile().GLOBAL_SAAS_TENANT_ID;
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
              COALESCE(SUM(total_amount) FILTER (WHERE payment_method = 'pos'), 0) as pos_total,
              (SELECT COALESCE(SUM(pi.cost_price * pi.quantity), 0)
               FROM payment_items pi JOIN payments pp ON pp.id = pi.payment_id
               WHERE pp.status = 'completed' AND pp.tenant_id = $2) as total_cost,
              (SELECT COALESCE(SUM(pi.cost_price * pi.quantity), 0)
               FROM payment_items pi JOIN payments pp ON pp.id = pi.payment_id
               WHERE pp.status = 'completed' AND pp.tenant_id = $2 AND pp.created_at::date = $1::date) as today_cost
       FROM payments WHERE status = 'completed' AND tenant_id = $2`,
      [today, tenantId]
    );
    const s = stats.rows[0];
    const totalRevenue = parseFloat(s.total_revenue || 0);
    const todayRevenue = parseFloat(s.today_revenue || 0);
    const totalCost = parseFloat(s.total_cost || 0);
    const todayCost = parseFloat(s.today_cost || 0);
    res.json({ ...s, total_cost: totalCost, today_cost: todayCost, total_profit: totalRevenue - totalCost, today_profit: todayRevenue - todayCost });
  } catch (err: any) { res.status(500).json({ error: true, message: err.message }); }
});

// --- Revenue by service type ---
router.get('/api/payments/revenue/by-service', async (req: Request, res: Response) => {
  try {
    const tenantId = readClinicProfile().GLOBAL_SAAS_TENANT_ID;
    var result = await pool.query(
      `SELECT pi.service_type, COUNT(*) as count,
              COALESCE(SUM(pi.total_price), 0) as total,
              COALESCE(SUM(pi.cost_price * pi.quantity), 0) as cost,
              COALESCE(SUM(pi.total_price) - SUM(pi.cost_price * pi.quantity), 0) as profit
       FROM payment_items pi JOIN payments p ON p.id = pi.payment_id
       WHERE p.status = 'completed' AND p.tenant_id = $1
       GROUP BY pi.service_type ORDER BY total DESC`, [tenantId]
    );
    res.json(result.rows.map((r: any) => ({ ...r, total: parseFloat(r.total || 0), cost: parseFloat(r.cost || 0), profit: parseFloat(r.profit || 0) })));
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
