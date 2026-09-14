import pool from '../db/pool';
import { readClinicProfile } from '../config/reader';

function tenantId(): string {
  return readClinicProfile().GLOBAL_SAAS_TENANT_ID;
}

/** Price of a system keyed item (ADMISSION_FEE, FOLDER_ACTIVATION, ...), or null. */
export async function getKeyedPrice(serviceKey: string, tenant?: string): Promise<number | null> {
  const r = await pool.query(
    `SELECT price FROM inventory_items
      WHERE tenant_id = $1 AND service_key = $2 AND is_active = true
      ORDER BY created_at DESC LIMIT 1`,
    [tenant || tenantId(), serviceKey]
  );
  return r.rows.length ? (parseFloat(r.rows[0].price) || 0) : null;
}

/** First active item in the tenant whose name matches any pattern (fallback). */
async function priceByName(patterns: string[], tenant?: string): Promise<number | null> {
  const t = tenant || tenantId();
  for (const pat of patterns) {
    const res = await pool.query(
      `SELECT price FROM inventory_items
        WHERE tenant_id = $1 AND drug_name ILIKE $2 AND category = 'general' AND is_active = true
        ORDER BY created_at DESC LIMIT 1`,
      [t, pat]
    );
    if (res.rows.length > 0) return parseFloat(res.rows[0].price) || 0;
  }
  return null;
}

/**
 * Default consultation fee. Prefers the stable service_key (so renaming the
 * item does not break pricing), then falls back to the historical name match.
 */
export async function getDefaultConsultationFee(visitType: string, tenant?: string): Promise<number> {
  const isFollowUp = visitType === 'follow_up' || visitType === 'review';
  const keyed = await getKeyedPrice(isFollowUp ? 'CONSULTATION_FOLLOWUP' : 'CONSULTATION_NEW', tenant);
  if (keyed !== null) return keyed;
  const patterns = isFollowUp
    ? ['General Consultation (Follow-up)', '%General Consultation (Follow-up)%', '%Consultation%Follow-up%']
    : ['General Consultation (New)', '%General Consultation (New)%', '%General Consultation%'];
  return (await priceByName(patterns, tenant)) ?? 0;
}

/** Default specialist / referral fee. */
export async function getDefaultSpecialistFee(tenant?: string): Promise<number> {
  const keyed = await getKeyedPrice('SPECIALIST_CONSULTATION', tenant);
  if (keyed !== null) return keyed;
  return (await priceByName(['Specialist Consultation', '%Specialist Consultation%'], tenant)) ?? 0;
}
