-- ============================================================
-- ENCOUNTER NOTES: multiple SOAP notes per encounter (Option A)
-- Fixes: writing a consultation twice in a day overwrites the old note.
-- Each "Save SOAP" creates a new note row under the same encounter.
-- Idempotent: safe to run on every server boot.
-- ============================================================
CREATE TABLE IF NOT EXISTS encounter_notes (
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  encounter_id UUID REFERENCES encounters(id) ON DELETE CASCADE,
  staff_id UUID REFERENCES staff_users(id) ON DELETE SET NULL,
  chief_complaint TEXT,
  soap_notes JSONB,
  diagnoses JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  is_synced BOOLEAN DEFAULT false,
  last_synced_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_encounter_notes_encounter_id
  ON encounter_notes (encounter_id, created_at ASC);

-- Backfill: copy existing encounters.soap_notes into encounter_notes
-- as the first note per encounter (idempotent: NOT EXISTS guard).
INSERT INTO encounter_notes (tenant_id, encounter_id, staff_id, chief_complaint, soap_notes, diagnoses, created_at, updated_at)
SELECT e.tenant_id, e.id, e.staff_id, e.chief_complaint, e.soap_notes, e.diagnoses, e.created_at, e.updated_at
FROM encounters e
WHERE e.soap_notes IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM encounter_notes n WHERE n.encounter_id = e.id
  );
