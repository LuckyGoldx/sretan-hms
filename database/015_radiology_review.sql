ALTER TABLE radiology_orders ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES staff_users(id);
ALTER TABLE radiology_orders ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE radiology_orders ADD COLUMN IF NOT EXISTS results_collected_at TIMESTAMPTZ;
ALTER TABLE radiology_orders ADD COLUMN IF NOT EXISTS results_collected_by UUID REFERENCES staff_users(id);
