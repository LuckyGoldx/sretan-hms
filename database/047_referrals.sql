-- ============================================================
-- REFERRALS: GP → department/consultant referral records
-- Idempotent: safe to run on every server boot.
-- ============================================================
CREATE TABLE IF NOT EXISTS referrals (
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_number VARCHAR(50),
  patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
  referred_by UUID REFERENCES staff_users(id),
  from_department_id UUID REFERENCES departments(id),
  to_department_id UUID REFERENCES departments(id),
  to_consultant_id UUID REFERENCES staff_users(id),
  reason TEXT,
  priority VARCHAR(20) DEFAULT 'routine',
  status VARCHAR(30) DEFAULT 'pending',
  referral_notes TEXT,
  accepted_at TIMESTAMPTZ,
  accepted_by UUID REFERENCES staff_users(id),
  completed_at TIMESTAMPTZ,
  completed_by UUID REFERENCES staff_users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  is_synced BOOLEAN DEFAULT false,
  last_synced_at TIMESTAMPTZ
);

CREATE TRIGGER update_referrals_updated_at
  BEFORE UPDATE ON referrals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_referrals_patient_id ON referrals (patient_id);
CREATE INDEX IF NOT EXISTS idx_referrals_to_department ON referrals (to_department_id);
CREATE INDEX IF NOT EXISTS idx_referrals_status ON referrals (status);
