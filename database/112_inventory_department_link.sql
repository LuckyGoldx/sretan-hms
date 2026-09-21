-- ============================================================
-- 112: Link inventory items (services) to a real department
--
-- Services previously stored their department as free text in the reused
-- `supplier` column, so renaming a department never updated them. Add a proper
-- department_id FK; the department NAME is resolved by join at read time, so it
-- follows renames. `supplier` stays for pharmacy drug suppliers and as a legacy
-- fallback for services ("General" or pre-migration free text).
--
-- Idempotent: safe to run on every server boot.
-- ============================================================

ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES departments(id);

-- Backfill: link items whose current supplier text matches a department name.
UPDATE inventory_items i
   SET department_id = d.id
  FROM departments d
 WHERE i.tenant_id = d.tenant_id
   AND i.department_id IS NULL
   AND i.supplier IS NOT NULL
   AND lower(trim(i.supplier)) = lower(trim(d.name));

CREATE INDEX IF NOT EXISTS idx_inventory_items_department
  ON inventory_items (department_id)
  WHERE department_id IS NOT NULL;
