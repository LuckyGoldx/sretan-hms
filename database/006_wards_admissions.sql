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
  bed_number VARCHAR(20),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER update_admissions_updated_at
  BEFORE UPDATE ON admissions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
\n\n-- Beds\nCREATE TABLE IF NOT EXISTS beds (\n  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n  ward_id UUID REFERENCES wards(id) ON DELETE CASCADE,\n  bed_number VARCHAR(20) NOT NULL,\n  created_at TIMESTAMPTZ DEFAULT NOW(),\n  UNIQUE(ward_id, bed_number)\n);\n\nINSERT INTO beds (ward_id, bed_number) \nSELECT w.id, b.bed FROM wards w CROSS JOIN (\n  VALUES ('Bed 1'),('Bed 2'),('Bed 3'),('Bed 4'),('Bed 5')\n) AS b(bed)\nON CONFLICT (ward_id, bed_number) DO NOTHING;