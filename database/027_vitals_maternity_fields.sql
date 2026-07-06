-- Add maternity-specific fields to vitals table
ALTER TABLE vitals
  ADD COLUMN IF NOT EXISTS fundal_height DECIMAL(5,2),
  ADD COLUMN IF NOT EXISTS fetal_presentation VARCHAR(50),
  ADD COLUMN IF NOT EXISTS urine_protein VARCHAR(20),
  ADD COLUMN IF NOT EXISTS urine_glucose VARCHAR(20),
  ADD COLUMN IF NOT EXISTS hemoglobin DECIMAL(5,2),
  ADD COLUMN IF NOT EXISTS pcv DECIMAL(5,2),
  ADD COLUMN IF NOT EXISTS gestational_age_weeks INT,
  ADD COLUMN IF NOT EXISTS tt_dose VARCHAR(20);
