-- ============================================================
-- 056: Referral / specialist consultant fee
-- When a doctor transfers a patient, a specialist (consultant) fee is
-- raised on the referral and collected at paypoint before the consultant
-- attends (except emergencies).
-- Idempotent: safe to run on every server boot.
-- ============================================================

ALTER TABLE referrals ADD COLUMN IF NOT EXISTS consultant_fee DECIMAL(12,2) DEFAULT 0;
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS consultant_fee_status VARCHAR(30) DEFAULT 'pending';

CREATE INDEX IF NOT EXISTS idx_referrals_fee_status ON referrals (consultant_fee_status);
