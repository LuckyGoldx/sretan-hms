-- ============================================================
-- 097: One inventory catalogue — unique codes + lab catalogue link
--
-- inventory_items is the single price/quantity list used by every module
-- (pharmacy, laboratory, radiology, general services, ward bed-nights). The
-- laboratory also keeps clinical metadata in lab_test_catalog; its 25 tests had
-- no matching inventory rows, so lab billing priced them at 0 and prices could
-- drift. This links each catalog test to one inventory item (creating it when
-- missing) and gives every inventory item a unique, human-readable code.
-- Idempotent: safe to run on every server boot.
-- ============================================================

ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS code VARCHAR(30);
ALTER TABLE lab_test_catalog ADD COLUMN IF NOT EXISTS inventory_item_id UUID REFERENCES inventory_items(id) ON DELETE SET NULL;

-- 1) Link catalog tests that already have an inventory row with the same name.
UPDATE lab_test_catalog c
   SET inventory_item_id = i.id
  FROM inventory_items i
 WHERE c.inventory_item_id IS NULL
   AND i.tenant_id = c.tenant_id AND i.category = 'lab'
   AND lower(trim(i.drug_name)) = lower(trim(c.name));

-- 2) Create an inventory item for every catalog test that has none, so the
--    catalogue is single-source (price/stock live in inventory_items).
INSERT INTO inventory_items (id, tenant_id, drug_name, category, price, cost_price, amount_type, is_active, service_key)
SELECT gen_random_uuid(), c.tenant_id, c.name, 'lab',
       COALESCE(NULLIF(c.price, 0), c.default_price, 0), 0, 'tests', true, NULL
  FROM lab_test_catalog c
 WHERE NOT EXISTS (
   SELECT 1 FROM inventory_items i
    WHERE i.tenant_id = c.tenant_id AND i.category = 'lab'
      AND lower(trim(i.drug_name)) = lower(trim(c.name))
 );

-- 3) Link the newly created rows.
UPDATE lab_test_catalog c
   SET inventory_item_id = i.id
  FROM inventory_items i
 WHERE c.inventory_item_id IS NULL
   AND i.tenant_id = c.tenant_id AND i.category = 'lab'
   AND lower(trim(i.drug_name)) = lower(trim(c.name));

-- 4) Backfill a unique code per item: LAB-0001, PHA-0001, RAD-0001, GEN-0001.
WITH numbered AS (
  SELECT id,
         CASE category WHEN 'lab' THEN 'LAB' WHEN 'pharmacy' THEN 'PHA'
                       WHEN 'radiology' THEN 'RAD' ELSE 'GEN' END AS prefix,
         ROW_NUMBER() OVER (
           PARTITION BY tenant_id,
             CASE category WHEN 'lab' THEN 'LAB' WHEN 'pharmacy' THEN 'PHA'
                           WHEN 'radiology' THEN 'RAD' ELSE 'GEN' END
           ORDER BY created_at, id
         ) AS rn
    FROM inventory_items
   WHERE code IS NULL
)
UPDATE inventory_items i
   SET code = n.prefix || '-' || lpad(n.rn::text, 4, '0')
  FROM numbered n
 WHERE i.id = n.id;

CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_tenant_code
  ON inventory_items (tenant_id, code) WHERE code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lab_test_catalog_inventory_item
  ON lab_test_catalog (inventory_item_id);
