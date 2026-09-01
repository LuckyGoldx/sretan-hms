-- ============================================================
-- 054: Patient assignment + per-check-in visits (consultation billing)
-- Phase A/B foundation from PATIENT_FLOW_AND_PAYMENT_ANALYSIS.md
-- Idempotent: safe to run on every server boot.
-- ============================================================

-- Explicit clinical assignment (separate from insurance provider).
ALTER TABLE patients ADD COLUMN IF NOT EXISTS assigned_doctor_id UUID REFERENCES staff_users(id);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS primary_doctor_id UUID REFERENCES staff_users(id);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES departments(id);

CREATE INDEX IF NOT EXISTS idx_patients_assigned_doctor ON patients (assigned_doctor_id);
CREATE INDEX IF NOT EXISTS idx_patients_primary_doctor ON patients (primary_doctor_id);
CREATE INDEX IF NOT EXISTS idx_patients_department ON patients (department_id);

-- Visit / episode per check-in: supports repeat visits + per-visit consultation billing.
CREATE TABLE IF NOT EXISTS visits (
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  assigned_doctor_id UUID REFERENCES staff_users(id),
  department_id UUID REFERENCES departments(id),
  visit_type VARCHAR(30) NOT NULL DEFAULT 'new',       -- new | follow_up | review
  status VARCHAR(30) NOT NULL DEFAULT 'waiting',        -- waiting | with_doctor | completed | discharged
  consultation_fee DECIMAL(12,2) DEFAULT 0,
  consultation_status VARCHAR(30) DEFAULT 'pending',    -- pending | paid | insurance_authorized | waived | unpaid
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  is_synced BOOLEAN DEFAULT false,
  last_synced_at TIMESTAMPTZ
);

CREATE TRIGGER update_visits_updated_at
  BEFORE UPDATE ON visits
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_visits_patient ON visits (patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_visits_doctor ON visits (assigned_doctor_id, status);
CREATE INDEX IF NOT EXISTS idx_visits_status ON visits (status, created_at DESC);
