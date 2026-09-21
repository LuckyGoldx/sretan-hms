-- ============================================================
-- 115: Pharmacy bills record when they were paid
--
-- "Paid / Dispense" (Pharmacy Bills) and the Dispensing queue must show the
-- most recently PAID bills first. Until now only created_at existed, so paid
-- order could not be represented. Add paid_at and backfill existing paid bills
-- from updated_at (the closest available timestamp).
--
-- Idempotent: safe to run on every server boot.
-- ============================================================

ALTER TABLE pharmacy_bills ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

UPDATE pharmacy_bills
   SET paid_at = updated_at
 WHERE paid_at IS NULL
   AND status IN ('paid', 'dispensed', 'partially_dispensed');

CREATE INDEX IF NOT EXISTS idx_pharmacy_bills_paid_at
  ON pharmacy_bills (tenant_id, paid_at DESC);
