-- Add rejected_by tracking to lab_results for audit of rejected results
ALTER TABLE lab_results
  ADD COLUMN IF NOT EXISTS rejected_by UUID REFERENCES staff_users(id);
