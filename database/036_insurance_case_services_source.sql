ALTER TABLE insurance_case_services ADD COLUMN IF NOT EXISTS source_type VARCHAR(50);
ALTER TABLE insurance_case_services ADD COLUMN IF NOT EXISTS source_id UUID;
CREATE INDEX IF NOT EXISTS idx_ins_case_svc_source ON insurance_case_services (case_id, source_type, source_id) WHERE source_id IS NOT NULL;
