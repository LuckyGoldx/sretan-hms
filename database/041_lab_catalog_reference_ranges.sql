-- Add default reference ranges to lab test catalog
-- These provide baseline reference ranges when ordering a test; per-result
-- ranges can still be overridden during result entry.
ALTER TABLE lab_test_catalog
  ADD COLUMN IF NOT EXISTS reference_range_low VARCHAR(50),
  ADD COLUMN IF NOT EXISTS reference_range_high VARCHAR(50),
  ADD COLUMN IF NOT EXISTS reference_range_text VARCHAR(255);
