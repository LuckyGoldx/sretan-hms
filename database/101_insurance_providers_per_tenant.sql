-- ============================================================
-- 101: Insurance providers per tenant + seed the default HMO list
--
-- insurance_providers.code was GLOBALLY unique, so a second hospital could not
-- have its own 'NHIS'/'Greenfield HMO' rows. Make the code unique per tenant
-- (like ward codes) and seed the default provider list for every hospital.
-- Idempotent: safe to run on every server boot.
-- ============================================================

ALTER TABLE insurance_providers DROP CONSTRAINT IF EXISTS insurance_providers_code_key;
DROP INDEX IF EXISTS insurance_providers_code_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_insurance_providers_tenant_code
  ON insurance_providers (tenant_id, code);

INSERT INTO insurance_providers (id, tenant_id, name, code, is_active)
SELECT gen_random_uuid(), t.id, d.name, d.code, true
  FROM tenants t
 CROSS JOIN (VALUES
    ('NHIS', 'NHIS'),
    ('Greenfield HMO', 'GPHMO'),
    ('Reliance HMO', 'RLHMO'),
    ('AXA Mansard Health', 'AXAHMO'),
    ('Leadway Health', 'LWHMO'),
    ('Hygeia HMO', 'HYGHMO'),
    ('Total Health Trust', 'THTHMO'),
    ('Precious Healthcare', 'PCHMO'),
    ('Clearline HMO', 'CLHMO'),
    ('Multi-Shield HMO', 'MSHMO')
 ) AS d(name, code)
 WHERE NOT EXISTS (
   SELECT 1 FROM insurance_providers p WHERE p.tenant_id = t.id AND p.code = d.code
 );
