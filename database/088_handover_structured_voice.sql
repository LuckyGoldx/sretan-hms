-- ============================================================
-- 088: Structured handover fields on nurse notes + voice notes
--
-- Lets a handover recorded in the patient chart use the same structured
-- format as the shift handover (priority, flags, SBAR, pending, contingency)
-- and attach voice recordings to any field on handovers, handover patients
-- and nurse notes.
--
-- Idempotent: safe to run on every server boot.
-- ============================================================

ALTER TABLE nurse_notes ADD COLUMN IF NOT EXISTS priority VARCHAR(20);
ALTER TABLE nurse_notes ADD COLUMN IF NOT EXISTS flags JSONB DEFAULT '[]'::jsonb;
ALTER TABLE nurse_notes ADD COLUMN IF NOT EXISTS situation TEXT;
ALTER TABLE nurse_notes ADD COLUMN IF NOT EXISTS background TEXT;
ALTER TABLE nurse_notes ADD COLUMN IF NOT EXISTS assessment TEXT;
ALTER TABLE nurse_notes ADD COLUMN IF NOT EXISTS recommendation TEXT;
ALTER TABLE nurse_notes ADD COLUMN IF NOT EXISTS pending_tasks TEXT;
ALTER TABLE nurse_notes ADD COLUMN IF NOT EXISTS contingency TEXT;
ALTER TABLE nurse_notes ADD COLUMN IF NOT EXISTS voice_notes JSONB DEFAULT '{}'::jsonb;

ALTER TABLE handovers ADD COLUMN IF NOT EXISTS voice_notes JSONB DEFAULT '{}'::jsonb;
ALTER TABLE handover_patients ADD COLUMN IF NOT EXISTS voice_notes JSONB DEFAULT '{}'::jsonb;
