-- ============================================================
-- 072: Repair ward links created with ambiguous substring matching
--
-- Some earlier linking used '%wardName%' which mis-linked items like
-- "Female Ward Admission (Per Night)" to "Male Ward" (the text "male
-- ward" occurs inside "female ward"). This clears any bed item whose
-- name does NOT start with its linked ward's name, then re-links the
-- canonical item using PREFIX matching only.
-- Idempotent: safe to run on every server boot.
-- ============================================================

-- 1) Unlink bed items that were matched by substring (name not starting with ward name).
UPDATE inventory_items i
SET ward_id = NULL, service_key = NULL
WHERE i.service_key = 'BED_DAY'
  AND EXISTS (
    SELECT 1 FROM wards w
    WHERE w.id = i.ward_id AND i.drug_name NOT ILIKE w.name || '%'
  );

-- 2) Relink each ward's canonical active per-night item (prefix matching only).
WITH ranked AS (
  SELECT i2.id, w.id AS ward_id,
         ROW_NUMBER() OVER (
           PARTITION BY w.id
           ORDER BY (i2.drug_name ILIKE '%per night%') DESC, i2.created_at ASC
         ) AS rn
  FROM wards w
  JOIN inventory_items i2
    ON i2.tenant_id = w.tenant_id AND i2.is_active = true AND i2.ward_id IS NULL AND i2.service_key IS NULL
   AND i2.drug_name ILIKE w.name || '%'
   AND (i2.drug_name ILIKE '%per night%' OR i2.drug_name ILIKE '%admission%')
)
UPDATE inventory_items i
SET ward_id = r.ward_id, service_key = 'BED_DAY'
FROM ranked r
WHERE i.id = r.id AND r.rn = 1;
