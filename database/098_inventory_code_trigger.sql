-- ============================================================
-- 098: Guarantee a unique inventory code on every insert
--
-- Application code generated codes on some paths only, so a future or
-- forgotten insert (e.g. purchase orders) could create an item with no code.
-- A per-tenant counter + BEFORE INSERT trigger now assigns a unique,
-- category-prefixed code (LAB/PHA/RAD/GEN-0001) to any row inserted without
-- one. The counter upsert takes a row lock, so concurrent inserts cannot
-- collide. Idempotent: safe to run on every server boot.
-- ============================================================

CREATE TABLE IF NOT EXISTS inventory_code_counters (
  tenant_id UUID NOT NULL,
  prefix VARCHAR(6) NOT NULL,
  last_value INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, prefix)
);

-- Seed the counters from the highest code already in use (e.g. PHA-0020 -> 20).
INSERT INTO inventory_code_counters (tenant_id, prefix, last_value)
SELECT tenant_id,
       split_part(code, '-', 1) AS prefix,
       MAX(COALESCE(NULLIF(regexp_replace(split_part(code, '-', 2), '\D', '', 'g'), ''), '0')::int) AS last_value
  FROM inventory_items
 WHERE code IS NOT NULL AND code <> ''
 GROUP BY tenant_id, split_part(code, '-', 1)
ON CONFLICT (tenant_id, prefix)
DO UPDATE SET last_value = GREATEST(inventory_code_counters.last_value, EXCLUDED.last_value);

CREATE OR REPLACE FUNCTION assign_inventory_item_code() RETURNS trigger AS $$
DECLARE
  v_prefix TEXT;
  v_n INTEGER;
BEGIN
  IF NEW.code IS NULL OR NEW.code = '' THEN
    v_prefix := CASE lower(COALESCE(NEW.category, ''))
                  WHEN 'lab' THEN 'LAB'
                  WHEN 'pharmacy' THEN 'PHA'
                  WHEN 'radiology' THEN 'RAD'
                  ELSE 'GEN'
                END;
    INSERT INTO inventory_code_counters (tenant_id, prefix, last_value)
    VALUES (NEW.tenant_id, v_prefix, 1)
    ON CONFLICT (tenant_id, prefix)
    DO UPDATE SET last_value = inventory_code_counters.last_value + 1
    RETURNING last_value INTO v_n;
    NEW.code := v_prefix || '-' || lpad(v_n::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_inventory_item_code ON inventory_items;
CREATE TRIGGER set_inventory_item_code
  BEFORE INSERT ON inventory_items
  FOR EACH ROW EXECUTE FUNCTION assign_inventory_item_code();
