ALTER TABLE lab_results ADD COLUMN IF NOT EXISTS entered_by UUID REFERENCES staff_users(id);
