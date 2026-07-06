-- Add miscarriages and baby_alive to maternity_patients
ALTER TABLE maternity_patients ADD COLUMN IF NOT EXISTS miscarriages INT DEFAULT 0;
ALTER TABLE maternity_patients ADD COLUMN IF NOT EXISTS baby_alive INT DEFAULT 0;

-- Add tribe and religion to patients
ALTER TABLE patients ADD COLUMN IF NOT EXISTS tribe VARCHAR(100);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS religion VARCHAR(100);
