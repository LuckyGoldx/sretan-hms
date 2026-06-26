ALTER TABLE lab_orders ADD COLUMN IF NOT EXISTS results_collected_by UUID REFERENCES staff_users(id);
