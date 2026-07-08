-- Add booking code to maternity_patients for per-pregnancy tracking
ALTER TABLE maternity_patients ADD COLUMN IF NOT EXISTS booking_code VARCHAR(50);

-- Add maternity_patient_id to encounters so orders/prescriptions trace to a pregnancy
ALTER TABLE encounters ADD COLUMN IF NOT EXISTS maternity_patient_id UUID REFERENCES maternity_patients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_encounters_maternity_patient_id ON encounters(maternity_patient_id);
CREATE INDEX IF NOT EXISTS idx_maternity_patients_booking_code ON maternity_patients(booking_code);
