-- 110: Insurance co-pay receipt split
--
-- Persist the insurer/patient split and the insurance provenance on the patient
-- receipt, so a co-pay receipt can show what each item actually cost, how much
-- the insurance paid and how much the patient paid.
--
-- Cash accounting is unchanged: payments.total_amount stays the patient portion
-- actually collected. The insurer amount is an informational claim figure and
-- must never be added to total_amount.

ALTER TABLE payments ADD COLUMN IF NOT EXISTS insurance_case_id UUID;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS insurance_provider_id UUID;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS insurance_provider_name VARCHAR(200);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS insurance_case_number VARCHAR(100);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS insurance_amount NUMERIC(12,2) DEFAULT 0;

ALTER TABLE payment_items ADD COLUMN IF NOT EXISTS insurance_amount NUMERIC(12,2) DEFAULT 0;
ALTER TABLE payment_items ADD COLUMN IF NOT EXISTS line_total NUMERIC(12,2) DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_payments_insurance_case ON payments (insurance_case_id);
