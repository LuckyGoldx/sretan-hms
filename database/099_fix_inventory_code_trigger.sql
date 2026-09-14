-- ============================================================
-- 099: Repair the inventory code trigger (ambiguous variable name)
--
-- 098 created assign_inventory_item_code() using a PL/pgSQL variable named
-- `prefix`, which collided with the inventory_code_counters.prefix column in
-- "ON CONFLICT (tenant_id, prefix)" and failed inserts with
--   column reference "prefix" is ambiguous.
-- Replace the function with the corrected version. Idempotent.
-- ============================================================

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
