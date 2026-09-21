import pool from '../db/pool';

/**
 * The billing groups shown as tabs in the insurance Coverage Rules and Service
 * Prices modals. Pharmacy/Lab/Radiology map 1:1 to the inventory category; the
 * remaining tabs are groupings of `general` inventory items by their stable
 * service_key or (legacy) name, so every billable service points at a real
 * inventory item id.
 */
export const SERVICE_GROUPS = [
  'pharmacy', 'lab', 'radiology',
  'consultation', 'admission', 'maternity', 'procedure',
  'services',
] as const;

export type ServiceGroup = typeof SERVICE_GROUPS[number];

export function isServiceGroup(value: string): value is ServiceGroup {
  return (SERVICE_GROUPS as readonly string[]).includes(value);
}

/**
 * The service_type a group's CATEGORY-LEVEL rule is stored against. Item-level
 * rules/prices are matched by inventory_item_id, so only category-level rows
 * need a billing service_type that the billing code actually sends. 'services'
 * is the general inventory catch-all.
 */
export function groupServiceType(group: string): string {
  return group === 'services' ? 'general' : group;
}

// Stable service_key -> group (preferred; renaming an item never moves it).
const KEY_TO_GROUP: Record<string, ServiceGroup> = {
  ADMISSION_FEE: 'admission',
  BED_DAY: 'admission',
  FOLDER_ACTIVATION: 'services',
  CONSULTATION_NEW: 'consultation',
  CONSULTATION_FOLLOWUP: 'consultation',
  SPECIALIST_CONSULTATION: 'consultation',
  MATERNITY_BOOKING: 'maternity',
};

// Legacy name fallback for general items that predate the stable service_key.
const NAME_RULES: Array<{ group: ServiceGroup; patterns: RegExp[] }> = [
  { group: 'maternity', patterns: [/maternit/i, /antenatal/i, /caesarean|cesarean/i, /delivery/i, /postnatal/i, /labour|labor/i] },
  { group: 'consultation', patterns: [/consultation/i, /specialist/i] },
  { group: 'procedure', patterns: [/surgical procedure/i, /procedure/i, /wound dressing/i, /plaster/i, /sutur/i, /incision/i] },
  { group: 'admission', patterns: [/admission/i, /per night/i, /\bward\b/i] },
];

/** Which tab an inventory item belongs to. */
export function assignServiceGroup(item: {
  category?: string | null;
  service_key?: string | null;
  drug_name?: string | null;
}): ServiceGroup {
  const category = String(item?.category || '');
  if (category === 'pharmacy' || category === 'lab' || category === 'radiology') return category;

  const key = item?.service_key ? String(item.service_key) : '';
  if (key && KEY_TO_GROUP[key]) return KEY_TO_GROUP[key];

  const name = String(item?.drug_name || '');
  for (const rule of NAME_RULES) {
    if (rule.patterns.some((p) => p.test(name))) return rule.group;
  }
  return 'services';
}

/**
 * The configured item id (and its default price) for a stable service_key, or
 * null. Used when a billable item has no explicit inventory link (e.g. a visit's
 * consultation fee is priced from the CONSULTATION_NEW item).
 */
export async function resolveKeyedItem(
  tenantId: string,
  serviceKey: string
): Promise<{ id: string; price: number } | null> {
  const res = await pool.query(
    `SELECT id, price FROM inventory_items
      WHERE tenant_id = $1 AND service_key = $2 AND is_active = true
      ORDER BY created_at DESC LIMIT 1`,
    [tenantId, serviceKey]
  ).catch(() => ({ rows: [] as any[] }));
  if (res.rows.length === 0) return null;
  return { id: res.rows[0].id, price: parseFloat(res.rows[0].price) || 0 };
}
