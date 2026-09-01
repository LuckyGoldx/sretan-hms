-- ============================================================
-- 064: Move subscription tier/status onto tenant_configurations
-- so they sync up/down with Supabase (remote control of an
-- offline hospital's subscription via cloud sync).
-- Idempotent: safe to run on every server boot.
-- ============================================================

ALTER TABLE tenant_configurations ADD COLUMN IF NOT EXISTS subscription_tier VARCHAR(50);
ALTER TABLE tenant_configurations ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(50);

UPDATE tenant_configurations tc
SET subscription_tier = COALESCE((SELECT t.subscription_tier FROM tenants t WHERE t.id = tc.tenant_id), 'standard'),
    subscription_status = COALESCE((SELECT t.subscription_status FROM tenants t WHERE t.id = tc.tenant_id), 'active')
WHERE tc.subscription_tier IS NULL OR tc.subscription_status IS NULL;
