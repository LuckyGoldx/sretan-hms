-- ============================================================
-- 114: Wards can be disabled (soft), never casually deleted
--
-- Wards get an is_active flag. Disabled wards are hidden from ward pickers and
-- cannot be used for new admissions. Deletion is restricted to Super Admin and
-- only allowed when the ward has no admission history.
--
-- Idempotent: safe to run on every server boot.
-- ============================================================

ALTER TABLE wards ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_wards_active
  ON wards (tenant_id, is_active);
