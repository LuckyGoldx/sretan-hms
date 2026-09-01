-- ============================================================
-- DEPARTMENTS: referral targets / consultant home
-- Idempotent: safe to run on every server boot.
-- ============================================================
CREATE TABLE IF NOT EXISTS departments (
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  code VARCHAR(20),
  description TEXT,
  modules JSONB DEFAULT '[]',
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  is_synced BOOLEAN DEFAULT false,
  last_synced_at TIMESTAMPTZ,
  UNIQUE (tenant_id, name)
);

CREATE TRIGGER update_departments_updated_at
  BEFORE UPDATE ON departments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Seed departments for every tenant (idempotent: ON CONFLICT DO NOTHING).
-- O&G (Gynae & Obstetrics) is granted the "maternity" module.
INSERT INTO departments (tenant_id, name, code, description, modules)
SELECT t.id, d.name, d.code, d.description, d.modules
FROM tenants t
CROSS JOIN (VALUES
  ('General Medicine', 'MED', 'Internal medicine and general consultation', '[]'::jsonb),
  ('Paediatrics', 'PED', 'Child and adolescent care', '[]'::jsonb),
  ('Gynae & Obstetrics', 'O&G', 'Women health, antenatal, labour and delivery', '["maternity"]'::jsonb),
  ('Surgery', 'SUR', 'General and specialty surgery', '[]'::jsonb),
  ('Orthopaedics', 'ORT', 'Bones, joints and musculoskeletal care', '[]'::jsonb),
  ('ENT', 'ENT', 'Ear, nose and throat care', '[]'::jsonb),
  ('Ophthalmology', 'OPH', 'Eye care and vision', '[]'::jsonb),
  ('Cardiology', 'CAR', 'Heart and cardiovascular care', '[]'::jsonb),
  ('Neurology', 'NEU', 'Brain and nervous system care', '[]'::jsonb),
  ('Dermatology', 'DER', 'Skin care', '[]'::jsonb),
  ('Psychiatry', 'PSY', 'Mental health care', '[]'::jsonb),
  ('Urology', 'URO', 'Urinary tract and male reproductive care', '[]'::jsonb)
) AS d(name, code, description, modules)
ON CONFLICT (tenant_id, name) DO NOTHING;
