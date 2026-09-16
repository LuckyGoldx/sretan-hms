-- ============================================================
-- 102: Pharmacy units — pack / bottle / tablet / capsule
--
-- Stock (inventory_items.stock_count) is always counted in the item's BASE
-- unit (tablet, capsule, mL, test, unit). A pack/bottle is a multiple of the
-- base unit, so a sale in packs can be converted to base units for stock
-- deduction: base_quantity = quantity * units_per_pack.
--
--   base_unit     tablet | capsule | mL | sachet | unit | test ...
--   pack_label    pack | bottle | box | strip   (NULL when sold loose only)
--   units_per_pack  how many base units are in one pack (>= 1)
--   pack_price    optional price for one pack (falls back to base price x size)
--
-- otc_sales records the unit actually sold and the base quantity deducted.
-- Idempotent: safe to run on every server boot.
-- ============================================================

ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS base_unit VARCHAR(30);
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS pack_label VARCHAR(30);
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS units_per_pack INTEGER NOT NULL DEFAULT 1;
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS pack_price NUMERIC(12,2);

ALTER TABLE otc_sales ADD COLUMN IF NOT EXISTS unit VARCHAR(30);
ALTER TABLE otc_sales ADD COLUMN IF NOT EXISTS base_quantity INTEGER;

-- Default the base unit from the item's category for existing rows.
UPDATE inventory_items
   SET base_unit = CASE category
                     WHEN 'pharmacy' THEN 'unit'
                     WHEN 'lab' THEN 'test'
                     WHEN 'radiology' THEN 'procedure'
                     ELSE 'unit'
                   END
 WHERE base_unit IS NULL;

UPDATE otc_sales SET base_quantity = quantity WHERE base_quantity IS NULL;
