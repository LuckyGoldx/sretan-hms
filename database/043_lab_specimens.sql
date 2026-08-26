-- ============================================================
-- Configurable lab specimen list (with "frequent" quick-pick flags)
-- Idempotent: safe to run on every server boot.
-- Custom specimens typed by users are saved on the order only,
-- they are NOT auto-added here (Admin curates this list).
-- ============================================================

CREATE TABLE IF NOT EXISTS lab_specimens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  is_frequent BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_lab_specimens_tenant_name
  ON lab_specimens (tenant_id, name);

-- Seed common specimens (idempotent: ON CONFLICT DO NOTHING).
INSERT INTO lab_specimens (tenant_id, name, is_frequent, sort_order)
SELECT t.id, s.name, s.is_frequent, s.sort_order
FROM tenants t
CROSS JOIN (VALUES
  ('Blood', true, 1),
  ('Serum', true, 2),
  ('Plasma', true, 3),
  ('Whole Blood', false, 4),
  ('EDTA Blood', false, 5),
  ('Capillary Blood', false, 6),
  ('Urine', true, 7),
  ('Midstream Urine', false, 8),
  ('24-hour Urine', false, 9),
  ('Stool', true, 10),
  ('Sputum', true, 11),
  ('CSF (Cerebrospinal Fluid)', true, 12),
  ('Swab', true, 13),
  ('Pus', true, 14),
  ('Pus Swab', false, 15),
  ('Wound Swab', false, 16),
  ('Throat Swab', false, 17),
  ('Nasal Swab', false, 18),
  ('Nasopharyngeal Swab', false, 19),
  ('Rectal Swab', false, 20),
  ('Urethral Swab', false, 21),
  ('Vaginal Swab', false, 22),
  ('Cervical Swab', false, 23),
  ('Endocervical Swab', false, 24),
  ('Conjunctival Swab', false, 25),
  ('Ear Swab', false, 26),
  ('Synovial Fluid', false, 27),
  ('Pleural Fluid', false, 28),
  ('Pericardial Fluid', false, 29),
  ('Ascitic Fluid', false, 30),
  ('Peritoneal Fluid', false, 31),
  ('Amniotic Fluid', false, 32),
  ('Gastric Aspirate', false, 33),
  ('Bronchoalveolar Lavage', false, 34),
  ('Semen', false, 35),
  ('Seminal Fluid', false, 36),
  ('Saliva', false, 37),
  ('Sweat', false, 38),
  ('Tears', false, 39),
  ('Hair', false, 40),
  ('Nail Clippings', false, 41),
  ('Bone Marrow', false, 42),
  ('Bone Marrow Aspirate', false, 43),
  ('Tissue Biopsy', false, 44),
  ('Fine Needle Aspirate', false, 45),
  ('Skin Scraping', false, 46),
  ('Breast Milk', false, 47),
  ('Blood Culture', false, 48),
  ('Urine Culture', false, 49),
  ('Sputum Culture', false, 50),
  ('Stool Culture', false, 51)
) AS s(name, is_frequent, sort_order)
ON CONFLICT (tenant_id, name) DO NOTHING;
