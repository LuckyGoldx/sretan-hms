import { v4 as uuidv4 } from 'uuid';
import pool from '../db/pool';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Number of bed days billable for an admission between its admitted_at and
 * a reference time, using the "per day or part thereof" rule anchored at the
 * admission time:
 *   - every complete 24h block is one day
 *   - any remainder (a started day) counts as one more day
 *   - discharging exactly on a 24h boundary does NOT add the next day
 *   - an active admission always has at least day 1
 */
export function billableBedDays(admittedAt: Date, until: Date): number {
  const elapsed = until.getTime() - admittedAt.getTime();
  if (elapsed <= 0) return 1;
  const fullDays = Math.floor(elapsed / DAY_MS);
  const remainder = elapsed % DAY_MS;
  return fullDays + (remainder > 0 ? 1 : 0);
}

/**
 * Resolve a ward's bed-day item. Prefers the ID-linked canonical item
 * (service_key 'BED_DAY' + ward_id). Falls back to the legacy name search so
 * pre-link data and unlinked items still work during migration. Renaming an
 * item or ward never affects the ID-linked path.
 */
export async function resolveWardPerNight(
  tenantId: string,
  wardId?: string,
  wardName?: string
): Promise<{ price: number; cost: number } | null> {
  if (wardId) {
    const linked = await pool.query(
      `SELECT price, cost_price FROM inventory_items
       WHERE tenant_id = $1 AND ward_id = $2 AND service_key = 'BED_DAY' AND is_active = true
       ORDER BY created_at DESC LIMIT 1`,
      [tenantId, wardId]
    ).catch(() => ({ rows: [] }));
    if (linked.rows.length > 0) {
      return { price: parseFloat(linked.rows[0].price) || 0, cost: parseFloat(linked.rows[0].cost_price) || 0 };
    }
  }
  if (!wardName) return null;
  const legacy = await pool.query(
    `SELECT price, cost_price FROM inventory_items
     WHERE tenant_id = $1 AND category = 'general' AND is_active = true
       AND (drug_name ILIKE $2 || '%' OR drug_name ILIKE '%' || $2 || '%')
       AND (drug_name ILIKE '%per night%' OR drug_name ILIKE '%admission%')
     ORDER BY (drug_name ILIKE $2 || '%') DESC, (drug_name ILIKE '%per night%') DESC, created_at DESC
     LIMIT 1`,
    [tenantId, wardName]
  ).catch(() => ({ rows: [] }));
  return legacy.rows.length > 0 ? { price: parseFloat(legacy.rows[0].price) || 0, cost: parseFloat(legacy.rows[0].cost_price) || 0 } : null;
}

/**
 * One-time hospital-wide Admission (processing) Fee, set once in Inventory.
 * Prefers the keyed canonical item; falls back to the legacy name search.
 */
export async function resolveOneTimeAdmissionFee(
  tenantId: string
): Promise<{ price: number; cost: number } | null> {
  const keyed = await pool.query(
    `SELECT price, cost_price FROM inventory_items
     WHERE tenant_id = $1 AND service_key = 'ADMISSION_FEE' AND is_active = true
     ORDER BY created_at DESC LIMIT 1`,
    [tenantId]
  ).catch(() => ({ rows: [] }));
  if (keyed.rows.length > 0) {
    return { price: parseFloat(keyed.rows[0].price) || 0, cost: parseFloat(keyed.rows[0].cost_price) || 0 };
  }
  const legacy = await pool.query(
    `SELECT i.price, i.cost_price FROM inventory_items i
     WHERE i.tenant_id = $1 AND i.category = 'general' AND i.is_active = true
       AND i.drug_name ILIKE '%Admission%' AND i.drug_name NOT ILIKE '%per night%'
       AND NOT EXISTS (
         SELECT 1 FROM wards ww
         WHERE ww.tenant_id = i.tenant_id AND i.drug_name ILIKE '%' || ww.name || '%'
       )
     ORDER BY (i.drug_name ILIKE '%admission fee%') DESC, i.created_at DESC
     LIMIT 1`,
    [tenantId]
  ).catch(() => ({ rows: [] }));
  return legacy.rows.length > 0 ? { price: parseFloat(legacy.rows[0].price) || 0, cost: parseFloat(legacy.rows[0].cost_price) || 0 } : null;
}

/**
 * Materialise missing unpaid bed-day charges for active admissions.
 *
 * Bed fees are separate from the one-time Admission (processing) Fee.
 * Every started 24h block anchored at the doctor's admission time accrues
 * one bed-day row, starting at Day 1, priced from the ward's linked per-night
 * item at the time each day first becomes due (past days are never rewritten).
 */
export async function accrueBedCharges(
  tenantId: string,
  admissionId?: string,
  until?: Date
): Promise<void> {
  const reference = until || new Date();

  let query = `SELECT a.id, a.patient_id, a.admitted_at, a.ward_id, w.name AS ward_name
               FROM admissions a
               JOIN wards w ON w.id = a.ward_id
               WHERE a.tenant_id = $1 AND a.status = 'active'`;
  const params: any[] = [tenantId];
  if (admissionId) {
    query += ' AND a.id = $2';
    params.push(admissionId);
  }

  const result = await pool.query(query, params);

  for (const admission of result.rows) {
    const rate = await resolveWardPerNight(tenantId, admission.ward_id, admission.ward_name);
    if (!rate || rate.price <= 0) continue;

    const admittedAt = new Date(admission.admitted_at);
    const days = billableBedDays(admittedAt, reference);

    for (let dayIndex = 1; dayIndex <= days; dayIndex++) {
      const periodStart = new Date(admittedAt.getTime() + (dayIndex - 1) * DAY_MS);
      const periodEnd = new Date(periodStart.getTime() + DAY_MS);
      await pool.query(
        `INSERT INTO admission_daily_charges
           (id, tenant_id, admission_id, patient_id, day_index, period_start, period_end, amount)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (admission_id, day_index) DO NOTHING`,
        [uuidv4(), tenantId, admission.id, admission.patient_id, dayIndex, periodStart, periodEnd, rate.price]
      );
    }
  }
}
