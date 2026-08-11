-- Insurance/HMO Module: Providers & Staff Users

CREATE TABLE IF NOT EXISTS insurance_providers (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  name VARCHAR(200) NOT NULL,
  code VARCHAR(50) UNIQUE NOT NULL,
  contact_person VARCHAR(200),
  contact_phone VARCHAR(50),
  contact_email VARCHAR(200),
  address TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS insurance_staff_users (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  provider_id UUID REFERENCES insurance_providers(id),
  full_name VARCHAR(200) NOT NULL,
  email VARCHAR(200) UNIQUE NOT NULL,
  phone VARCHAR(50),
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'viewer',
  access_scope VARCHAR(50) NOT NULL DEFAULT 'own',
  is_active BOOLEAN DEFAULT true,
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE patients ADD COLUMN IF NOT EXISTS patient_insurance_id VARCHAR(100);
