-- ============================================================
-- 085: Add the "Others" default expense category for all tenants.
--
-- Idempotent: safe to run on every server boot.
-- ============================================================

INSERT INTO expense_categories (tenant_id, name)
SELECT t.id, 'Others'
  FROM tenants t
ON CONFLICT DO NOTHING;
