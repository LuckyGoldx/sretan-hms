import pool from '../db/pool';

/**
 * Canonical service type used for pricing/coverage lookups. Some callers send
 * the raw source type (`prescription`, `pharmacy_bill`, `bed_day`); the rules
 * are stored against the normalized category (`pharmacy`, `admission`).
 */
export function normalizeServiceType(serviceType: string | null | undefined): string {
  const st = String(serviceType || 'general');
  if (st === 'prescription' || st === 'pharmacy_bill' || st === 'pharmacy') return 'pharmacy';
  if (st === 'bed_day') return 'admission';
  return st;
}

/**
 * Look up a provider's insurance (tariff) unit price for a service.
 *
 * Priority mirrors coverageLookup.getCoverageForService:
 *   1. Item override by inventory_item_id (preferred, stable across renames)
 *   2. Item override by item name (legacy fallback)
 *   3. Category-level price (provider_id, service_type, inventory_item_id IS NULL)
 *   4. null — no override, the caller must fall back to the inventory price.
 */
export async function getInsuranceUnitPrice(
  providerId: string | null | undefined,
  serviceType: string,
  itemName?: string,
  inventoryItemId?: string | null
): Promise<number | null> {
  if (!providerId) return null;
  const st = normalizeServiceType(serviceType);

  if (inventoryItemId) {
    const byId = await pool.query(
      `SELECT price FROM insurance_provider_service_prices
        WHERE provider_id = $1 AND inventory_item_id = $2
        LIMIT 1`,
      [providerId, inventoryItemId]
    );
    if (byId.rows.length > 0) return parseFloat(byId.rows[0].price);
  }

  if (itemName) {
    const byName = await pool.query(
      `SELECT sp.price
         FROM insurance_provider_service_prices sp
         JOIN inventory_items inv ON sp.inventory_item_id = inv.id
        WHERE sp.provider_id = $1 AND sp.service_type = $2 AND inv.drug_name ILIKE $3
        LIMIT 1`,
      [providerId, st, itemName]
    );
    if (byName.rows.length > 0) return parseFloat(byName.rows[0].price);
  }

  const catRule = await pool.query(
    `SELECT price FROM insurance_provider_service_prices
      WHERE provider_id = $1 AND service_type = $2 AND inventory_item_id IS NULL
      LIMIT 1`,
    [providerId, st]
  );
  if (catRule.rows.length > 0) return parseFloat(catRule.rows[0].price);

  return null;
}

export interface EffectiveServicePrice {
  /** The inventory / list price the service would cost without insurance. */
  defaultUnitPrice: number;
  /** The provider's tariff override, or null when none is configured. */
  insuranceUnitPrice: number | null;
  /** What is actually billed: the override when set, else the default. */
  effectiveUnitPrice: number;
  priceSource: 'insurance' | 'default';
}

/**
 * Combine a default price with an optional provider override.
 *
 * A 0 override is a real price and is honoured (a provider may negotiate a
 * service to zero); only `null`/non-finite means "no override, use default".
 */
export function resolveEffectiveUnitPrice(
  defaultUnitPrice: number | string | null | undefined,
  insuranceUnitPrice: number | string | null | undefined
): EffectiveServicePrice {
  const def = Number(defaultUnitPrice);
  const safeDefault = Number.isFinite(def) && def >= 0 ? def : 0;

  const hasOverride = insuranceUnitPrice !== null && insuranceUnitPrice !== undefined && insuranceUnitPrice !== '';
  const raw = Number(insuranceUnitPrice);
  const override = hasOverride && Number.isFinite(raw) ? raw : null;

  return {
    defaultUnitPrice: safeDefault,
    insuranceUnitPrice: override,
    effectiveUnitPrice: override !== null ? override : safeDefault,
    priceSource: override !== null ? 'insurance' : 'default',
  };
}
