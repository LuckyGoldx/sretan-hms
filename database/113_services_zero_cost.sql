-- ============================================================
-- 113: Services have no cost price
--
-- General inventory items are flat services (consultations, procedures,
-- maternity, admissions, misc.). They are not stock and carry no cost basis,
-- so cost_price is always 0. Pharmacy/Lab/Radiology keep real cost prices for
-- profit reporting. Server also forces 0 on create/update for category general.
--
-- Idempotent: safe to run on every server boot.
-- ============================================================

UPDATE inventory_items
   SET cost_price = 0
 WHERE category = 'general'
   AND COALESCE(cost_price, 0) <> 0;
