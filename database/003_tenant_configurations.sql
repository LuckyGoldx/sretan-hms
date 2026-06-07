-- Sretan EMR: Superadmin Tenant Configurations Schema
-- Centralized configuration for multi-tenant deployment management

CREATE TABLE IF NOT EXISTS tenant_configurations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  hospital_name VARCHAR(255) NOT NULL,
  address TEXT NOT NULL,
  phone_number VARCHAR(50),
  logo_url TEXT,
  currency_symbol VARCHAR(10) DEFAULT '₦',
  primary_brand_color VARCHAR(30) DEFAULT '#2563eb',
  secondary_brand_color VARCHAR(30) DEFAULT '#10b981',
  ui_theme_class VARCHAR(50) DEFAULT 'theme-trust-blue',
  deployment_mode VARCHAR(50) DEFAULT 'CLOUD_SAAS',
  cloud_sync_enabled BOOLEAN DEFAULT TRUE,
  private_supabase_url TEXT DEFAULT NULL,
  private_supabase_anon_key TEXT DEFAULT NULL,
  module_records BOOLEAN DEFAULT TRUE,
  module_triage BOOLEAN DEFAULT TRUE,
  module_consultation BOOLEAN DEFAULT TRUE,
  module_laboratory BOOLEAN DEFAULT FALSE,
  module_pharmacy BOOLEAN DEFAULT FALSE,
  module_radiology BOOLEAN DEFAULT FALSE,
  module_finance_hmo BOOLEAN DEFAULT FALSE,
  license_expiration_date TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger: Auto-update updated_at
CREATE TRIGGER update_tenant_configurations_updated_at
  BEFORE UPDATE ON tenant_configurations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

