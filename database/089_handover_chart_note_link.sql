-- ============================================================
-- 089: Link each handover patient entry to the handover note it created
--      on the patient's chart (for idempotent backfill).
--
-- Idempotent: safe to run on every server boot.
-- ============================================================

ALTER TABLE handover_patients ADD COLUMN IF NOT EXISTS chart_note_id UUID;
