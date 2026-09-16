-- ============================================================
-- 105: Link an insurance-billed OTC sale to its case service line
--
-- When a Walk-in (OTC) sale is billed to insurance, the money lives on
-- insurance_case_services while otc_sales records the stock movement. Storing
-- the case-service id on the sale lets a void reverse BOTH sides (restore
-- stock and remove the claim line).
-- Idempotent: safe to run on every server boot.
-- ============================================================

ALTER TABLE otc_sales ADD COLUMN IF NOT EXISTS case_service_id UUID REFERENCES insurance_case_services(id) ON DELETE SET NULL;
