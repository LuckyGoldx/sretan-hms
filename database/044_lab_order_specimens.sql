-- ============================================================
-- lab_order_specimens: a lab order/test can carry MULTIPLE specimens.
-- Source of truth for an order's specimens. lab_orders.specimen_type
-- is kept as a cached "primary" specimen for backward compatibility
-- and quick display (it mirrors the first collected specimen).
-- Idempotent: safe to run on every server boot.
-- ============================================================

CREATE TABLE IF NOT EXISTS lab_order_specimens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  order_id UUID REFERENCES lab_orders(id) ON DELETE CASCADE,
  specimen_type VARCHAR(100) NOT NULL,
  collected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_lab_order_specimens_order_type
  ON lab_order_specimens (order_id, specimen_type);

-- Backfill existing orders that already have a specimen_type.
INSERT INTO lab_order_specimens (tenant_id, order_id, specimen_type, collected_at)
SELECT l.tenant_id, l.id, l.specimen_type, l.collected_at
FROM lab_orders l
WHERE l.specimen_type IS NOT NULL AND l.specimen_type <> ''
ON CONFLICT (order_id, specimen_type) DO NOTHING;
