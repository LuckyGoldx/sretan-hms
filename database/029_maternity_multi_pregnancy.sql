-- Allow multiple pregnancies per patient by removing UNIQUE constraint
ALTER TABLE maternity_patients DROP CONSTRAINT IF EXISTS maternity_patients_patient_id_key;
CREATE INDEX IF NOT EXISTS idx_maternity_patients_patient_status ON maternity_patients(patient_id, status);
