import { Pool, PoolClient } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import pool from '../db/pool';
import { buildBasePendingItems, loadInventoryPriceMap } from './patientPendingItems';
import { getPatientPrimaryInsurance } from './coverageLookup';
import { resolveOneTimeAdmissionFee } from './admissionBilling';
import { generateNumber } from './numbering';
import { readClinicProfile } from '../config/reader';

type Db = Pool | PoolClient;

export interface BillLine {
  service_type: string;
  service_id: string | null;
  description: string;
  amount: number;
}

export interface PatientBalance {
  items: BillLine[];
  charges_total: number;
  deposits_held: number;
  outstanding: number;
  /** Alias of charges_total, kept for backward compatibility. */
  total: number;
  item_count: number;
  insured: boolean;
  insurance_case_id: string | null;
  insurance_provider: string | null;
}

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

// Unapplied credit still held on account (deposits not yet consumed by bills).
export async function getHeldDeposits(db: Db, tenantId: string, patientId: string): Promise<number> {
  const res = await db.query(
    `SELECT COALESCE(SUM(amount - COALESCE(applied_amount, 0)), 0) AS total
       FROM patient_deposits
      WHERE tenant_id = $1 AND patient_id = $2 AND status = 'held'`,
    [tenantId, patientId]
  ).catch(() => ({ rows: [{ total: 0 }] } as any));
  return round2(res.rows[0]?.total || 0);
}

// Marks a single pending source order as settled.
async function markPendingItemPaid(db: Db, patientId: string, item: { service_type: string; service_id: string | null }): Promise<void> {
  const sid = item.service_id;
  try {
    switch (item.service_type) {
      case 'prescription': await db.query('UPDATE prescriptions SET is_paid = true WHERE id = $1', [sid]); break;
      case 'lab': await db.query('UPDATE lab_orders SET is_paid = true WHERE id = $1', [sid]); break;
      case 'radiology': await db.query('UPDATE radiology_orders SET is_paid = true WHERE id = $1', [sid]); break;
      case 'admission': await db.query('UPDATE admissions SET is_paid = true WHERE id = $1', [sid]); break;
      case 'bed_day': await db.query('UPDATE admission_daily_charges SET is_paid = true WHERE id = $1', [sid]); break;
      case 'consultation': await db.query("UPDATE visits SET consultation_status = 'paid' WHERE id = $1", [sid]); break;
      case 'referral_fee': await db.query("UPDATE referrals SET consultant_fee_status = 'paid' WHERE id = $1", [sid]); break;
      case 'folder_activation': await db.query('UPDATE patients SET folder_activated = true WHERE id = $1', [patientId]); break;
    }
  } catch {}
}

// Applies the patient's unapplied deposit credit to outstanding items, oldest
// items first (whole items only). Any remainder stays held as credit. This is
// what makes deposits show up everywhere Paypoint reads `is_paid`.
export async function applyHeldDepositsToItems(db: Db, tenantId: string, patientId: string): Promise<number> {
  try {
    const deps = await db.query(
      `SELECT id, amount, COALESCE(applied_amount, 0) AS applied_amount
         FROM patient_deposits
        WHERE tenant_id = $1 AND patient_id = $2 AND status = 'held'
        ORDER BY created_at ASC`,
      [tenantId, patientId]
    );
    if (deps.rows.length === 0) return 0;
    // Running credit per deposit, oldest first, so each item can be attributed
    // to the exact deposit(s) that funded it (used on the deposit receipt).
    const cursor = deps.rows.map((d: any) => ({
      id: d.id,
      amount: Number(d.amount) || 0,
      remaining: round2((Number(d.amount) || 0) - (Number(d.applied_amount) || 0)),
    }));
    if (cursor.reduce((s: number, c: any) => s + c.remaining, 0) <= 0) return 0;

    const { items } = await buildBasePendingItems(patientId, tenantId);
    let appliedNow = 0;
    for (const it of items) {
      const amt = round2((Number(it.unit_price) || 0) * (Number(it.quantity) || 1));
      if (amt <= 0) {
        // Zero-value item (e.g. an order without a configured price): settle it
        // while there is credit on account rather than leaving it in Paypoint.
        await markPendingItemPaid(db, patientId, it);
        continue;
      }
      const available = cursor.reduce((s: number, c: any) => s + c.remaining, 0);
      if (amt > available + 0.001) continue; // can't fully cover this item

      let needed = amt;
      const funding: { id: string; amount: number }[] = [];
      for (const c of cursor) {
        if (needed <= 0.001) break;
        if (c.remaining <= 0) continue;
        const use = Math.min(c.remaining, needed);
        funding.push({ id: c.id, amount: round2(use) });
        c.remaining = round2(c.remaining - use);
        needed = round2(needed - use);
      }

      await markPendingItemPaid(db, patientId, it);
      for (const f of funding) {
        await db.query(
          `INSERT INTO deposit_applications (tenant_id, patient_id, deposit_id, service_type, service_id, description, amount)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [tenantId, patientId, f.id, it.service_type, it.service_id, it.description, f.amount]
        ).catch(() => {});
      }
      appliedNow = round2(appliedNow + amt);
    }

    // Persist each deposit's applied amount / status.
    for (const c of cursor) {
      const applied = round2(c.amount - c.remaining);
      const fullyApplied = c.remaining <= 0.001;
      await db.query(
        `UPDATE patient_deposits
            SET applied_amount = $1, status = $2,
                applied_at = CASE WHEN $3::boolean THEN NOW() ELSE applied_at END,
                updated_at = NOW()
          WHERE id = $4`,
        [applied, fullyApplied ? 'applied' : 'held', fullyApplied, c.id]
      );
    }
    return appliedNow;
  } catch { return 0; }
}

// Ensures every deposit has a matching receipted payment, so Finance sees the
// money and receipts exist. Idempotent: only touches deposits with no payment.
export async function backfillDepositPayments(tenantId?: string): Promise<number> {
  const tid = tenantId || readClinicProfile().GLOBAL_SAAS_TENANT_ID;
  let created = 0;
  try {
    const deps = await pool.query(
      `SELECT id, patient_id, amount, method, notes, created_by
         FROM patient_deposits WHERE tenant_id = $1 AND payment_id IS NULL`,
      [tid]
    );
    for (const d of deps.rows) {
      try {
        const paymentId = uuidv4();
        let receiptNumber: string | null = null;
        try { receiptNumber = await generateNumber(tid, 'receipt', { prefix: 'RCP' }); } catch {}
        await pool.query(
          `INSERT INTO payments (id, tenant_id, receipt_number, patient_id, total_amount, payment_method, notes, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [paymentId, tid, receiptNumber, d.patient_id, Number(d.amount) || 0, d.method || 'cash', d.notes || 'Admission deposit (on account)', d.created_by || null]
        );
        await pool.query(
          `INSERT INTO payment_items (id, tenant_id, payment_id, service_type, service_id, description, item_name, quantity, unit_price, total_price, cost_price, is_converted)
           VALUES ($1, $2, $3, 'deposit', NULL, 'Deposit on account', 'Deposit on account', 1, $4, $4, 0, true)`,
          [uuidv4(), tid, paymentId, Number(d.amount) || 0]
        );
        await pool.query(`UPDATE patient_deposits SET payment_id = $1, updated_at = NOW() WHERE id = $2`, [paymentId, d.id]);
        created++;
      } catch {}
    }
  } catch {}
  return created;
}

// Reconstructs itemised attribution for legacy deposits that were applied
// before attribution existed (applied_amount > 0 but no deposit_applications
// rows for the deposit). Allocates the admission's gross items to the patient's
// deposits oldest-first, up to each deposit's applied amount. Idempotent.
export async function backfillDepositApplications(tenantId?: string): Promise<number> {
  const tid = tenantId || readClinicProfile().GLOBAL_SAAS_TENANT_ID;
  let created = 0;
  try {
    const deps = await pool.query(
      `SELECT d.id, d.patient_id, d.admission_id, COALESCE(d.applied_amount, 0) AS applied_amount
         FROM patient_deposits d
        WHERE d.tenant_id = $1 AND COALESCE(d.applied_amount, 0) > 0
          AND NOT EXISTS (SELECT 1 FROM deposit_applications a WHERE a.deposit_id = d.id)
        ORDER BY d.created_at ASC`,
      [tid]
    );
    if (deps.rows.length === 0) return 0;

    const byPatient = new Map<string, any[]>();
    for (const d of deps.rows) {
      if (!byPatient.has(d.patient_id)) byPatient.set(d.patient_id, []);
      byPatient.get(d.patient_id)!.push(d);
    }

    for (const [patientId, deposits] of byPatient) {
      const admissionId = deposits.find((d) => d.admission_id)?.admission_id;
      if (!admissionId) continue;
      const adm = await pool.query(
        `SELECT a.*, w.name AS ward_name FROM admissions a LEFT JOIN wards w ON w.id = a.ward_id WHERE a.id = $1`,
        [admissionId]
      );
      if (adm.rows.length === 0) continue;
      const items = await getAdmissionGrossItems(pool, adm.rows[0], tid);
      const cursor = deposits.map((d) => ({ id: d.id, remaining: round2(Number(d.applied_amount) || 0) }));
      if (cursor.reduce((s: number, c: any) => s + c.remaining, 0) <= 0) continue;

      // Replace any unattributed legacy rows for this patient.
      await pool.query(`DELETE FROM deposit_applications WHERE patient_id = $1 AND deposit_id IS NULL`, [patientId]).catch(() => {});

      for (const it of items) {
        const amt = round2(Number(it.amount) || 0);
        if (amt <= 0) continue;
        const available = cursor.reduce((s: number, c: any) => s + c.remaining, 0);
        if (amt > available + 0.001) continue; // next item not coverable by remaining credit
        let needed = amt;
        const funding: { id: string; amount: number }[] = [];
        for (const c of cursor) {
          if (needed <= 0.001) break;
          if (c.remaining <= 0) continue;
          const use = Math.min(c.remaining, needed);
          funding.push({ id: c.id, amount: round2(use) });
          c.remaining = round2(c.remaining - use);
          needed = round2(needed - use);
        }
        for (const f of funding) {
          await pool.query(
            `INSERT INTO deposit_applications (tenant_id, patient_id, deposit_id, service_type, service_id, description, amount)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [tid, patientId, f.id, it.service_type, it.service_id, it.description, f.amount]
          ).catch(() => {});
          created++;
        }
        if (cursor.reduce((s: number, c: any) => s + c.remaining, 0) <= 0.001) break;
      }
    }
  } catch {}
  return created;
}

export async function applyAllHeldDeposits(db: Db, tenantId: string): Promise<number> {
  let total = 0;
  try {
    const res = await db.query(
      `SELECT DISTINCT patient_id FROM patient_deposits
        WHERE tenant_id = $1 AND status = 'held'
          AND COALESCE(amount, 0) > COALESCE(applied_amount, 0)`,
      [tenantId]
    );
    for (const row of res.rows) {
      total += await applyHeldDepositsToItems(db, tenantId, row.patient_id);
    }
  } catch {}
  return round2(total);
}

// Everything the patient still owes at Paypoint, net of any deposits held on
// account. Read-only: safe to call during a discharge check.
export async function getPatientBalance(
  patientId: string,
  tenantId: string,
  db: Db = pool
): Promise<PatientBalance> {
  // Reconcile any held deposit credit against the outstanding items first, so
  // the balance and the Paypoint lists always agree.
  await applyHeldDepositsToItems(db, tenantId, patientId);
  const { items } = await buildBasePendingItems(patientId, tenantId);
  const lines: BillLine[] = items.map((i) => ({
    service_type: i.service_type,
    service_id: i.service_id,
    description: i.description,
    amount: round2((Number(i.unit_price) || 0) * (Number(i.quantity) || 1)),
  }));
  const chargesTotal = round2(lines.reduce((sum, l) => sum + l.amount, 0));
  const depositsHeld = await getHeldDeposits(db, tenantId, patientId);
  const outstanding = round2(Math.max(0, chargesTotal - depositsHeld));

  let insurance: Awaited<ReturnType<typeof getPatientPrimaryInsurance>> = null;
  try { insurance = await getPatientPrimaryInsurance(patientId); } catch {}

  return {
    items: lines,
    charges_total: chargesTotal,
    deposits_held: depositsHeld,
    outstanding,
    total: chargesTotal,
    item_count: lines.length,
    insured: !!insurance?.active,
    insurance_case_id: insurance?.caseId || null,
    insurance_provider: insurance?.providerName || null,
  };
}

// The gross bill for one admission episode: admission fee, ALL bed-days and
// every service ordered during the stay — paid or not. This is what the
// clearance worklist shows as "Charges"; deposits/payments only reduce the
// outstanding balance, never the charges themselves.
export async function getAdmissionGrossItems(db: Db, admission: any, tenantId: string): Promise<BillLine[]> {
  const items: BillLine[] = [];
  const patientId = admission.patient_id;
  const start = admission.admitted_at;
  const end = admission.discharged_at || null;

  const fee = await resolveOneTimeAdmissionFee(tenantId).catch(() => null);
  if (fee && Number(fee.price) > 0) {
    items.push({ service_type: 'admission', service_id: admission.id, description: 'Admission Fee', amount: round2(fee.price) });
  }

  const bed = await db.query(
    `SELECT dc.id, dc.day_index, dc.amount, w.name AS ward_name
       FROM admission_daily_charges dc
       LEFT JOIN admissions a ON a.id = dc.admission_id
       LEFT JOIN wards w ON w.id = COALESCE(dc.ward_id, a.ward_id)
      WHERE dc.admission_id = $1
      ORDER BY dc.day_index`,
    [admission.id]
  ).catch(() => ({ rows: [] as any[] }));
  for (const b of bed.rows) {
    items.push({ service_type: 'bed_day', service_id: b.id, description: `Bed Fee: ${b.ward_name || 'Ward'} (Day ${b.day_index})`, amount: round2(b.amount) });
  }

  // Services ordered during the admission window.
  const labs = await db.query(
    `SELECT l.id, l.test_name FROM lab_orders l JOIN encounters e ON e.id = l.encounter_id
      WHERE e.patient_id = $1 AND l.status <> 'cancelled'
        AND l.created_at >= $2 AND ($3::timestamptz IS NULL OR l.created_at <= $3)`,
    [patientId, start, end]
  ).catch(() => ({ rows: [] as any[] }));
  const labPrices = await loadInventoryPriceMap(tenantId, 'lab', labs.rows.map((r: any) => r.test_name));
  for (const r of labs.rows) {
    const hit = labPrices.get(String(r.test_name || '').trim().toLowerCase());
    items.push({ service_type: 'lab', service_id: r.id, description: `Lab: ${r.test_name}`, amount: hit ? round2(parseFloat(hit.price) || 0) : 0 });
  }

  const rads = await db.query(
    `SELECT r.id, r.imaging_type FROM radiology_orders r JOIN encounters e ON e.id = r.encounter_id
      WHERE e.patient_id = $1 AND r.status <> 'cancelled'
        AND r.created_at >= $2 AND ($3::timestamptz IS NULL OR r.created_at <= $3)`,
    [patientId, start, end]
  ).catch(() => ({ rows: [] as any[] }));
  const radPrices = await loadInventoryPriceMap(tenantId, 'radiology', rads.rows.map((r: any) => r.imaging_type));
  for (const r of rads.rows) {
    const hit = radPrices.get(String(r.imaging_type || '').trim().toLowerCase());
    items.push({ service_type: 'radiology', service_id: r.id, description: `Radiology: ${r.imaging_type}`, amount: hit ? round2(parseFloat(hit.price) || 0) : 0 });
  }

  const rxs = await db.query(
    `SELECT pr.id, pr.drug_name, pr.dosage, pr.quantity FROM prescriptions pr JOIN encounters e ON e.id = pr.encounter_id
      WHERE e.patient_id = $1 AND pr.status <> 'cancelled'
        AND pr.created_at >= $2 AND ($3::timestamptz IS NULL OR pr.created_at <= $3)`,
    [patientId, start, end]
  ).catch(() => ({ rows: [] as any[] }));
  const rxPrices = await loadInventoryPriceMap(tenantId, 'pharmacy', rxs.rows.map((r: any) => r.drug_name));
  for (const r of rxs.rows) {
    const hit = rxPrices.get(String(r.drug_name || '').trim().toLowerCase());
    const unit = hit ? parseFloat(hit.price) || 0 : 0;
    const qty = Number(r.quantity) || 1;
    items.push({ service_type: 'prescription', service_id: r.id, description: `Prescription: ${r.drug_name} ${r.dosage || ''} × ${qty}`, amount: round2(unit * qty) });
  }

  const visits = await db.query(
    `SELECT id, visit_type, consultation_fee FROM visits
      WHERE patient_id = $1 AND COALESCE(consultation_fee, 0) > 0
        AND created_at >= $2 AND ($3::timestamptz IS NULL OR created_at <= $3)`,
    [patientId, start, end]
  ).catch(() => ({ rows: [] as any[] }));
  for (const v of visits.rows) {
    items.push({ service_type: 'consultation', service_id: v.id, description: 'Consultation Fee', amount: round2(v.consultation_fee) });
  }

  const refs = await db.query(
    `SELECT id, referral_number, consultant_fee FROM referrals
      WHERE patient_id = $1 AND COALESCE(consultant_fee, 0) > 0
        AND created_at >= $2 AND ($3::timestamptz IS NULL OR created_at <= $3)`,
    [patientId, start, end]
  ).catch(() => ({ rows: [] as any[] }));
  for (const r of refs.rows) {
    items.push({ service_type: 'referral_fee', service_id: r.id, description: `Specialist Fee — ${r.referral_number}`, amount: round2(r.consultant_fee) });
  }

  return items;
}

export async function getAdmissionBalance(admissionId: string, tenantId: string, db: Db = pool) {
  const adm = await db.query(
    `SELECT a.id, a.patient_id, a.ward_id, w.name AS ward_name, a.admitted_at, a.discharged_at, a.status
       FROM admissions a
       LEFT JOIN wards w ON w.id = a.ward_id
      WHERE a.id = $1 AND a.tenant_id = $2`,
    [admissionId, tenantId]
  );
  if (adm.rows.length === 0) return null;
  const admission = adm.rows[0];

  const items = await getAdmissionGrossItems(db, admission, tenantId);
  const chargesTotal = round2(items.reduce((s, i) => s + (Number(i.amount) || 0), 0));

  const depositsRes = await db.query(
    `SELECT COALESCE(SUM(amount), 0) AS total FROM patient_deposits WHERE tenant_id = $1 AND patient_id = $2`,
    [tenantId, admission.patient_id]
  ).catch(() => ({ rows: [{ total: 0 }] } as any));
  const depositsTotal = round2(depositsRes.rows[0]?.total || 0);

  // Payments offset only the bill items they actually paid (matched by the
  // source order id), so unrelated/pre-admission payments don't reduce the bill.
  const serviceIds = items.map((i) => i.service_id).filter(Boolean) as string[];
  let paymentsTotal = 0;
  if (serviceIds.length > 0) {
    const paymentsRes = await db.query(
      `SELECT COALESCE(SUM(total_price), 0) AS total FROM payment_items WHERE service_id = ANY($1::uuid[])`,
      [serviceIds]
    ).catch(() => ({ rows: [{ total: 0 }] } as any));
    paymentsTotal = round2(paymentsRes.rows[0]?.total || 0);
  }

  // Deposits and payments reduce only the OUTSTANDING, never the charges.
  const outstanding = round2(Math.max(0, chargesTotal - depositsTotal - paymentsTotal));

  let insurance: Awaited<ReturnType<typeof getPatientPrimaryInsurance>> = null;
  try { insurance = await getPatientPrimaryInsurance(admission.patient_id); } catch {}

  return {
    admission,
    items,
    charges_total: chargesTotal,
    deposits_total: depositsTotal,
    deposits_held: depositsTotal,
    payments_total: paymentsTotal,
    outstanding,
    total: chargesTotal,
    item_count: items.length,
    insured: !!insurance?.active,
    insurance_case_id: insurance?.caseId || null,
    insurance_provider: insurance?.providerName || null,
  };
}

// Gate decision: a patient may be discharged when they owe nothing (after
// deposits), or when the payer is approved (active insurance policy).
export function evaluateClearance(balance: PatientBalance): {
  can_discharge: boolean;
  reason: string;
  payer_type: 'self_pay' | 'insurance';
} {
  if (balance.outstanding <= 0) {
    return {
      can_discharge: true,
      reason: balance.charges_total > 0 ? 'Settled by deposits / payments' : 'No outstanding balance',
      payer_type: balance.insured ? 'insurance' : 'self_pay',
    };
  }
  if (balance.insured) {
    return { can_discharge: true, reason: `Approved payer — ${balance.insurance_provider || 'insurance'}`, payer_type: 'insurance' };
  }
  return { can_discharge: false, reason: 'Outstanding balance must be settled', payer_type: 'self_pay' };
}

// Marks every outstanding source order as paid and settles pending
// consultations/referrals. Used only when a discharge is cleared, i.e. when the
// account is fully covered (or an admin/insurance approval is in force).
export async function settleOutstandingItems(db: Db, patientId: string): Promise<void> {
  await db.query(
    `UPDATE prescriptions pr SET is_paid = true
       FROM encounters enc
      WHERE pr.encounter_id = enc.id AND enc.patient_id = $1
        AND COALESCE(pr.is_paid, false) = false AND pr.status <> 'cancelled'`,
    [patientId]
  ).catch(() => {});
  await db.query(
    `UPDATE lab_orders l SET is_paid = true
       FROM encounters enc
      WHERE l.encounter_id = enc.id AND enc.patient_id = $1
        AND COALESCE(l.is_paid, false) = false AND l.status NOT IN ('cancelled', 'completed')`,
    [patientId]
  ).catch(() => {});
  await db.query(
    `UPDATE radiology_orders r SET is_paid = true
       FROM encounters enc
      WHERE r.encounter_id = enc.id AND enc.patient_id = $1
        AND COALESCE(r.is_paid, false) = false AND r.status NOT IN ('cancelled', 'completed')`,
    [patientId]
  ).catch(() => {});
  await db.query(
    `UPDATE admissions SET is_paid = true WHERE patient_id = $1 AND COALESCE(is_paid, false) = false`,
    [patientId]
  ).catch(() => {});
  await db.query(
    `UPDATE admission_daily_charges SET is_paid = true WHERE patient_id = $1 AND is_paid = false`,
    [patientId]
  ).catch(() => {});
  await db.query(
    `UPDATE visits SET consultation_status = 'paid'
      WHERE patient_id = $1 AND consultation_status = 'pending' AND COALESCE(consultation_fee, 0) > 0`,
    [patientId]
  ).catch(() => {});
  await db.query(
    `UPDATE referrals SET consultant_fee_status = 'paid'
      WHERE patient_id = $1 AND consultant_fee_status = 'pending' AND COALESCE(consultant_fee, 0) > 0`,
    [patientId]
  ).catch(() => {});
}

export async function applyHeldDeposits(db: Db, tenantId: string, patientId: string): Promise<number> {
  const res = await db.query(
    `UPDATE patient_deposits
        SET status = 'applied', applied_amount = amount, applied_at = NOW(), updated_at = NOW()
      WHERE tenant_id = $1 AND patient_id = $2 AND status = 'held'`,
    [tenantId, patientId]
  ).catch(() => ({ rowCount: 0 } as any));
  return res.rowCount || 0;
}
