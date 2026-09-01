-- ============================================================
-- 062: Per-tenant number patterns for hospital / lab / ANC /
-- radiology / receipt / referral / case / auth numbers
-- Idempotent: safe to run on every server boot.
-- ============================================================

ALTER TABLE tenant_configurations ADD COLUMN IF NOT EXISTS number_pattern_hospital VARCHAR(100) DEFAULT '{prefix}-{year}-{seq:5}';
ALTER TABLE tenant_configurations ADD COLUMN IF NOT EXISTS number_pattern_lab VARCHAR(100) DEFAULT 'LAB-{year}-{seq:4}';
ALTER TABLE tenant_configurations ADD COLUMN IF NOT EXISTS number_pattern_anc VARCHAR(100) DEFAULT 'ANC-{year}-{seq:5}';
ALTER TABLE tenant_configurations ADD COLUMN IF NOT EXISTS number_pattern_radiology VARCHAR(100) DEFAULT 'RAD-{seq:5}';
ALTER TABLE tenant_configurations ADD COLUMN IF NOT EXISTS number_pattern_receipt VARCHAR(100) DEFAULT 'RCP-{yy}{month}{day}-{seq:4}';
ALTER TABLE tenant_configurations ADD COLUMN IF NOT EXISTS number_pattern_referral VARCHAR(100) DEFAULT 'REF-{year}-{seq:5}';
ALTER TABLE tenant_configurations ADD COLUMN IF NOT EXISTS number_pattern_case VARCHAR(100) DEFAULT '{provider}-{year}-{seq:5}';
ALTER TABLE tenant_configurations ADD COLUMN IF NOT EXISTS number_pattern_auth VARCHAR(100) DEFAULT 'AUTH-{year}-{seq:5}';
