-- ============================================================
-- 057: Last consulted department history on patients
-- The current routing department is cleared on release/complete, but the
-- department where the patient was last consulted is kept permanently for
-- future reference.
-- Idempotent: safe to run on every server boot.
-- ============================================================

ALTER TABLE patients ADD COLUMN IF NOT EXISTS last_consulted_department_id UUID REFERENCES departments(id);

CREATE INDEX IF NOT EXISTS idx_patients_last_consulted_department ON patients (last_consulted_department_id);
