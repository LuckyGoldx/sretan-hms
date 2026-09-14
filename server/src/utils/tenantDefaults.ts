import { Pool, PoolClient } from 'pg';

type Db = Pool | PoolClient;

// System keyed inventory items every hospital needs. Billing resolves these by
// service_key, so the hospital may rename or reprice them freely.
const KEY_ITEMS: Array<{ name: string; category: string; amount_type: string; price: number; key: string; unlocks?: boolean; gender?: string | null }> = [
  { name: 'Admission Fee', category: 'general', amount_type: 'units', price: 5000, key: 'ADMISSION_FEE' },
  { name: 'Folder Activation Fee', category: 'general', amount_type: 'miscellaneous', price: 5000, key: 'FOLDER_ACTIVATION' },
  { name: 'General Consultation (New)', category: 'general', amount_type: 'consultation', price: 5000, key: 'CONSULTATION_NEW' },
  { name: 'General Consultation (Follow-up)', category: 'general', amount_type: 'consultation', price: 3000, key: 'CONSULTATION_FOLLOWUP' },
  { name: 'Specialist Consultation', category: 'general', amount_type: 'consultation', price: 10000, key: 'SPECIALIST_CONSULTATION' },
  { name: 'Antenatal Care (Booking)', category: 'general', amount_type: 'maternity', price: 15000, key: 'MATERNITY_BOOKING', unlocks: true, gender: 'Female' },
];

const PROVIDERS: Array<{ name: string; code: string }> = [
  { name: 'NHIS', code: 'NHIS' },
  { name: 'Greenfield HMO', code: 'GPHMO' },
  { name: 'Reliance HMO', code: 'RLHMO' },
  { name: 'AXA Mansard Health', code: 'AXAHMO' },
  { name: 'Leadway Health', code: 'LWHMO' },
  { name: 'Hygeia HMO', code: 'HYGHMO' },
  { name: 'Total Health Trust', code: 'THTHMO' },
  { name: 'Precious Healthcare', code: 'PCHMO' },
  { name: 'Clearline HMO', code: 'CLHMO' },
  { name: 'Multi-Shield HMO', code: 'MSHMO' },
];

/** Seed the keyed fees (including the maternity booking fee) for a new hospital. */
export async function seedTenantKeyItems(db: Db, tenantId: string): Promise<void> {
  for (const it of KEY_ITEMS) {
    const exists = await db.query(
      `SELECT 1 FROM inventory_items
        WHERE tenant_id = $1 AND (service_key = $2 OR lower(trim(drug_name)) = lower(trim($3)))
        LIMIT 1`,
      [tenantId, it.key, it.name]
    );
    if (exists.rows.length > 0) continue;
    await db.query(
      `INSERT INTO inventory_items
         (id, tenant_id, drug_name, category, price, cost_price, amount_type, is_active, service_key, unlocks_maternity, gender_restriction)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, 0, $5, true, $6, $7, $8)`,
      [tenantId, it.name, it.category, it.price, it.amount_type, it.key, !!it.unlocks, it.gender ?? null]
    );
  }
}

/** Seed the common HMO provider list for a new hospital. */
export async function seedTenantInsuranceProviders(db: Db, tenantId: string): Promise<void> {
  for (const p of PROVIDERS) {
    await db.query(
      `INSERT INTO insurance_providers (id, tenant_id, name, code, is_active)
       VALUES (gen_random_uuid(), $1, $2, $3, true)
       ON CONFLICT (tenant_id, code) DO NOTHING`,
      [tenantId, p.name, p.code]
    );
  }
}

/** Everything a freshly created hospital needs beyond departments and wards. */
export async function seedTenantDefaults(db: Db, tenantId: string): Promise<void> {
  await seedTenantKeyItems(db, tenantId);
  await seedTenantInsuranceProviders(db, tenantId);
}
