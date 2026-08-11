ALTER TABLE insurance_providers ADD COLUMN IF NOT EXISTS category VARCHAR(50) DEFAULT 'Other';

-- Update seeded providers with correct categories
UPDATE insurance_providers SET category = 'HMO' WHERE code IN ('GPHMO', 'RLHMO', 'HYGHMO', 'PCHMO', 'CLHMO', 'MSHMO', 'LWHMO', 'THTHMO');
UPDATE insurance_providers SET category = 'NHIA' WHERE code = 'NHIS';
UPDATE insurance_providers SET category = 'HMO' WHERE code = 'AXAHMO';
