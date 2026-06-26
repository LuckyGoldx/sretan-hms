-- Enhance radiology_orders with additional columns
ALTER TABLE radiology_orders ADD COLUMN IF NOT EXISTS imaging_number VARCHAR(50);
ALTER TABLE radiology_orders ADD COLUMN IF NOT EXISTS doctor_name VARCHAR(255);
ALTER TABLE radiology_orders ADD COLUMN IF NOT EXISTS patient_name VARCHAR(255);
ALTER TABLE radiology_orders ADD COLUMN IF NOT EXISTS is_paid BOOLEAN DEFAULT false;
ALTER TABLE radiology_orders ADD COLUMN IF NOT EXISTS reported_by UUID REFERENCES staff_users(id);
ALTER TABLE radiology_orders ADD COLUMN IF NOT EXISTS reported_at TIMESTAMPTZ;
ALTER TABLE radiology_orders ADD COLUMN IF NOT EXISTS payment_id UUID;
