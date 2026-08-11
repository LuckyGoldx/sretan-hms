CREATE TABLE IF NOT EXISTS insurance_provider_coverage_rules (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  provider_id UUID REFERENCES insurance_providers(id) ON DELETE CASCADE,
  service_type VARCHAR(50) NOT NULL,
  inventory_item_id UUID NULL,
  coverage_percentage DECIMAL(5,2) NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (provider_id, service_type, inventory_item_id)
);

CREATE INDEX IF NOT EXISTS idx_cov_rules_provider ON insurance_provider_coverage_rules (provider_id, service_type);

ALTER TABLE insurance_providers ADD COLUMN IF NOT EXISTS default_coverage_pct DECIMAL(5,2) DEFAULT 100;
