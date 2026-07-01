ALTER TABLE lab_orders ADD COLUMN IF NOT EXISTS doctor_comment TEXT;
ALTER TABLE radiology_orders ADD COLUMN IF NOT EXISTS doctor_comment TEXT;
