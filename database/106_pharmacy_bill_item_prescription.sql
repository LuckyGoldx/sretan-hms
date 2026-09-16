-- ============================================================
-- 106: One pharmacy bill can cover several prescriptions
--
-- A consultation may prescribe several drugs. Instead of one bill per
-- prescription, a bill's LINES now each remember which prescription they came
-- from, so a single bill (and a single Paypoint payment) can settle all of a
-- patient's prescriptions. Paying the bill marks every linked prescription
-- paid; cancelling it returns them to the pharmacy queue.
-- Idempotent: safe to run on every server boot.
-- ============================================================

ALTER TABLE pharmacy_bill_items ADD COLUMN IF NOT EXISTS prescription_id UUID REFERENCES prescriptions(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_pharmacy_bill_items_rx ON pharmacy_bill_items (prescription_id);
