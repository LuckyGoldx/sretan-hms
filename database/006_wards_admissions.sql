-- Wards
CREATE TABLE IF NOT EXISTS wards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  code VARCHAR(20) NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO wards (name, code, description) VALUES
  ('General Ward', 'GEN', 'General medical ward'),
  ('Maternity Ward', 'MAT', 'Obstetrics and maternity care'),
  ('Pediatric Ward', 'PED', 'Children and infants'),
  ('ICU', 'ICU', 'Intensive Care Unit'),
  ('Surgical Ward', 'SURG', 'Pre and post-operative care'),
  ('Isolation Ward', 'ISO', 'Infectious disease isolation')
ON CONFLICT (code) DO NOTHING;

-- Admissions
CREATE TABLE IF NOT EXISTS admissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
  ward_id UUID REFERENCES wards(id) ON DELETE CASCADE,
  admitted_at TIMESTAMPTZ DEFAULT NOW(),
  discharged_at TIMESTAMPTZ,
  status VARCHAR(20) DEFAULT 'active',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER update_admissions_updated_at
  BEFORE UPDATE ON admissions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
