-- ============================================================
-- 071: Ward-linked & keyed inventory items (rename-safe billing)
--
-- Each ward's per-night bed item is linked to the ward by ward_id and
-- stamped service_key = 'BED_DAY'. Hospital-wide one-time fees get
-- 'ADMISSION_FEE' and 'FOLDER_ACTIVATION'. Billing resolves by link/key
-- first, so renaming items/wards is cosmetic and never breaks billing.
-- Idempotent: safe to run on every server boot.
-- ============================================================

ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS ward_id UUID REFERENCES wards(id) ON DELETE CASCADE;
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS service_key VARCHAR(100);

-- One ACTIVE linked bed item per ward.
CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_item_active_ward
  ON inventory_items (ward_id) WHERE ward_id IS NOT NULL AND is_active = true;

CREATE INDEX IF NOT EXISTS idx_inventory_service_key
  ON inventory_items (service_key) WHERE service_key IS NOT NULL;

-- Link each ward's canonical active per-night item. Matching is PREFIX based
-- (item name starts with the ward name, e.g. "Male Ward Admission (Per Night)")
-- so a name like "Female Ward ..." can never be mislinked to "Male Ward".
WITH ranked AS (
  SELECT i2.id, w.id AS ward_id,
         ROW_NUMBER() OVER (
           PARTITION BY w.id
           ORDER BY (i2.drug_name ILIKE '%per night%') DESC, i2.created_at ASC
         ) AS rn
  FROM wards w
  JOIN inventory_items i2
    ON i2.tenant_id = w.tenant_id AND i2.is_active = true AND i2.ward_id IS NULL
   AND i2.drug_name ILIKE w.name || '%'
   AND (i2.drug_name ILIKE '%per night%' OR i2.drug_name ILIKE '%admission%')
)
UPDATE inventory_items i
SET ward_id = r.ward_id, service_key = 'BED_DAY'
FROM ranked r
WHERE i.id = r.id AND r.rn = 1;

-- Canonical hospital-wide one-time Admission Fee.
WITH ranked AS (
  SELECT i.id, i.tenant_id,
         ROW_NUMBER() OVER (
           PARTITION BY i.tenant_id
           ORDER BY (i.drug_name ILIKE '%admission fee%') DESC, i.created_at DESC
         ) AS rn
  FROM inventory_items i
  WHERE i.is_active = true AND i.service_key IS NULL
    AND i.drug_name ILIKE '%Admission%' AND i.drug_name NOT ILIKE '%per night%'
    AND NOT EXISTS (
      SELECT 1 FROM wards ww
      WHERE ww.tenant_id = i.tenant_id AND i.drug_name ILIKE '%' || ww.name || '%'
    )
)
UPDATE inventory_items i SET service_key = 'ADMISSION_FEE'
FROM ranked r WHERE i.id = r.id AND r.rn = 1;

-- Canonical hospital-wide Folder Activation Fee.
WITH ranked AS (
  SELECT i.id, i.tenant_id,
         ROW_NUMBER() OVER (
           PARTITION BY i.tenant_id
           ORDER BY (i.drug_name ILIKE '%folder activation fee%') DESC, i.created_at DESC
         ) AS rn
  FROM inventory_items i
  WHERE i.is_active = true AND i.service_key IS NULL AND i.drug_name ILIKE '%folder activation%'
)
UPDATE inventory_items i SET service_key = 'FOLDER_ACTIVATION'
FROM ranked r WHERE i.id = r.id AND r.rn = 1;
