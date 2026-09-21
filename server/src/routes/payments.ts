import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import pool from '../db/pool';
import { getCoverageForService, getPatientPrimaryInsurance, resolveBillingCase } from '../utils/coverageLookup';
import { readClinicProfile } from '../config/reader';
import { generateNumber } from '../utils/numbering';
import { accrueBedCharges, resolveWardPerNight } from '../utils/admissionBilling';
import { createTtlCache } from '../utils/ttlCache';
import { resolveMaternityUnlock, getPaidMaternityEntitlement, createMaternityEntitlement, MaternityUnlockItem } from '../utils/maternityEntitlement';
import { buildBasePendingItems, cleanItemDescription } from '../utils/patientPendingItems';
import { applyAllHeldDeposits, applyHeldDepositsToItems, getHeldDeposits } from '../utils/patientBalance';

const router = Router();

// Pending paypoint data does not need sub-second freshness. Short-TTL caches
// absorb repeated calls from open Paypoint screens and background pollers.
const PENDING_TTL_MS = 5000;
const pendingSummaryCache = createTtlCache<any[]>(PENDING_TTL_MS);
const allPendingItemsCache = createTtlCache<any[]>(PENDING_TTL_MS);

function invalidatePendingCaches(): void {
  pendingSummaryCache.clear();
  allPendingItemsCache.clear();
}

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
    // A pharmacy bill moves to 'paid' (its stock was already held at creation).
    if (item.service_type === 'pharmacy_bill') {
      await pool.query(`UPDATE pharmacy_bills SET status = 'paid', paid_at = NOW() WHERE id = $1 AND status = 'awaiting_payment'`, [item.service_id]);
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
    // Services carry no cost basis, so profit is always computed at cost 0 for
    // them regardless of what a caller might send. Stock items (pharmacy, lab,
    // radiology, and their source orders) keep their real cost below.
    if (['consultation', 'referral_fee', 'procedure', 'maternity', 'treatment', 'fluid', 'general', 'walkin_service', 'billing', 'other'].includes(st)) {
      return 0;
    }
    if (st === 'pharmacy_bill') {
      // Priced by the pharmacist; no separate cost to resolve here.
      return 0;
    } else if (st === 'prescription' && item.service_id) {
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
        `SELECT COALESCE(dc.ward_id, a.ward_id) AS ward_id, w.name AS ward_name
         FROM admission_daily_charges dc
         JOIN admissions a ON a.id = dc.admission_id
         JOIN wards w ON w.id = COALESCE(dc.ward_id, a.ward_id)
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
    // Deposits held on account settle outstanding items before anything else.
    try { await applyHeldDepositsToItems(pool, tenantId, String(patientId)); } catch {}
    // Shared, read-only builder of the patient's unpaid items. The same list
    // backs the admission financial-clearance gate, so the two never disagree.
    const { items: baseItems } = await buildBasePendingItems(String(patientId), tenantId);
    let items: any[] = baseItems;

    // --- Auto-apply insurance coverage for insured patients ---
    let insuredCoverage: any = { active: false };
    try {
      insuredCoverage = (await getPatientPrimaryInsurance(String(patientId))) || { active: false };
      // Only apply coverage while the case is inside its coverage window.
      const billingCase = await resolveBillingCase(String(patientId));
      const inWindow = billingCase ? billingCase.inWindow : false;
      if (insuredCoverage.active && insuredCoverage.caseId && inWindow) {
        const cid = insuredCoverage.caseId;
        const caseTenant = await pool.query('SELECT tenant_id FROM insurance_cases WHERE id = $1', [cid]);
        const tenantId = caseTenant.rows[0]?.tenant_id || '00000000-0000-0000-0000-000000000000';

        const filteredItems: any[] = [];
        for (const item of items) {
          const itemName = item.description?.split(': ')[1]?.split(' ×')[0] || item.description || '';
          // Storage keeps the original service_type; coverage for bed-day
          // charges prices against the ward's admission rule.
          const svcType = item.service_type === 'prescription' ? 'pharmacy' : item.service_type;
          const coverageType = item.service_type === 'bed_day' ? 'admission' : svcType;
          const coverageItemId = item.coverage_item_id || item.service_id || null;
          const coveragePct = await getCoverageForService(insuredCoverage.providerId, coverageType, itemName, coverageItemId);
          const totalPrice = (item.unit_price || 0) * (item.quantity || 1);
          const insurancePortion = Math.round(totalPrice * coveragePct) / 100;
          const patientPortion = Math.round((totalPrice - insurancePortion) * 100) / 100;

          // Use the row id when several rows share one source (pharmacy bill
          // lines), so each line becomes its own case service instead of being
          // deduped away.
          const sourceRef = item.line_id || item.service_id;
          if (coveragePct === 100) {
            // Fully covered — auto-bill to insurance, mark source as paid, skip Paypoint
            await autoBillToCase(cid, tenantId, item, totalPrice, sourceRef, svcType);
            await markOrderAsPaid(item);
          } else if (coveragePct > 0) {
            // Partially covered — bill insurance portion to case, patient pays the rest at Paypoint
            if (insurancePortion > 0) {
              await autoBillToCase(cid, tenantId, item, insurancePortion, sourceRef, svcType);
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

    // Any deposit credit left after settling whole items reduces the next
    // remaining item, so the cashier collects only the net amount due.
    let depositApplied = 0;
    try {
      let credit = await getHeldDeposits(pool, tenantId, String(patientId));
      if (credit > 0.001 && items.length > 0) {
        const netted: any[] = [];
        for (const it of items) {
          const qty = Number(it.quantity) || 1;
          const amt = (Number(it.unit_price) || 0) * qty;
          if (credit <= 0.001 || amt <= 0) { netted.push(it); continue; }
          if (credit >= amt - 0.001) {
            depositApplied += amt;
            credit -= amt; // fully covered by the remaining credit — drop the line
          } else {
            const newAmt = amt - credit;
            netted.push({ ...it, unit_price: Math.round((newAmt / qty) * 100) / 100, original_price: it.unit_price, deposit_applied: Math.round(credit * 100) / 100 });
            depositApplied += credit;
            credit = 0;
          }
        }
        items = netted;
      }
    } catch {}

    res.json({ items, patient_name: '', hospital_number: '', insured: insuredCoverage, deposit_applied: Math.round(depositApplied * 100) / 100 });
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

    // Antenatal booking: female-only, exactly one at a time, registered patient,
    // and the patient must not already hold an unused paid entitlement.
    const unlockItems: { item: any; inv: MaternityUnlockItem }[] = [];
    for (const item of items) {
      const inv = await resolveMaternityUnlock(pool, tenantId, item);
      if (inv) unlockItems.push({ item, inv });
    }
    if (unlockItems.length > 0) {
      if (!effectivePatientId) {
        res.status(400).json({ error: true, message: 'Antenatal booking must be billed to a registered patient, not a walk-in customer.' });
        return;
      }
      const sexRes = await pool.query('SELECT sex, folder_activated FROM patients WHERE id = $1 AND tenant_id = $2', [effectivePatientId, tenantId]);
      if (sexRes.rows.length === 0) {
        res.status(404).json({ error: true, message: 'Patient not found' });
        return;
      }
      const sex = sexRes.rows[0].sex;
      const badItem = unlockItems.find((u) => u.inv.gender_restriction && sex !== u.inv.gender_restriction);
      if (badItem) {
        res.status(400).json({ error: true, message: `${badItem.inv.drug_name} can only be billed to ${String(badItem.inv.gender_restriction).toLowerCase()} patients.` });
        return;
      }
      // Folder must be activated before a pregnancy can be booked. The folder
      // fee may be settled on this same bill, so allow the combination.
      const folderActivationInCart = items.some((i: any) => i.service_type === 'folder_activation');
      if (sexRes.rows[0].folder_activated === false && !folderActivationInCart) {
        res.status(400).json({ error: true, message: 'Patient folder is not activated. Bill and Activate folder first (add the Folder Activation fee to this bill).' });
        return;
      }
      if (unlockItems.length > 1) {
        res.status(400).json({ error: true, message: 'Only one antenatal booking service can be paid at a time.' });
        return;
      }
      const existing = await getPaidMaternityEntitlement(pool, tenantId, effectivePatientId);
      if (existing) {
        res.status(409).json({ error: true, message: 'This patient already has a paid antenatal booking awaiting pregnancy booking.' });
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

    // All writes for one payment happen in a single transaction: a mid-cart
    // failure can no longer leave a half-written payment/order state, and the
    // N line-item inserts now share one commit instead of N autocommits.
    const client = await pool.connect();
    const paidByTable: Record<string, Set<string>> = {};
    const addPaid = (table: string, id: string | null | undefined) => {
      if (!id) return;
      if (!paidByTable[table]) paidByTable[table] = new Set<string>();
      paidByTable[table].add(id);
    };
      const folderPatientIds = new Set<string>();
      const paidVisitIds = new Set<string>();
      const paidReferralIds = new Set<string>();
      const paidPharmacyBillIds = new Set<string>();

    try {
      await client.query('BEGIN');

      await client.query(
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
            const invRes = await client.query('SELECT cost_price, price FROM inventory_items WHERE drug_name ILIKE $1 AND category = $2 LIMIT 1',
              [cleanItemDescription(item.description), item.service_type === 'pharmacy' ? 'pharmacy' : item.service_type === 'lab' ? 'lab' : item.service_type === 'radiology' ? 'radiology' : 'general']);
            if (invRes.rows.length > 0) {
              if (costPrice === 0) costPrice = invRes.rows[0].cost_price || 0;
              item.unit_price = invRes.rows[0].price || 0;
            }
          } catch {}
        }
        await client.query(
          'INSERT INTO payment_items (id, tenant_id, payment_id, service_type, service_id, description, item_name, quantity, unit_price, total_price, cost_price) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)',
          [itemId, tenantId, paymentId, item.service_type, item.service_id || null, item.description, item.description, item.quantity || 1, item.unit_price || 0, totalPrice, costPrice || 0]
        );

        // Paying the antenatal booking service creates the patient's entitlement
        // in the same transaction, so payment and entitlement can never diverge.
        if (effectivePatientId && unlockItems.length === 1 && item === unlockItems[0].item) {
          await createMaternityEntitlement(client, tenantId, effectivePatientId, {
            paymentId,
            paymentItemId: itemId,
            source: 'paypoint',
          });
        }

        // Collect "mark paid" targets and flush them in one statement per table.
        if (item.service_type === 'folder_activation' && effectivePatientId) {
          folderPatientIds.add(effectivePatientId);
        } else if (item.service_type === 'prescription') {
          addPaid('prescriptions', item.service_id);
        } else if (item.service_type === 'lab') {
          addPaid('lab_orders', item.service_id);
        } else if (item.service_type === 'radiology') {
          addPaid('radiology_orders', item.service_id);
        } else if (item.service_type === 'admission') {
          addPaid('admissions', item.service_id);
        } else if (item.service_type === 'bed_day') {
          addPaid('admission_daily_charges', item.service_id);
        } else if (item.service_type === 'consultation' && item.service_id) {
          paidVisitIds.add(item.service_id);
        } else if (item.service_type === 'referral_fee' && item.service_id) {
          paidReferralIds.add(item.service_id);
        } else if (item.service_type === 'pharmacy_bill' && item.service_id) {
          paidPharmacyBillIds.add(item.service_id);
        }
      }

      if (folderPatientIds.size > 0) {
        await client.query('UPDATE patients SET folder_activated = true WHERE id = ANY($1)', [Array.from(folderPatientIds)]);
      }
      for (const [table, ids] of Object.entries(paidByTable)) {
        if (ids.size > 0) {
          await client.query(`UPDATE ${table} SET is_paid = true WHERE id = ANY($1)`, [Array.from(ids)]);
        }
      }
      if (paidVisitIds.size > 0) {
        await client.query(`UPDATE visits SET consultation_status = 'paid' WHERE id = ANY($1)`, [Array.from(paidVisitIds)]);
      }
      if (paidReferralIds.size > 0) {
        await client.query(`UPDATE referrals SET consultant_fee_status = 'paid' WHERE id = ANY($1)`, [Array.from(paidReferralIds)]);
      }
      if (paidPharmacyBillIds.size > 0) {
        await client.query(`UPDATE pharmacy_bills SET status = 'paid', payment_id = $2, paid_at = NOW() WHERE id = ANY($1) AND status = 'awaiting_payment'`, [Array.from(paidPharmacyBillIds), paymentId]);
        // Settle every prescription this bill was quantified from (by link) and,
        // for older bills without the per-line link, by patient + drug name.
        await client.query(
          `UPDATE prescriptions pr
              SET is_paid = true,
                  quantity = COALESCE(NULLIF(pr.quantity, 0),
                              (SELECT pbi.quantity FROM pharmacy_bill_items pbi
                                WHERE pbi.prescription_id = pr.id ORDER BY pbi.created_at DESC LIMIT 1))
            WHERE pr.id IN (SELECT prescription_id FROM pharmacy_bill_items WHERE bill_id = ANY($1) AND prescription_id IS NOT NULL)`,
          [Array.from(paidPharmacyBillIds)]
        );
        await client.query(
          `UPDATE prescriptions pr
              SET is_paid = true,
                  quantity = COALESCE(NULLIF(pr.quantity, 0), pbi.quantity)
             FROM pharmacy_bill_items pbi
             JOIN pharmacy_bills pb ON pb.id = pbi.bill_id
            WHERE pb.id = ANY($1)
              AND COALESCE(pr.is_paid, false) = false AND pr.status <> 'cancelled'
              AND lower(trim(pr.drug_name)) = lower(trim(pbi.drug_name))
              AND pr.encounter_id IN (SELECT e.id FROM encounters e WHERE e.patient_id = pb.patient_id)`,
          [Array.from(paidPharmacyBillIds)]
        );
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
        const existing = await client.query(
          `SELECT id FROM visits
           WHERE tenant_id = $1 AND patient_id = $2 AND status = 'waiting'
             AND consultation_status IN ('pending', 'paid', 'insurance_authorized')
           ORDER BY created_at DESC LIMIT 1`,
          [tenantId, effectivePatientId]
        );
        if (existing.rows.length > 0) {
          await client.query(
            `UPDATE visits SET consultation_status = 'paid',
               consultation_fee = GREATEST(consultation_fee, $1)
             WHERE id = $2`,
            [fee, existing.rows[0].id]
          );
        } else {
          await client.query(
            `INSERT INTO visits (id, tenant_id, patient_id, assigned_doctor_id, department_id, visit_type, consultation_fee, consultation_status, status)
             VALUES ($1, $2, $3, NULL, NULL, $4, $5, 'paid', 'waiting')`,
            [uuidv4(), tenantId, effectivePatientId, visitType, fee]
          );
        }
      }

      await client.query('COMMIT');
    } catch (txErr) {
      try { await client.query('ROLLBACK'); } catch {}
      throw txErr;
    } finally {
      client.release();
    }

    // Pending lists are now stale — drop the short-TTL cache so the payer sees
    // the updated state immediately.
    invalidatePendingCaches();

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
    const { patient_id, date_from, date_to, search, method, type, page, limit } = req.query;

    const from = `FROM payments p
                  LEFT JOIN staff_users s ON s.id = p.created_by
                  LEFT JOIN patients pat ON pat.id = p.patient_id`;
    let whereSql = `p.tenant_id = $1`;
    const params: any[] = [tenantId];
    let idx = 2;

    if (patient_id) { whereSql += ` AND p.patient_id = $${idx}`; params.push(patient_id); idx++; }
    if (date_from) { whereSql += ` AND p.created_at >= $${idx}::date`; params.push(date_from); idx++; }
    if (date_to) { whereSql += ` AND p.created_at < ($${idx}::date + INTERVAL '1 day')`; params.push(date_to); idx++; }
    if (search) {
      whereSql += ` AND (p.receipt_number ILIKE $${idx} OR pat.full_name ILIKE $${idx} OR p.walkin_name ILIKE $${idx} OR s.name ILIKE $${idx})`;
      params.push(`%${search}%`); idx++;
    }
    if (method) { whereSql += ` AND p.payment_method = $${idx}`; params.push(method); idx++; }
    if (type === 'deposit') { whereSql += ` AND EXISTS (SELECT 1 FROM patient_deposits d WHERE d.payment_id = p.id)`; }
    else if (type === 'service') { whereSql += ` AND NOT EXISTS (SELECT 1 FROM patient_deposits d WHERE d.payment_id = p.id)`; }

    const select = `SELECT p.*, s.name as staff_name, pat.full_name as patient_name, pat.hospital_number,
                  (SELECT COUNT(*) FROM payment_items pi WHERE pi.payment_id = p.id)::int as item_count,
                  (EXISTS (SELECT 1 FROM patient_deposits d WHERE d.payment_id = p.id)) as is_deposit`;

    // Opt-in pagination; without `page` keeps the plain-array behaviour for
    // existing callers (Finance/Paypoint history widgets).
    if (page) {
      const pageNum = parseInt(page as string) || 1;
      const limitNum = parseInt(limit as string) || 25;
      const offset = (pageNum - 1) * limitNum;
      const countRes = await pool.query(
        `SELECT COUNT(*)::int AS total,
                COALESCE(SUM(p.total_amount), 0) AS total_amount,
                COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM patient_deposits d WHERE d.payment_id = p.id))::int AS deposit_count
           ${from} WHERE ${whereSql}`,
        params
      );
      const agg = countRes.rows[0] || {};
      const paged = await pool.query(`${select} ${from} WHERE ${whereSql} ORDER BY p.created_at DESC LIMIT $${idx++} OFFSET $${idx++}`, [...params, limitNum, offset]);
      res.json({
        rows: paged.rows,
        total: agg.total || 0,
        total_amount: Number(agg.total_amount) || 0,
        deposit_count: agg.deposit_count || 0,
        service_count: (agg.total || 0) - (agg.deposit_count || 0),
        page: pageNum,
        limit: limitNum,
      });
      return;
    }

    const result = await pool.query(`${select} ${from} WHERE ${whereSql} ORDER BY p.created_at DESC LIMIT 100`, params);
    res.json(result.rows);
  } catch (err: any) { res.status(500).json({ error: true, message: err.message }); }
});

// --- Pending summary - all patients with unpaid items ---
router.get('/api/payments/pending-summary', async (req: Request, res: Response) => {
  try {
    const tenantId = readClinicProfile().GLOBAL_SAAS_TENANT_ID;
    try { await accrueBedCharges(tenantId); } catch {}
    // Settle any held deposit credit first; invalidate the cache if it moved money.
    try { const applied = await applyAllHeldDeposits(pool, tenantId); if (applied > 0) pendingSummaryCache.clear(); } catch {}
    const cached = pendingSummaryCache.get(tenantId);
    if (cached) { res.json(cached); return; }
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
          AND COALESCE(pr.quantity, 0) > 0
        GROUP BY enc.patient_id, p.full_name, p.hospital_number, p.phone
      ),
      pharm_bill AS (
        SELECT b.patient_id, p.full_name, p.hospital_number, p.phone, MAX(b.created_at) as created_at,
               'pharmacy_bill' as service_type,
               COUNT(*)::int || ' Pharmacy Bill(s)' as description, COUNT(*) as item_count
        FROM pharmacy_bills b JOIN patients p ON p.id = b.patient_id
        WHERE b.status = 'awaiting_payment' AND b.tenant_id = $1
        GROUP BY b.patient_id, p.full_name, p.hospital_number, p.phone
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
               'Specialist Fee' as description, COUNT(*)::int as item_count
        FROM referrals r JOIN patients p ON p.id = r.patient_id
        WHERE r.consultant_fee_status = 'pending' AND COALESCE(r.consultant_fee, 0) > 0 AND r.tenant_id = $1
        GROUP BY r.patient_id, p.full_name, p.hospital_number, p.phone
      ),
      all_pending AS (
        SELECT * FROM folder UNION ALL SELECT * FROM rx UNION ALL
        SELECT * FROM pharm_bill UNION ALL
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
    pendingSummaryCache.set(tenantId, result.rows);
    res.json(result.rows);
  } catch (err: any) { res.status(500).json({ error: true, message: err.message }); }
});

// --- All pending items across all patients (comprehensive, with prices) ---
router.get('/api/payments/all-pending-items', async (req: Request, res: Response) => {
  try {
    const tenantId = readClinicProfile().GLOBAL_SAAS_TENANT_ID;
    try { await accrueBedCharges(tenantId); } catch {}
    // Settle any held deposit credit first; invalidate the cache if it moved money.
    try { const applied = await applyAllHeldDeposits(pool, tenantId); if (applied > 0) allPendingItemsCache.clear(); } catch {}
    const cached = allPendingItemsCache.get(tenantId);
    if (cached) { res.json(cached); return; }
    // needs_price is derived once in the outer projection instead of running a
    // duplicate price subquery for every row of every branch.
    var result = await pool.query(`
      WITH       folder AS (
        SELECT id as patient_id, full_name, hospital_number, phone,
               'folder_activation'::text as service_type, NULL::uuid as service_id,
               NULL::uuid as line_id,
               'Folder Activation / Registration Fee'::text as description,
               1::int as quantity,
               COALESCE((SELECT i.price FROM inventory_items i
                         WHERE i.tenant_id = $1 AND i.is_active = true
                           AND (i.service_key = 'FOLDER_ACTIVATION'
                                OR (i.category = 'general' AND i.drug_name ILIKE '%folder activation%'))
                         ORDER BY (i.service_key = 'FOLDER_ACTIVATION') DESC,
                                  (i.drug_name ILIKE '%folder activation fee%') DESC, i.created_at DESC LIMIT 1), 0)::numeric as unit_price,
               created_at,
               NULL::text as bill_number, NULL::jsonb as bill_items
        FROM patients WHERE folder_activated = false AND tenant_id = $1
      ),
      rx_items AS (
        SELECT enc.patient_id, p.full_name, p.hospital_number, p.phone, 'prescription' as service_type,
               pr.id as service_id, NULL::uuid as line_id,
               (pr.drug_name || COALESCE(' ' || pr.dosage, '') || ' × ' || COALESCE(pr.quantity::text, '1')) as description,
               pr.quantity, (SELECT COALESCE(MAX(ii.price), 0) FROM inventory_items ii WHERE ii.drug_name ILIKE pr.drug_name AND ii.category = 'pharmacy' AND ii.is_active = true) as unit_price,
               pr.created_at,
               NULL::text as bill_number, NULL::jsonb as bill_items
        FROM prescriptions pr JOIN encounters enc ON enc.id = pr.encounter_id
        JOIN patients p ON p.id = enc.patient_id
        WHERE COALESCE(pr.is_paid, false) = false AND pr.status != 'cancelled' AND enc.tenant_id = $1
          AND COALESCE(pr.quantity, 0) > 0
      ),
      pharm_bill_items AS (
        SELECT b.patient_id, p.full_name, p.hospital_number, p.phone, 'pharmacy_bill' as service_type,
               b.id as service_id, NULL::uuid as line_id,
               ('Pharmacy Bill ' || COALESCE(b.bill_number, '')) as description,
               1 as quantity, b.total::numeric as unit_price,
               b.created_at,
               b.bill_number::text as bill_number,
               (SELECT jsonb_agg(jsonb_build_object(
                          'line_id', pbi.id, 'drug_name', pbi.drug_name, 'unit', pbi.unit,
                          'quantity', pbi.quantity, 'unit_price', pbi.unit_price, 'total_price', pbi.total_price)
                        ORDER BY pbi.created_at)
                  FROM pharmacy_bill_items pbi WHERE pbi.bill_id = b.id) as bill_items
        FROM pharmacy_bills b JOIN patients p ON p.id = b.patient_id
        WHERE b.status = 'awaiting_payment' AND b.tenant_id = $1
      ),
      lab_items AS (
        SELECT enc.patient_id, p.full_name, p.hospital_number, p.phone, 'lab' as service_type,
               l.id as service_id, NULL::uuid as line_id, l.test_name as description,
               1 as quantity, (SELECT COALESCE(MAX(ii.price), 0) FROM inventory_items ii WHERE ii.drug_name ILIKE l.test_name AND ii.category = 'lab' AND ii.is_active = true) as unit_price,
               l.created_at,
               NULL::text as bill_number, NULL::jsonb as bill_items
        FROM lab_orders l JOIN encounters enc ON enc.id = l.encounter_id
        JOIN patients p ON p.id = enc.patient_id
        WHERE COALESCE(l.is_paid, false) = false AND l.status NOT IN ('cancelled', 'completed') AND enc.tenant_id = $1
      ),
      rad_items AS (
        SELECT enc.patient_id, p.full_name, p.hospital_number, p.phone, 'radiology' as service_type,
               r.id as service_id, NULL::uuid as line_id, r.imaging_type as description,
               1 as quantity, (SELECT COALESCE(MAX(ii.price), 0) FROM inventory_items ii WHERE ii.drug_name ILIKE r.imaging_type AND ii.category = 'radiology' AND ii.is_active = true) as unit_price,
               r.created_at,
               NULL::text as bill_number, NULL::jsonb as bill_items
        FROM radiology_orders r JOIN encounters enc ON enc.id = r.encounter_id
        JOIN patients p ON p.id = enc.patient_id
        WHERE COALESCE(r.is_paid, false) = false AND r.status NOT IN ('cancelled', 'completed') AND enc.tenant_id = $1
      ),
      adm_items AS (
        SELECT a.patient_id, p.full_name, p.hospital_number, p.phone, 'admission' as service_type,
               a.id as service_id, NULL::uuid as line_id,
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
               a.admitted_at as created_at,
               NULL::text as bill_number, NULL::jsonb as bill_items
        FROM admissions a JOIN patients p ON p.id = a.patient_id
        WHERE COALESCE(a.is_paid, false) = false AND a.tenant_id = $1
      ),
      bed_items AS (
        SELECT dc.patient_id, p.full_name, p.hospital_number, p.phone, 'bed_day' as service_type,
               dc.id as service_id, NULL::uuid as line_id,
               ('Bed Fee (Day ' || dc.day_index || ')' || CASE WHEN w.name IS NOT NULL THEN ' — ' || w.name ELSE '' END) as description,
               1 as quantity, dc.amount::numeric as unit_price,
               dc.period_start as created_at,
               NULL::text as bill_number, NULL::jsonb as bill_items
        FROM admission_daily_charges dc
        JOIN patients p ON p.id = dc.patient_id
        LEFT JOIN admissions a ON a.id = dc.admission_id
        LEFT JOIN wards w ON w.id = COALESCE(dc.ward_id, a.ward_id)
        WHERE dc.is_paid = false AND p.tenant_id = $1
      ),
      consult_items AS (
        SELECT v.patient_id, p.full_name, p.hospital_number, p.phone, 'consultation' as service_type,
               v.id as service_id, NULL::uuid as line_id,
               ('Consultation (' || CASE v.visit_type WHEN 'follow_up' THEN 'follow-up' WHEN 'review' THEN 'review' ELSE 'new' END || ' visit)' ||
                CASE WHEN v.remarks IS NOT NULL THEN ' — ' || v.remarks ELSE '' END) as description,
                1 as quantity, COALESCE(v.consultation_fee, 0)::numeric as unit_price,
                v.created_at,
                NULL::text as bill_number, NULL::jsonb as bill_items
        FROM visits v JOIN patients p ON p.id = v.patient_id
        WHERE v.consultation_status = 'pending' AND COALESCE(v.consultation_fee, 0) > 0 AND v.tenant_id = $1
      ),
      ref_fee_items AS (
        SELECT r.patient_id, p.full_name, p.hospital_number, p.phone, 'referral_fee' as service_type,
               r.id as service_id, NULL::uuid as line_id,
               ('Specialist Fee — ' || r.referral_number) as description,
                1 as quantity, COALESCE(r.consultant_fee, 0)::numeric as unit_price,
                r.created_at,
                NULL::text as bill_number, NULL::jsonb as bill_items
        FROM referrals r JOIN patients p ON p.id = r.patient_id
        WHERE r.consultant_fee_status = 'pending' AND COALESCE(r.consultant_fee, 0) > 0 AND r.tenant_id = $1
      )
      SELECT sub.*,
        (sub.unit_price <= 0) as needs_price,
        (SELECT prv.name FROM patient_insurance_policies pp
           JOIN insurance_providers prv ON prv.id = pp.provider_id
         WHERE pp.patient_id = sub.patient_id AND pp.is_active = true AND pp.coverage_type = 'primary'
           AND (pp.end_date IS NULL OR pp.end_date >= CURRENT_DATE) AND prv.is_active = true
         ORDER BY pp.created_at LIMIT 1) as insurance_provider
      FROM (
        SELECT * FROM folder UNION ALL SELECT * FROM rx_items UNION ALL
        SELECT * FROM pharm_bill_items UNION ALL
        SELECT * FROM lab_items UNION ALL SELECT * FROM rad_items UNION ALL SELECT * FROM adm_items UNION ALL
        SELECT * FROM bed_items UNION ALL
        SELECT * FROM consult_items UNION ALL SELECT * FROM ref_fee_items
      ) sub ORDER BY created_at DESC NULLS LAST
    `, [tenantId]);
    allPendingItemsCache.set(tenantId, result.rows);
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

    // If this receipt is a deposit, expose the deposit record and the items it
    // settled so the receipt can be printed as a DEPOSIT RECEIPT.
    let deposit: any = null;
    let coveredItems: any[] = [];
    try {
      const dep = await pool.query('SELECT * FROM patient_deposits WHERE payment_id = $1 LIMIT 1', [req.params.id]);
      if (dep.rows.length > 0) {
        deposit = dep.rows[0];
        const cov = await pool.query(
          'SELECT service_type, service_id, description, amount FROM deposit_applications WHERE deposit_id = $1 ORDER BY created_at ASC',
          [deposit.id]
        );
        coveredItems = cov.rows.map((r: any) => ({ ...r, amount: Number(r.amount) || 0 }));
      }
    } catch {}

    res.json({ ...payment.rows[0], items: items.rows, is_deposit: !!deposit, deposit, covered_items: coveredItems });
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
               WHERE pp.status = 'completed' AND pp.tenant_id = $2 AND pp.created_at::date = $1::date) as today_cost,
              (SELECT COALESCE(SUM(ex.amount), 0) FROM expenses ex
               WHERE ex.tenant_id = $2 AND ex.status = 'approved') as total_expenses,
              (SELECT COALESCE(SUM(ex.amount), 0) FROM expenses ex
               WHERE ex.tenant_id = $2 AND ex.status = 'approved' AND ex.expense_date = $1::date) as today_expenses
       FROM payments WHERE status = 'completed' AND tenant_id = $2`,
      [today, tenantId]
    );
    const s = stats.rows[0];
    const totalRevenue = parseFloat(s.total_revenue || 0);
    const todayRevenue = parseFloat(s.today_revenue || 0);
    const totalCost = parseFloat(s.total_cost || 0);
    const todayCost = parseFloat(s.today_cost || 0);
    const totalExpenses = parseFloat(s.total_expenses || 0);
    const todayExpenses = parseFloat(s.today_expenses || 0);
    const totalGrossProfit = totalRevenue - totalCost;
    const todayGrossProfit = todayRevenue - todayCost;
    res.json({
      ...s,
      total_cost: totalCost, today_cost: todayCost,
      total_expenses: totalExpenses, today_expenses: todayExpenses,
      total_gross_profit: totalGrossProfit, today_gross_profit: todayGrossProfit,
      // Net profit applies approved expenses.
      total_profit: totalGrossProfit - totalExpenses,
      today_profit: todayGrossProfit - todayExpenses,
    });
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
