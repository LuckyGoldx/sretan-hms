-- ============================================================
-- 103: Carton tier for pharmacy inventory
--
-- Units are three tiers, all convertible to the BASE unit (stock is always
-- counted and deducted in base units):
--   unit  (tablet / capsule / mL)          -> 1 base unit
--   pack  (strip / pack)  units_per_pack   -> base units per pack
--   carton (carton / box) units_per_carton -> base units per carton
--
-- Each tier can carry its own price (pack_price, carton_price); when blank the
-- price is derived from the base price.
-- Idempotent: safe to run on every server boot.
-- ============================================================

ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS carton_label VARCHAR(30);
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS units_per_carton INTEGER;
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS carton_price NUMERIC(12,2);
