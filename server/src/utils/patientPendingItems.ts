import pool from '../db/pool';
import { resolveOneTimeAdmissionFee } from './admissionBilling';

// Shared, side-effect-free builder for a patient's unpaid ("pending") items.
//
// Paypoint's `/api/payments/pending/:patientId` uses this to render the bill,
// and the admission financial-clearance gate uses the same list to decide
// whether a patient still owes money before discharge. Keeping one builder
// guarantees the two can never disagree.
//
// NOTE: this function only READS. Insurance auto-billing stays in the Paypoint
// endpoint; the clearance gate treats an active insurance case as an approved
// payer instead of mutating claims.

export interface PendingItem {
  service_type: string;
  service_id: string | null;
  /** Insurance coverage lookup override (e.g. a ward's BED_DAY item for bed days). */
  coverage_type?: string;
  coverage_item_id?: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  cost_price?: number;
  needsPrice?: boolean;
}

export function cleanItemDescription(description: string | undefined): string {
  return String(description || '')
    .replace(/^(Prescription|Lab|Radiology|Service|Bed Fee|Admission Fee|Folder Activation)\s*[:—–-]?\s*/i, '')
    .split('×')[0]
    .split(' x ')[0]
    .trim();
}

// Batch inventory price lookup keyed by lowercase name (mirrors Paypoint).
export async function loadInventoryPriceMap(
  tenantId: string,
  category: string,
  names: Array<string | null | undefined>
): Promise<Map<string, { price: any; cost: any }>> {
  const map = new Map<string, { price: any; cost: any }>();
  const unique = Array.from(
    new Set(names.map((n) => String(n || '').trim().toLowerCase()).filter(Boolean))
  );
  if (unique.length === 0) return map;
  try {
    const result = await pool.query(
      `SELECT DISTINCT ON (lower(drug_name))
              lower(drug_name) AS lname, price, cost_price
       FROM inventory_items
       WHERE tenant_id = $1 AND category = $2 AND is_active = true
         AND lower(drug_name) = ANY($3::text[])
       ORDER BY lower(drug_name), created_at DESC`,
      [tenantId, category, unique]
    );
    for (const row of result.rows) {
      map.set(row.lname, { price: row.price, cost: row.cost_price });
    }
  } catch {}
  return map;
}

export async function buildBasePendingItems(
  patientId: string,
  tenantId: string
): Promise<{ items: PendingItem[]; folderActivated: boolean }> {
  const [folderRes, prescriptionsRes, labRes, radiologyRes, admissionsRes, visitsRes, referralsRes, pharmacyBillsRes] = await Promise.all([
    pool.query('SELECT folder_activated FROM patients WHERE id = $1', [patientId]),
    // Only QUANTIFIED prescriptions bill at Paypoint. An un-quantified order is
    // priced by the pharmacist first and then appears as a pharmacy bill.
    pool.query(`SELECT pr.id, pr.drug_name, pr.dosage, pr.quantity, pr.created_at
      FROM prescriptions pr JOIN encounters enc ON enc.id = pr.encounter_id
      WHERE enc.patient_id = $1 AND COALESCE(pr.is_paid, false) = false AND pr.status != $2
        AND COALESCE(pr.quantity, 0) > 0
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
    // Pharmacy bills the pharmacist has quantified and sent to Paypoint.
    pool.query(`SELECT b.id, b.bill_number, b.total, b.created_at
      FROM pharmacy_bills b
      WHERE b.tenant_id = $1 AND b.patient_id = $2 AND b.status = 'awaiting_payment'
      ORDER BY b.created_at DESC`, [tenantId, patientId]),
  ]);

  const patient = folderRes.rows[0];
  const items: PendingItem[] = [];

  if (!patient?.folder_activated) {
    const folderFee = await pool.query(
      `SELECT price FROM inventory_items
       WHERE tenant_id = $1 AND is_active = true
         AND (service_key = 'FOLDER_ACTIVATION'
              OR (category = 'general' AND drug_name ILIKE '%folder activation%'))
       ORDER BY (service_key = 'FOLDER_ACTIVATION') DESC,
                (drug_name ILIKE '%folder activation fee%') DESC, created_at DESC LIMIT 1`,
      [tenantId]
    ).catch(() => ({ rows: [] as any[] }));
    const folderFeePrice = folderFee.rows.length > 0 ? parseFloat(folderFee.rows[0].price) || 0 : 0;
    items.push({ service_type: 'folder_activation', service_id: null, description: 'Folder Activation / Registration Fee', quantity: 1, unit_price: folderFeePrice, needsPrice: !(folderFeePrice > 0) });
  }

  const [rxPrices, labPrices, radPrices] = await Promise.all([
    loadInventoryPriceMap(tenantId, 'pharmacy', (prescriptionsRes.rows || []).map((r: any) => r.drug_name)),
    loadInventoryPriceMap(tenantId, 'lab', (labRes.rows || []).map((r: any) => r.test_name)),
    loadInventoryPriceMap(tenantId, 'radiology', (radiologyRes.rows || []).map((r: any) => r.imaging_type)),
  ]);

  for (const r of (prescriptionsRes.rows || [])) {
    const hit = rxPrices.get(String(r.drug_name || '').trim().toLowerCase());
    const rxPrice = hit ? parseFloat(hit.price) || 0 : 0;
    const rxCost = hit ? parseFloat(hit.cost) || 0 : 0;
    items.push({ service_type: 'prescription', service_id: r.id, description: `Prescription: ${r.drug_name} ${r.dosage || ''} × ${r.quantity || ''}`, quantity: r.quantity || 1, unit_price: rxPrice, cost_price: rxCost, needsPrice: !rxPrice });
  }

  // Quantified pharmacy bills awaiting payment (one line per bill).
  for (const b of (pharmacyBillsRes.rows || [])) {
    items.push({
      service_type: 'pharmacy_bill',
      service_id: b.id,
      description: `Pharmacy Bill ${b.bill_number}`,
      quantity: 1,
      unit_price: parseFloat(b.total) || 0,
      needsPrice: false,
    });
  }

  for (const r of (labRes.rows || [])) {
    const hit = labPrices.get(String(r.test_name || '').trim().toLowerCase());
    const labPrice = hit ? parseFloat(hit.price) || 0 : 0;
    const labCost = hit ? parseFloat(hit.cost) || 0 : 0;
    items.push({ service_type: 'lab', service_id: r.id, description: `Lab: ${r.test_name}`, quantity: 1, unit_price: labPrice, cost_price: labCost, needsPrice: !labPrice });
  }

  for (const r of (radiologyRes.rows || [])) {
    const hit = radPrices.get(String(r.imaging_type || '').trim().toLowerCase());
    const radPrice = hit ? parseFloat(hit.price) || 0 : 0;
    const radCost = hit ? parseFloat(hit.cost) || 0 : 0;
    items.push({ service_type: 'radiology', service_id: r.id, description: `Radiology: ${r.imaging_type}`, quantity: 1, unit_price: radPrice, cost_price: radCost, needsPrice: !radPrice });
  }

  const admissionFee = await resolveOneTimeAdmissionFee(tenantId).catch(() => null);
  const admissionFeePrice = admissionFee ? admissionFee.price : 0;
  for (const r of (admissionsRes.rows || [])) {
    items.push({ service_type: 'admission', service_id: r.id, description: 'Admission Fee', quantity: 1, unit_price: admissionFeePrice, needsPrice: !(admissionFeePrice > 0) });
  }

  const bedDaysRes = await pool.query(
    `SELECT dc.id, dc.day_index, dc.amount, dc.period_start, w.name as ward_name,
            (SELECT i.id FROM inventory_items i
              WHERE i.ward_id = COALESCE(dc.ward_id, a.ward_id) AND i.service_key = 'BED_DAY' AND i.is_active = true
              ORDER BY i.created_at DESC LIMIT 1) AS bed_day_item_id
     FROM admission_daily_charges dc
     JOIN admissions a ON a.id = dc.admission_id
     LEFT JOIN wards w ON w.id = COALESCE(dc.ward_id, a.ward_id)
     WHERE dc.patient_id = $1 AND dc.is_paid = false
     ORDER BY dc.day_index`,
    [patientId]
  );
  for (const b of (bedDaysRes.rows || [])) {
    const bedPrice = parseFloat(b.amount) || 0;
    // coverage_type/coverage_item_id let insurance price the ward's own nightly
    // rate rule (service_type 'admission' on the ward's BED_DAY item).
    items.push({ service_type: 'bed_day', service_id: b.id, coverage_type: 'admission', coverage_item_id: b.bed_day_item_id || null, description: `Bed Fee: ${b.ward_name || 'Ward'} (Day ${b.day_index})`, quantity: 1, unit_price: bedPrice, needsPrice: !(bedPrice > 0) });
  }

  (visitsRes.rows || []).forEach((r: any) => {
    const typeLabel = r.visit_type === 'follow_up' ? 'Follow-up' : r.visit_type === 'review' ? 'Review' : 'New';
    items.push({ service_type: 'consultation', service_id: r.id, description: `Consultation (${typeLabel} visit)`, quantity: 1, unit_price: parseFloat(r.consultation_fee) || 0, needsPrice: !(parseFloat(r.consultation_fee) > 0) });
  });

  (referralsRes.rows || []).forEach((r: any) => {
    items.push({ service_type: 'referral_fee', service_id: r.id, description: `Specialist Fee — ${r.referral_number}`, quantity: 1, unit_price: parseFloat(r.consultant_fee) || 0, needsPrice: !(parseFloat(r.consultant_fee) > 0) });
  });

  return { items, folderActivated: !!patient?.folder_activated };
}
