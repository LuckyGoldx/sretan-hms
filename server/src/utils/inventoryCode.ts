import pool from '../db/pool';

/**
 * Resolve (creating if needed) the single inventory item that backs a
 * laboratory catalogue test, so price/stock live in exactly one place. The
 * category-prefixed unique code is assigned by the database trigger on insert.
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

  const p = parseFloat(String(price ?? 0)) || 0;
  const inserted = await pool.query(
    `INSERT INTO inventory_items (id, tenant_id, drug_name, category, price, cost_price, amount_type, is_active)
     VALUES (gen_random_uuid(), $1, $2, 'lab', $3, 0, 'tests', true)
     RETURNING id`,
    [tenantId, clean, p]
  );
  return inserted.rows[0].id;
}
