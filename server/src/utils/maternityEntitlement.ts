import { Pool, PoolClient } from 'pg';
import { v4 as uuidv4 } from 'uuid';

type Db = Pool | PoolClient;

export interface MaternityUnlockItem {
  id: string;
  drug_name: string;
  gender_restriction: string | null;
}

// Same normalization Paypoint uses for cost/price lookups: strip the service
// prefix and any "× qty" suffix so an item description can be matched against
// the inventory item name.
export function cleanMaternityItemName(description: string | undefined): string {
  return String(description || '')
    .replace(/^(Prescription|Lab|Radiology|Service|Bed Fee|Admission Fee|Folder Activation)\s*[:—–-]?\s*/i, '')
    .split('×')[0]
    .split(' x ')[0]
    .trim();
}

// Returns the inventory item that unlocks maternity booking for a Paypoint
// line, or null when the line is an ordinary service. Prefers the inventory id
// when the client sends one, and falls back to a name match for clients that
// only send a description.
export async function resolveMaternityUnlock(
  db: Db,
  tenantId: string,
  item: any
): Promise<MaternityUnlockItem | null> {
  const serviceId = item?.service_id;
  if (serviceId) {
    try {
      const byId = await db.query(
        `SELECT id, drug_name, gender_restriction FROM inventory_items
          WHERE id = $1 AND tenant_id = $2 AND unlocks_maternity = true
          LIMIT 1`,
        [serviceId, tenantId]
      );
      if (byId.rows.length > 0) return byId.rows[0];
    } catch {}
  }

  const name = cleanMaternityItemName(item?.description);
  if (!name) return null;
  const byName = await db.query(
    `SELECT id, drug_name, gender_restriction FROM inventory_items
      WHERE tenant_id = $1 AND unlocks_maternity = true AND lower(drug_name) = lower($2)
      ORDER BY created_at DESC LIMIT 1`,
    [tenantId, name]
  );
  return byName.rows[0] || null;
}

export async function getPaidMaternityEntitlement(
  db: Db,
  tenantId: string,
  patientId: string
): Promise<{ id: string } | null> {
  const result = await db.query(
    `SELECT id FROM maternity_entitlements
      WHERE tenant_id = $1 AND patient_id = $2 AND status = 'paid'
      ORDER BY created_at DESC LIMIT 1`,
    [tenantId, patientId]
  );
  return result.rows[0] || null;
}

export async function createMaternityEntitlement(
  db: Db,
  tenantId: string,
  patientId: string,
  opts: { paymentId?: string | null; paymentItemId?: string | null; source: string }
): Promise<string> {
  const id = uuidv4();
  await db.query(
    `INSERT INTO maternity_entitlements
       (id, tenant_id, patient_id, payment_id, payment_item_id, status, source)
     VALUES ($1, $2, $3, $4, $5, 'paid', $6)`,
    [id, tenantId, patientId, opts.paymentId || null, opts.paymentItemId || null, opts.source]
  );
  return id;
}
