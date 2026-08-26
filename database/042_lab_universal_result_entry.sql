-- ============================================================
-- Universal Lab Result Entry - schema + metadata seed
-- Idempotent: safe to run on every server boot.
-- ============================================================

-- 1) lab_test_catalog: per-test input metadata
ALTER TABLE lab_test_catalog
  ADD COLUMN IF NOT EXISTS result_type VARCHAR(20) DEFAULT 'numeric',
  ADD COLUMN IF NOT EXISTS unit VARCHAR(50),
  ADD COLUMN IF NOT EXISTS allowed_values JSONB,
  ADD COLUMN IF NOT EXISTS abnormal_values JSONB,
  ADD COLUMN IF NOT EXISTS loinc VARCHAR(20),
  ADD COLUMN IF NOT EXISTS is_panel BOOLEAN DEFAULT false;

-- 2) lab_results: per-analyte result metadata
ALTER TABLE lab_results
  ADD COLUMN IF NOT EXISTS result_type VARCHAR(20) DEFAULT 'numeric',
  ADD COLUMN IF NOT EXISTS unit VARCHAR(50),
  ADD COLUMN IF NOT EXISTS numeric_value NUMERIC,
  ADD COLUMN IF NOT EXISTS ref_range_text VARCHAR(255),
  ADD COLUMN IF NOT EXISTS flag_status VARCHAR(20) DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS remarks TEXT,
  ADD COLUMN IF NOT EXISTS method VARCHAR(100),
  ADD COLUMN IF NOT EXISTS entered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;

-- 3) lab_orders: report-level fields
ALTER TABLE lab_orders
  ADD COLUMN IF NOT EXISTS remarks TEXT,
  ADD COLUMN IF NOT EXISTS report_notes TEXT,
  ADD COLUMN IF NOT EXISTS method VARCHAR(100);

-- 4) lab_panels: predefined analyte lists for panel tests
CREATE TABLE IF NOT EXISTS lab_panels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  catalog_id UUID REFERENCES lab_test_catalog(id) ON DELETE CASCADE,
  analyte_name VARCHAR(255) NOT NULL,
  result_type VARCHAR(20) DEFAULT 'numeric',
  unit VARCHAR(50),
  reference_range_low VARCHAR(50),
  reference_range_high VARCHAR(50),
  reference_range_text VARCHAR(255),
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_lab_panels_catalog_analyte
  ON lab_panels (catalog_id, analyte_name);

-- ============================================================
-- Catalog metadata seed (idempotent UPDATEs + ON CONFLICT inserts)
-- ============================================================

-- Numeric tests (mg/dL) with reference ranges
UPDATE lab_test_catalog SET
  result_type='numeric', unit='mg/dL',
  reference_range_low='70', reference_range_high='110',
  reference_range_text='70 - 110 mg/dL (Fasting)'
WHERE name ILIKE '%Blood Glucose (Fasting)%';

UPDATE lab_test_catalog SET
  result_type='numeric', unit='mg/dL',
  reference_range_low='70', reference_range_high='140',
  reference_range_text='70 - 140 mg/dL (Random)'
WHERE name ILIKE '%Blood Glucose (Random)%';

UPDATE lab_test_catalog SET result_type='numeric', unit='mg/L',
  reference_range_low='0', reference_range_high='5', reference_range_text='< 5 mg/L'
WHERE name ILIKE '%CRP%';

UPDATE lab_test_catalog SET result_type='numeric', unit='mm/hr',
  reference_range_low='0', reference_range_high='20', reference_range_text='0 - 20 mm/hr (Westergren)'
WHERE name ILIKE '%ESR%';

-- Qualitative / categorical tests
UPDATE lab_test_catalog SET result_type='qualitative', unit=NULL,
  allowed_values='["Non-Reactive","Reactive"]'::jsonb,
  abnormal_values='["Reactive"]'::jsonb,
  reference_range_low=NULL, reference_range_high=NULL, reference_range_text='Non-Reactive'
WHERE name ILIKE '%HIV%' OR name ILIKE '%HBsAg%' OR name ILIKE '%Anti-HCV%' OR name ILIKE '%Typhoid%';

UPDATE lab_test_catalog SET result_type='qualitative', unit=NULL,
  allowed_values='["Negative","+","1+","2+","3+","4+"]'::jsonb,
  abnormal_values='["1+","2+","3+","4+"]'::jsonb,
  reference_range_low=NULL, reference_range_high=NULL, reference_range_text='Negative'
WHERE name ILIKE '%Malaria%';

UPDATE lab_test_catalog SET result_type='qualitative', unit=NULL,
  allowed_values='["Negative","Positive"]'::jsonb,
  abnormal_values='["Positive"]'::jsonb,
  reference_range_low=NULL, reference_range_high=NULL, reference_range_text='Negative'
WHERE name ILIKE '%Pregnancy%';

UPDATE lab_test_catalog SET result_type='qualitative', unit=NULL,
  allowed_values='["O+","O-","A+","A-","B+","B-","AB+","AB-"]'::jsonb,
  abnormal_values='[]'::jsonb,
  reference_range_low=NULL, reference_range_high=NULL, reference_range_text=''
WHERE name ILIKE '%Blood Group%';

UPDATE lab_test_catalog SET result_type='qualitative', unit=NULL,
  allowed_values='["Negative","AS","SS","SC","CC"]'::jsonb,
  abnormal_values='["AS","SS","SC","CC"]'::jsonb,
  reference_range_low=NULL, reference_range_high=NULL, reference_range_text='Negative'
WHERE name ILIKE '%Sickling%';

-- Ratio / titer tests
UPDATE lab_test_catalog SET result_type='ratio', unit=NULL,
  allowed_values='["Non-Reactive","Reactive","1:2","1:4","1:8","1:16","1:32","1:64","1:128"]'::jsonb,
  abnormal_values='["1:16","1:32","1:64","1:128"]'::jsonb,
  reference_range_low=NULL, reference_range_high=NULL, reference_range_text='Non-Reactive / < 1:16'
WHERE name ILIKE '%VDRL%' OR name ILIKE '%Widal%';

-- Panel tests (multi-analyte). Marker set so the client can prefill.
UPDATE lab_test_catalog SET is_panel=true, result_type='numeric'
WHERE name ILIKE '%Complete Blood Count%' OR name ILIKE '%Liver Function%'
   OR name ILIKE '%Renal Function%' OR name ILIKE '%Lipid Profile%'
   OR name ILIKE '%Urinalysis%' OR name ILIKE '%Electrolytes%'
   OR name ILIKE '%Coagulation%' OR name ILIKE '%CSF Analysis%'
   OR name ILIKE '%Stool Analysis%';

-- Common panels (analyte lists). Insert once per (catalog, analyte).
INSERT INTO lab_panels (catalog_id, analyte_name, result_type, unit, reference_range_low, reference_range_high, reference_range_text, sort_order)
SELECT c.id, p.analyte_name, p.result_type, p.unit, p.reference_range_low, p.reference_range_high, p.reference_range_text, p.sort_order
FROM lab_test_catalog c
JOIN (VALUES
  ('Complete Blood Count (CBC)', 'White Blood Cells', 'numeric', 'x10^3/uL', '4.0', '11.0', '4.0 - 11.0', 1),
  ('Complete Blood Count (CBC)', 'Red Blood Cells', 'numeric', 'x10^6/uL', '4.5', '5.5', '4.5 - 5.5', 2),
  ('Complete Blood Count (CBC)', 'Hemoglobin', 'numeric', 'g/dL', '13.0', '17.0', '13.0 - 17.0', 3),
  ('Complete Blood Count (CBC)', 'Hematocrit', 'numeric', '%', '40', '52', '40 - 52', 4),
  ('Complete Blood Count (CBC)', 'Platelets', 'numeric', 'x10^3/uL', '150', '450', '150 - 450', 5),
  ('Liver Function Test (LFT)', 'ALT', 'numeric', 'U/L', '7', '56', '7 - 56', 1),
  ('Liver Function Test (LFT)', 'AST', 'numeric', 'U/L', '10', '40', '10 - 40', 2),
  ('Liver Function Test (LFT)', 'ALP', 'numeric', 'U/L', '44', '147', '44 - 147', 3),
  ('Liver Function Test (LFT)', 'Total Bilirubin', 'numeric', 'mg/dL', '0.1', '1.2', '0.1 - 1.2', 4),
  ('Renal Function Test (RFT)', 'Urea', 'numeric', 'mg/dL', '7', '20', '7 - 20', 1),
  ('Renal Function Test (RFT)', 'Creatinine', 'numeric', 'mg/dL', '0.6', '1.2', '0.6 - 1.2', 2),
  ('Renal Function Test (RFT)', 'Sodium', 'numeric', 'mmol/L', '135', '145', '135 - 145', 3),
  ('Renal Function Test (RFT)', 'Potassium', 'numeric', 'mmol/L', '3.5', '5.1', '3.5 - 5.1', 4),
  ('Urinalysis', 'Appearance', 'narrative', NULL, NULL, NULL, 'Clear / Turbid', 1),
  ('Urinalysis', 'Color', 'narrative', NULL, NULL, NULL, 'Pale yellow / Yellow / Amber', 2),
  ('Urinalysis', 'Protein', 'qualitative', NULL, NULL, NULL, 'Negative', 3),
  ('Urinalysis', 'Glucose', 'qualitative', NULL, NULL, NULL, 'Negative', 4),
  ('Urinalysis', 'Blood', 'qualitative', NULL, NULL, NULL, 'Negative', 5)
) AS p(catalog_name, analyte_name, result_type, unit, reference_range_low, reference_range_high, reference_range_text, sort_order)
ON c.name ILIKE p.catalog_name
ON CONFLICT (catalog_id, analyte_name) DO NOTHING;
