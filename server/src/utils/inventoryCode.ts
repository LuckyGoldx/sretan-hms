import pool from '../db/pool';

// One inventory catalogue: every item gets a unique, category-prefixed code so
// the same physical item/service can never exist twice with different prices.
const PREFIX: Record<string, string> = { lab: 'LAB', pharmacy: 'PHA', radiology: 'RAD', general: 'GEN' };

export function inventoryCodePrefix(category?: string | null): string {
  return PREFIX[String(category || '').toLowerCase()] || 'GEN';
}

/**
 * Next sequential code for a category (e.g. LAB-0007). The (tenant_id, code)
 * unique index is the guard if two inserts ever race.
 */
export async function nextInventoryCode(tenantId: string, category?: string | null): Promise<string> {
  const prefix = inventoryCodePrefix(category);
  const r = await pool.query(
    `SELECT code FROM inventory_items
      WHERE tenant_id = $1 AND code LIKE $2
      ORDER BY code DESC LIMIT 1`,
    [tenantId, `${prefix}-%`]
  );
  const last: string | undefined = r.rows[0]?.code;
  const n = last ? (parseInt(String(last).split('-')[1], 10) || 0) + 1 : 1;
  return `${prefix}-${String(n).padStart(4, '0')}`;
}

/**
 * Resolve (creating if needed) the inventory item that backs a laboratory
 * catalogue test, so price/stock live in exactly one place.
 */
export async function ensureLabInventoryItem(
  tenantId: string,
  name: string,
  price: number | string | null | undefined
): Promise<string> {
  const clean = String(name || '').trim();
  const existing = await pool.query(
    `SELECT id FROM inventory_items
      WHERE tenant_id = $1 AND category = 'lab' AND lower(trim(drug_name)) = lower(trim($2))
      ORDER BY created_at LIMIT 1`,
    [tenantId, clean]
  );
  if (existing.rows.length > 0) return existing.rows[0].id;

  const code = await nextInventoryCode(tenantId, 'lab');
  const p = parseFloat(String(price ?? 0)) || 0;
  const inserted = await pool.query(
    `INSERT INTO inventory_items (id, tenant_id, drug_name, category, price, cost_price, amount_type, is_active, code)
     VALUES (gen_random_uuid(), $1, $2, 'lab', $3, 0, 'tests', true, $4)
     RETURNING id`,
    [tenantId, clean, p, code]
  );
  return inserted.rows[0].id;
}
