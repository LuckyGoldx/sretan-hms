-- ============================================================
-- 093: Ward/bed management — per-bed price override + per-tenant codes
--
-- - beds.daily_rate: optional per-bed nightly price. When set (> 0) it
--   overrides the ward's nightly rate for the days a patient occupies that
--   bed; otherwise the ward rate applies (existing behaviour).
-- - Ward codes were globally UNIQUE, which blocks two hospitals from using
--   the same short code (e.g. 'GEN'). They become optional and unique per
--   tenant instead.
-- Idempotent: safe to run on every server boot.
-- ============================================================

ALTER TABLE beds ADD COLUMN IF NOT EXISTS daily_rate NUMERIC(12,2);

ALTER TABLE wards ALTER COLUMN code DROP NOT NULL;
ALTER TABLE wards DROP CONSTRAINT IF EXISTS wards_code_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_wards_tenant_code
  ON wards (tenant_id, code) WHERE code IS NOT NULL;
