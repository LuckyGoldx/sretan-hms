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

interface WardStay {
  ward_id: string | null;
  ward_name: string | null;
  bed_number: string | null;
  started_at: Date;
  ended_at: Date | null;
}

/** The ward the patient occupied at a point in time (latest stay that started
 *  at or before it). Falls back to the first stay / admission ward. */
function stayAt(stays: WardStay[], at: Date): WardStay | null {
  let current: WardStay | null = null;
  for (const s of stays) {
    if (s.started_at.getTime() <= at.getTime()) current = s;
    else break;
  }
  return current || stays[0] || null;
}

/**
 * Materialise missing unpaid bed-day charges for active admissions.
 *
 * Bed fees are separate from the one-time Admission (processing) Fee.
 * Every started 24h block anchored at the doctor's admission time accrues
 * one bed-day row, starting at Day 1. Each day is priced from the ward the
 * patient occupied at the START of that block, so after a transfer the days
 * spent in each ward are billed at that ward's own rate (e.g. 2 days ICU +
 * 4 days Male Ward). Past days are never rewritten.
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
  if (result.rows.length === 0) return;

  const admissionIds = result.rows.map((a: any) => a.id);

  // Highest day already billed per admission, fetched once.
  const existingRes = await pool.query(
    `SELECT admission_id, MAX(day_index)::int AS max_day
     FROM admission_daily_charges
     WHERE tenant_id = $1 AND admission_id = ANY($2::uuid[])
     GROUP BY admission_id`,
    [tenantId, admissionIds]
  ).catch(() => ({ rows: [] as any[] }));
  const maxDayByAdmission = new Map<string, number>();
  for (const row of existingRes.rows) {
    maxDayByAdmission.set(row.admission_id, row.max_day || 0);
  }

  // Ward-stay history per admission (empty for legacy rows: fall back to the
  // admission's ward for the whole episode).
  const stayRes = await pool.query(
    `SELECT s.admission_id, s.ward_id, s.bed_number, w.name AS ward_name, s.started_at, s.ended_at
       FROM admission_ward_stays s
       LEFT JOIN wards w ON w.id = s.ward_id
      WHERE s.admission_id = ANY($1::uuid[])
      ORDER BY s.started_at ASC`,
    [admissionIds]
  ).catch(() => ({ rows: [] as any[] }));
  const staysByAdmission = new Map<string, WardStay[]>();
  for (const row of stayRes.rows) {
    if (!staysByAdmission.has(row.admission_id)) staysByAdmission.set(row.admission_id, []);
    staysByAdmission.get(row.admission_id)!.push({
      ward_id: row.ward_id,
      ward_name: row.ward_name,
      bed_number: row.bed_number || null,
      started_at: new Date(row.started_at),
      ended_at: row.ended_at ? new Date(row.ended_at) : null,
    });
  }

  // Ward rates are usually shared across admissions; resolve each ward once.
  const rateByWard = new Map<string, { price: number; cost: number } | null>();
  async function wardRate(wardId?: string | null, wardName?: string | null) {
    const key = wardId || `name:${wardName || ''}`;
    let rate = rateByWard.get(key);
    if (rate === undefined) {
      rate = await resolveWardPerNight(tenantId, wardId || undefined, wardName || undefined);
      rateByWard.set(key, rate);
    }
    return rate;
  }

  // Optional per-bed nightly price override (admin Ward Management).
  const bedRateByKey = new Map<string, number | null>();
  async function bedRate(wardId?: string | null, bedNumber?: string | null): Promise<number | null> {
    if (!wardId || !bedNumber) return null;
    const key = `${wardId}:${bedNumber}`;
    if (bedRateByKey.has(key)) return bedRateByKey.get(key)!;
    const r = await pool.query(
      `SELECT daily_rate FROM beds WHERE tenant_id = $1 AND ward_id = $2 AND bed_number = $3 LIMIT 1`,
      [tenantId, wardId, bedNumber]
    ).catch(() => ({ rows: [] as any[] }));
    const raw = r.rows[0]?.daily_rate;
    const value = raw === null || raw === undefined ? null : parseFloat(raw) || 0;
    bedRateByKey.set(key, value);
    return value;
  }

  for (const admission of result.rows) {
    const admittedAt = new Date(admission.admitted_at);
    const stays = staysByAdmission.get(admission.id) || [
      { ward_id: admission.ward_id, ward_name: admission.ward_name, bed_number: admission.bed_number || null, started_at: admittedAt, ended_at: null },
    ];

    const days = billableBedDays(admittedAt, reference);
    const startDay = (maxDayByAdmission.get(admission.id) || 0) + 1;
    if (startDay > days) continue;

    const values: any[] = [];
    const placeholders: string[] = [];
    let p = 1;
    for (let dayIndex = startDay; dayIndex <= days; dayIndex++) {
      const periodStart = new Date(admittedAt.getTime() + (dayIndex - 1) * DAY_MS);
      const periodEnd = new Date(periodStart.getTime() + DAY_MS);

      const stay = stayAt(stays, periodStart);
      const wardId = stay?.ward_id || admission.ward_id;
      // A per-bed price (when set) overrides the ward's nightly rate.
      const bedOverride = await bedRate(wardId, stay?.bed_number || null);
      let dayPrice = bedOverride && bedOverride > 0 ? bedOverride : null;
      if (dayPrice === null) {
        const rate = await wardRate(wardId, stay?.ward_name || admission.ward_name);
        // A missing ward rate stops this admission's tail (rather than leaving
        // a permanent price hole) so the days are billed once the rate is set.
        if (!rate || rate.price <= 0) break;
        dayPrice = rate.price;
      }

      placeholders.push(`($${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++})`);
      values.push(uuidv4(), tenantId, admission.id, admission.patient_id, dayIndex, periodStart, periodEnd, dayPrice, wardId || null);
    }
    if (placeholders.length === 0) continue;
    await pool.query(
      `INSERT INTO admission_daily_charges
         (id, tenant_id, admission_id, patient_id, day_index, period_start, period_end, amount, ward_id)
       VALUES ${placeholders.join(', ')}
       ON CONFLICT (admission_id, day_index) DO NOTHING`,
      values
    );
  }
}
