-- ============================================================
-- 083: Patient spouse / partner details
--
-- Captured during registration when marital status is "Married".
--
-- Idempotent: safe to run on every server boot.
-- ============================================================

ALTER TABLE patients ADD COLUMN IF NOT EXISTS spouse_name VARCHAR(255);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS spouse_sex VARCHAR(20);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS spouse_phone VARCHAR(30);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS spouse_occupation VARCHAR(150);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS spouse_address TEXT;
