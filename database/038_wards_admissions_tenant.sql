ALTER TABLE wards ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE admissions ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE beds ADD COLUMN IF NOT EXISTS tenant_id UUID;

-- Backfill: use the first tenant_id from the tenants table (matches single-tenant installations)
UPDATE wards SET tenant_id = (SELECT id FROM tenants LIMIT 1) WHERE tenant_id IS NULL;
UPDATE admissions SET tenant_id = (SELECT id FROM tenants LIMIT 1) WHERE tenant_id IS NULL;
UPDATE beds SET tenant_id = (SELECT id FROM tenants LIMIT 1) WHERE tenant_id IS NULL;
