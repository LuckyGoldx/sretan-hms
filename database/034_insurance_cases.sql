-- Insurance/HMO Module: Cases, Services, Patient Policies, Auth Requests, Co-pay Config

CREATE TABLE IF NOT EXISTS insurance_cases (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  provider_id UUID REFERENCES insurance_providers(id),
  patient_id UUID REFERENCES patients(id),
  maternity_patient_id UUID REFERENCES maternity_patients(id) NULL,
  encounter_id UUID REFERENCES encounters(id) NULL,
  admission_id UUID REFERENCES admissions(id) NULL,
  case_number VARCHAR(100) UNIQUE NOT NULL,
  auth_code VARCHAR(100),
  auth_request_id UUID NULL,
  status VARCHAR(50) DEFAULT 'active',
  coverage_start_date DATE,
  coverage_end_date DATE,
  total_billed DECIMAL(12,2) DEFAULT 0,
  total_paid DECIMAL(12,2) DEFAULT 0,
  co_pay_amount DECIMAL(12,2) DEFAULT 0,
  co_pay_collected DECIMAL(12,2) DEFAULT 0,
  auto_created BOOLEAN DEFAULT false,
  voided_at TIMESTAMPTZ,
  void_reason TEXT,
  voided_by UUID,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS insurance_case_services (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  case_id UUID REFERENCES insurance_cases(id) ON DELETE CASCADE,
  service_type VARCHAR(50) NOT NULL,
  service_name VARCHAR(300) NOT NULL,
  quantity INT DEFAULT 1,
  unit_price DECIMAL(10,2) DEFAULT 0,
  total_price DECIMAL(10,2) DEFAULT 0,
  clinical_order_id UUID NULL,
  co_pay_collected BOOLEAN DEFAULT false,
  added_by UUID,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS patient_insurance_policies (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
  provider_id UUID REFERENCES insurance_providers(id),
  policy_number VARCHAR(100) NOT NULL,
  policy_holder_name VARCHAR(200),
  relationship_to_patient VARCHAR(50),
  coverage_type VARCHAR(50) DEFAULT 'primary',
  is_active BOOLEAN DEFAULT true,
  start_date DATE,
  end_date DATE,
  co_pay_percentage DECIMAL(5,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS insurance_auth_requests (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  provider_id UUID REFERENCES insurance_providers(id),
  patient_id UUID REFERENCES patients(id),
  case_id UUID REFERENCES insurance_cases(id) NULL,
  request_number VARCHAR(100) UNIQUE NOT NULL,
  status VARCHAR(50) DEFAULT 'requested',
  auth_code VARCHAR(100) NULL,
  requested_services TEXT,
  estimated_amount DECIMAL(12,2),
  authorized_amount DECIMAL(12,2) NULL,
  clinical_justification TEXT,
  validity_start_date DATE NULL,
  validity_end_date DATE NULL,
  response_notes TEXT NULL,
  requested_by UUID,
  responded_by UUID NULL,
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  responded_at TIMESTAMPTZ NULL
);

CREATE TABLE IF NOT EXISTS insurance_provider_co_pay_config (
  id UUID PRIMARY KEY,
  provider_id UUID REFERENCES insurance_providers(id) ON DELETE CASCADE,
  calculation_method VARCHAR(50) NOT NULL DEFAULT 'percentage',
  percentage_value DECIMAL(5,2) DEFAULT 0,
  fixed_amount DECIMAL(10,2) DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  updated_by UUID,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS insurance_excluded_services (
  id UUID PRIMARY KEY,
  provider_id UUID REFERENCES insurance_providers(id) ON DELETE CASCADE,
  service_type VARCHAR(50) NOT NULL,
  service_name VARCHAR(300) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS insurance_invoices (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  provider_id UUID REFERENCES insurance_providers(id),
  invoice_number VARCHAR(100) UNIQUE NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status VARCHAR(50) DEFAULT 'draft',
  total_amount DECIMAL(12,2) DEFAULT 0,
  paid_amount DECIMAL(12,2) DEFAULT 0,
  due_date DATE,
  generated_by UUID,
  claim_submitted_at TIMESTAMPTZ,
  claim_acknowledged_at TIMESTAMPTZ,
  claim_reference VARCHAR(100),
  expected_payment_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS insurance_invoice_items (
  id UUID PRIMARY KEY,
  invoice_id UUID REFERENCES insurance_invoices(id) ON DELETE CASCADE,
  case_id UUID REFERENCES insurance_cases(id),
  service_type VARCHAR(50),
  description TEXT,
  quantity INT,
  unit_price DECIMAL(10,2),
  total_price DECIMAL(10,2)
);

-- Add updated_at trigger for insurance_cases
CREATE OR REPLACE FUNCTION update_insurance_cases_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS update_insurance_cases_updated_at ON insurance_cases;
CREATE TRIGGER update_insurance_cases_updated_at BEFORE UPDATE ON insurance_cases
  FOR EACH ROW EXECUTE FUNCTION update_insurance_cases_updated_at();
