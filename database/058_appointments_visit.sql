-- ============================================================
-- 058: Appointments → consultation visit link
-- Booking an appointment raises the consultation charge (visit) for the patient,
-- linked to the appointment so payment + completion drive the appointment status.
-- Idempotent: safe to run on every server boot.
-- ============================================================

ALTER TABLE appointments ADD COLUMN IF NOT EXISTS visit_id UUID REFERENCES visits(id);
ALTER TABLE visits ADD COLUMN IF NOT EXISTS remarks VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_appointments_visit ON appointments (visit_id);
