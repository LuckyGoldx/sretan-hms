-- ============================================================
-- CONSULTANT_ENCOUNTERS: consultant tag on encounters
-- Idempotent: safe to run on every server boot.
-- ============================================================
ALTER TABLE encounters ADD COLUMN IF NOT EXISTS is_consultation BOOLEAN DEFAULT false;
ALTER TABLE encounters ADD COLUMN IF NOT EXISTS referral_id UUID REFERENCES referrals(id) ON DELETE SET NULL;
ALTER TABLE encounters ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES departments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_encounters_referral_id ON encounters (referral_id);
