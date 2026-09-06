-- ============================================================
-- 067: Discharge summary & instructions on admissions
-- Doctors write a comprehensive discharge summary at discharge,
-- viewable later from the admission history.
-- Idempotent: safe to run on every server boot.
-- ============================================================

ALTER TABLE admissions ADD COLUMN IF NOT EXISTS discharge_summary TEXT;
ALTER TABLE admissions ADD COLUMN IF NOT EXISTS discharge_instructions TEXT;
