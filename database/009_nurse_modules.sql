-- Nurse Clinical Notes
CREATE TABLE IF NOT EXISTS nurse_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
  staff_id UUID REFERENCES staff_users(id),
  note_type VARCHAR(50) DEFAULT 'general',
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER update_nurse_notes_updated_at
  BEFORE UPDATE ON nurse_notes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Treatments administered
CREATE TABLE IF NOT EXISTS treatments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
  encounter_id UUID REFERENCES encounters(id) ON DELETE CASCADE,
  staff_id UUID REFERENCES staff_users(id),
  treatment VARCHAR(255) NOT NULL,
  dosage VARCHAR(100),
  route VARCHAR(50),
  frequency VARCHAR(100),
  notes TEXT,
  administered_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER update_treatments_updated_at
  BEFORE UPDATE ON treatments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Fluid balance tracking
CREATE TABLE IF NOT EXISTS fluid_balance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
  encounter_id UUID REFERENCES encounters(id) ON DELETE CASCADE,
  staff_id UUID REFERENCES staff_users(id),
  fluid_type VARCHAR(100),
  intake_ml DECIMAL(10,2) DEFAULT 0,
  output_ml DECIMAL(10,2) DEFAULT 0,
  route VARCHAR(50),
  notes TEXT,
  recorded_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
