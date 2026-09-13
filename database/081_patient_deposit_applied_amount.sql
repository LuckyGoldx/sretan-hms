-- ============================================================
-- 081: Track how much of each deposit has been applied to bills
--
-- Deposits held on account are now applied to outstanding items (oldest /
-- first items first) as soon as they are received. `applied_amount` records
-- how much of a deposit has been consumed; the remainder stays 'held'.
--
-- Idempotent: safe to run on every server boot.
-- ============================================================

ALTER TABLE patient_deposits ADD COLUMN IF NOT EXISTS applied_amount NUMERIC(12,2) DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_patient_deposits_held
  ON patient_deposits (tenant_id, patient_id)
  WHERE status = 'held';
