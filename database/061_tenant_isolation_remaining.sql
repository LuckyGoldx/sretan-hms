-- ============================================================
-- 061: Complete tenant isolation for the remaining data tables
-- + doctor/nurses/consultants module flags
-- Idempotent: safe to run on every server boot.
-- ============================================================

-- ------------------------------------------------------------------
-- patient_documents: clinical documents (important leak fix)
-- ------------------------------------------------------------------
ALTER TABLE patient_documents ADD COLUMN IF NOT EXISTS tenant_id UUID;
UPDATE patient_documents pd
SET tenant_id = (SELECT p.tenant_id FROM patients p WHERE p.id = pd.patient_id)
WHERE pd.tenant_id IS NULL;
UPDATE patient_documents pd
SET tenant_id = (SELECT t.id FROM tenants t ORDER BY t.created_at, t.id LIMIT 1)
WHERE pd.tenant_id IS NULL;
ALTER TABLE patient_documents ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_patient_documents_tenant_id ON patient_documents (tenant_id);

-- ------------------------------------------------------------------
-- treatment_doses: medication dose tracking (important leak fix)
-- ------------------------------------------------------------------
ALTER TABLE treatment_doses ADD COLUMN IF NOT EXISTS tenant_id UUID;
UPDATE treatment_doses td
SET tenant_id = COALESCE(
  (SELECT ts.tenant_id FROM treatment_sessions ts WHERE ts.id = td.session_id),
  (SELECT tr.tenant_id FROM treatments tr WHERE tr.id = td.treatment_id)
)
WHERE td.tenant_id IS NULL;
UPDATE treatment_doses td
SET tenant_id = (SELECT t.id FROM tenants t ORDER BY t.created_at, t.id LIMIT 1)
WHERE td.tenant_id IS NULL;
ALTER TABLE treatment_doses ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_treatment_doses_tenant_id ON treatment_doses (tenant_id);

-- ------------------------------------------------------------------
-- test_inventory_map: lab test -> inventory consumption mapping
-- ------------------------------------------------------------------
ALTER TABLE test_inventory_map ADD COLUMN IF NOT EXISTS tenant_id UUID;
UPDATE test_inventory_map tim
SET tenant_id = (SELECT i.tenant_id FROM inventory_items i WHERE i.id = tim.inventory_item_id)
WHERE tim.tenant_id IS NULL;
UPDATE test_inventory_map tim
SET tenant_id = (SELECT t.id FROM tenants t ORDER BY t.created_at, t.id LIMIT 1)
WHERE tim.tenant_id IS NULL;
ALTER TABLE test_inventory_map ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_test_inventory_map_tenant_id ON test_inventory_map (tenant_id);

-- ------------------------------------------------------------------
-- lab_test_catalog: per-hospital test catalog
-- ------------------------------------------------------------------
ALTER TABLE lab_test_catalog ADD COLUMN IF NOT EXISTS tenant_id UUID;
UPDATE lab_test_catalog ltc
SET tenant_id = (SELECT t.id FROM tenants t ORDER BY t.created_at, t.id LIMIT 1)
WHERE ltc.tenant_id IS NULL;
ALTER TABLE lab_test_catalog ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lab_test_catalog_tenant_id ON lab_test_catalog (tenant_id);

-- ------------------------------------------------------------------
-- custom_document_types / custom_insurance_types: per-hospital lists
-- ------------------------------------------------------------------
ALTER TABLE custom_document_types ADD COLUMN IF NOT EXISTS tenant_id UUID;
UPDATE custom_document_types cdt
SET tenant_id = (SELECT t.id FROM tenants t ORDER BY t.created_at, t.id LIMIT 1)
WHERE cdt.tenant_id IS NULL;
ALTER TABLE custom_document_types ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_custom_document_types_tenant_id ON custom_document_types (tenant_id);

ALTER TABLE custom_insurance_types ADD COLUMN IF NOT EXISTS tenant_id UUID;
UPDATE custom_insurance_types cit
SET tenant_id = (SELECT t.id FROM tenants t ORDER BY t.created_at, t.id LIMIT 1)
WHERE cit.tenant_id IS NULL;
ALTER TABLE custom_insurance_types ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_custom_insurance_types_tenant_id ON custom_insurance_types (tenant_id);

-- ------------------------------------------------------------------
-- insurance_excluded_services / insurance_provider_co_pay_config
-- ------------------------------------------------------------------
ALTER TABLE insurance_excluded_services ADD COLUMN IF NOT EXISTS tenant_id UUID;
UPDATE insurance_excluded_services ies
SET tenant_id = (SELECT p.tenant_id FROM insurance_providers p WHERE p.id = ies.provider_id)
WHERE ies.tenant_id IS NULL;
UPDATE insurance_excluded_services ies
SET tenant_id = (SELECT t.id FROM tenants t ORDER BY t.created_at, t.id LIMIT 1)
WHERE ies.tenant_id IS NULL;
ALTER TABLE insurance_excluded_services ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_insurance_excluded_services_tenant_id ON insurance_excluded_services (tenant_id);

ALTER TABLE insurance_provider_co_pay_config ADD COLUMN IF NOT EXISTS tenant_id UUID;
UPDATE insurance_provider_co_pay_config ipc
SET tenant_id = (SELECT p.tenant_id FROM insurance_providers p WHERE p.id = ipc.provider_id)
WHERE ipc.tenant_id IS NULL;
UPDATE insurance_provider_co_pay_config ipc
SET tenant_id = (SELECT t.id FROM tenants t ORDER BY t.created_at, t.id LIMIT 1)
WHERE ipc.tenant_id IS NULL;
ALTER TABLE insurance_provider_co_pay_config ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_insurance_provider_co_pay_config_tenant_id ON insurance_provider_co_pay_config (tenant_id);

-- ------------------------------------------------------------------
-- Doctor / Nurses / Consultants module flags
-- ------------------------------------------------------------------
ALTER TABLE tenant_configurations ADD COLUMN IF NOT EXISTS module_doctor BOOLEAN DEFAULT FALSE;
ALTER TABLE tenant_configurations ADD COLUMN IF NOT EXISTS module_nurses BOOLEAN DEFAULT FALSE;
ALTER TABLE tenant_configurations ADD COLUMN IF NOT EXISTS module_consultants BOOLEAN DEFAULT FALSE;
