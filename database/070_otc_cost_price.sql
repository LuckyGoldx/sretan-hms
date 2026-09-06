-- ============================================================
-- 070: Cost price snapshots for true profit calculation
--
-- payment_items already carries cost_price. Pharmacy walk-in (OTC)
-- sales previously did not, so a sale could never report true profit
-- after inventory costs changed.
-- Idempotent: safe to run on every server boot.
-- ============================================================

ALTER TABLE otc_sales ADD COLUMN IF NOT EXISTS cost_price NUMERIC(12,2) NOT NULL DEFAULT 0;
