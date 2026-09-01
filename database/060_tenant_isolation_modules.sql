-- ============================================================
-- 060: Cross-tenant data isolation + superadmin master code
-- + expanded per-tenant module flags
-- Idempotent: safe to run on every server boot.
-- ============================================================

-- ------------------------------------------------------------------
-- 1. payments: tenant isolation (backfill, then NOT NULL)
-- ------------------------------------------------------------------
ALTER TABLE payments ADD COLUMN IF NOT EXISTS tenant_id UUID;
UPDATE payments p
SET tenant_id = COALESCE(
  (SELECT pt.tenant_id FROM patients pt WHERE pt.id = p.patient_id),
  (SELECT t.id FROM tenants t ORDER BY t.created_at, t.id LIMIT 1)
)
WHERE p.tenant_id IS NULL;
ALTER TABLE payments ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payments_tenant_id ON payments (tenant_id);

-- ------------------------------------------------------------------
-- 2. payment_items: tenant isolation
-- ------------------------------------------------------------------
ALTER TABLE payment_items ADD COLUMN IF NOT EXISTS tenant_id UUID;
UPDATE payment_items pi
SET tenant_id = p.tenant_id
FROM payments p
WHERE pi.payment_id = p.id AND pi.tenant_id IS NULL;
UPDATE payment_items pi
SET tenant_id = (SELECT t.id FROM tenants t ORDER BY t.created_at, t.id LIMIT 1)
WHERE pi.tenant_id IS NULL;
ALTER TABLE payment_items ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payment_items_tenant_id ON payment_items (tenant_id);

-- ------------------------------------------------------------------
-- 3. insurance_invoice_items: tenant isolation (via case or invoice)
-- ------------------------------------------------------------------
ALTER TABLE insurance_invoice_items ADD COLUMN IF NOT EXISTS tenant_id UUID;
UPDATE insurance_invoice_items ii
SET tenant_id = COALESCE(
  (SELECT ic.tenant_id FROM insurance_cases ic WHERE ic.id = ii.case_id),
  (SELECT inv.tenant_id FROM insurance_invoices inv WHERE inv.id = ii.invoice_id)
)
WHERE ii.tenant_id IS NULL;
UPDATE insurance_invoice_items ii
SET tenant_id = (SELECT t.id FROM tenants t ORDER BY t.created_at, t.id LIMIT 1)
WHERE ii.tenant_id IS NULL;
ALTER TABLE insurance_invoice_items ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_insurance_invoice_items_tenant_id ON insurance_invoice_items (tenant_id);

-- ------------------------------------------------------------------
-- 4. record_requests: tenant isolation
-- ------------------------------------------------------------------
ALTER TABLE record_requests ADD COLUMN IF NOT EXISTS tenant_id UUID;
UPDATE record_requests rr
SET tenant_id = (SELECT p.tenant_id FROM patients p WHERE p.id = rr.patient_id)
WHERE rr.tenant_id IS NULL;
UPDATE record_requests rr
SET tenant_id = (SELECT t.id FROM tenants t ORDER BY t.created_at, t.id LIMIT 1)
WHERE rr.tenant_id IS NULL;
ALTER TABLE record_requests ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_record_requests_tenant_id ON record_requests (tenant_id);

-- ------------------------------------------------------------------
-- 5. clinical_note_views: tenant isolation
-- ------------------------------------------------------------------
ALTER TABLE clinical_note_views ADD COLUMN IF NOT EXISTS tenant_id UUID;
UPDATE clinical_note_views cn
SET tenant_id = (SELECT en.tenant_id FROM encounter_notes en WHERE en.id = cn.note_id)
WHERE cn.tenant_id IS NULL;
UPDATE clinical_note_views cn
SET tenant_id = (SELECT t.id FROM tenants t ORDER BY t.created_at, t.id LIMIT 1)
WHERE cn.tenant_id IS NULL;
ALTER TABLE clinical_note_views ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_clinical_note_views_tenant_id ON clinical_note_views (tenant_id);

-- ------------------------------------------------------------------
-- 6. superadmin_settings: global key/value (master delete code)
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS superadmin_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key VARCHAR(100) NOT NULL UNIQUE,
  setting_value TEXT,
  updated_by UUID,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO superadmin_settings (setting_key, setting_value)
VALUES ('master_code', '5788')
ON CONFLICT (setting_key) DO NOTHING;

-- ------------------------------------------------------------------
-- 7. Expanded per-tenant module flags
-- ------------------------------------------------------------------
ALTER TABLE tenant_configurations ADD COLUMN IF NOT EXISTS module_maternity BOOLEAN DEFAULT FALSE;
ALTER TABLE tenant_configurations ADD COLUMN IF NOT EXISTS module_insurance BOOLEAN DEFAULT FALSE;
ALTER TABLE tenant_configurations ADD COLUMN IF NOT EXISTS module_referrals BOOLEAN DEFAULT FALSE;
ALTER TABLE tenant_configurations ADD COLUMN IF NOT EXISTS module_appointments BOOLEAN DEFAULT FALSE;
ALTER TABLE tenant_configurations ADD COLUMN IF NOT EXISTS module_admissions BOOLEAN DEFAULT FALSE;
ALTER TABLE tenant_configurations ADD COLUMN IF NOT EXISTS module_paypoint BOOLEAN DEFAULT FALSE;
ALTER TABLE tenant_configurations ADD COLUMN IF NOT EXISTS module_store BOOLEAN DEFAULT FALSE;
