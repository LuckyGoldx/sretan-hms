-- ============================================================
-- 069: Hospital-wide one-time Admission (processing) Fee
--
-- Two-part admission billing:
--   1. Admission Fee  -> one-time, hospital-wide, admin-editable in
--      Inventory (like "Folder Activation Fee"). Paying it marks the
--      admission paid (unlocks bed assignment).
--   2. Bed Fee        -> per-ward "…(Per Night)" item, accruing every
--      started 24h from the doctor's admission time until discharge,
--      starting with Day 1.
--
-- Seeds the one-time "Admission Fee" general item for every tenant that
-- does not already have one. Price is editable in Inventory Manager.
-- Idempotent: safe to run on every server boot.
-- ============================================================

INSERT INTO inventory_items (tenant_id, drug_name, category, price, amount_type, is_active)
SELECT DISTINCT w.tenant_id,
       'Admission Fee' AS drug_name,
       'general',
       5000,
       'units',
       true
FROM wards w
WHERE NOT EXISTS (
  SELECT 1 FROM inventory_items i
  WHERE i.tenant_id = w.tenant_id
    AND i.category = 'general'
    AND i.is_active = true
    AND i.drug_name ILIKE '%Admission%'
    AND i.drug_name NOT ILIKE '%per night%'
    AND NOT EXISTS (
      SELECT 1 FROM wards ww
      WHERE ww.tenant_id = i.tenant_id
        AND i.drug_name ILIKE '%' || ww.name || '%'
    )
);
