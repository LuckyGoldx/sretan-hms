-- ============================================================
-- 117: Purchase order payments — receipt + manual status
--
-- Payments can carry an uploaded receipt (POS / bank deposit / transfer) and an
-- order's status can be set manually (paid, partially paid) when a payment was
-- settled outside the system. status_source='manual' stops the automatic
-- payment-derived status from overwriting a manual choice until a new payment
-- is recorded.
--
-- Idempotent: safe to run on every server boot.
-- ============================================================

ALTER TABLE purchase_order_payments ADD COLUMN IF NOT EXISTS receipt_url TEXT;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS status_source VARCHAR(10) NOT NULL DEFAULT 'auto';
