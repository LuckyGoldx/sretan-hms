-- ============================================================
-- 068: Per-ward bed rates in Inventory (single source)
--
-- Each ward must have a 'general' inventory service item used for
-- bed billing. Day 1 of an admission is charged as the "Admission
-- Fee — <ward>" (unlocks the bed). Every following started 24h
-- period (anchored at the doctor's admission time) accrues another
-- day at the SAME item price until discharge.
--
-- This migration creates the missing per-ward items (Female, Male,
-- Pediatric, Surgical, Isolation). Prices are editable afterwards in
-- Inventory Manager / Service Inventory by an admin.
-- Idempotent: safe to run on every server boot.
-- ============================================================

INSERT INTO inventory_items (tenant_id, drug_name, category, price, amount_type, is_active)
SELECT w.tenant_id,
       (w.name || ' Admission (Per Night)') AS drug_name,
       'general',
       CASE w.name
         WHEN 'Female Ward'   THEN 8000
         WHEN 'Male Ward'     THEN 8000
         WHEN 'Pediatric Ward' THEN 9000
         WHEN 'Surgical Ward' THEN 12000
         WHEN 'Isolation Ward' THEN 15000
         ELSE 10000
       END,
       'units',
       true
FROM wards w
WHERE w.name IN ('Female Ward', 'Male Ward', 'Pediatric Ward', 'Surgical Ward', 'Isolation Ward')
  AND NOT EXISTS (
    SELECT 1 FROM inventory_items i
    WHERE i.tenant_id = w.tenant_id
      AND i.category = 'general'
      AND i.is_active = true
      AND i.drug_name ILIKE '%' || w.name || '%'
      AND (i.drug_name ILIKE '%per night%' OR i.drug_name ILIKE '%admission%')
  );
