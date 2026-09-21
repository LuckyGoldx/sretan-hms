-- ============================================================
-- 116: Comprehensive purchase orders (multi-item, payments, refunds)
--
-- Upgrades purchase_orders from a single drug line to a header with many items
-- and a payment/refund ledger, so the UI can track amount paid and outstanding.
-- Legacy single-item rows are backfilled into purchase_order_items.
--
-- Idempotent: safe to run on every server boot.
-- ============================================================

ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS supplier_address TEXT,
  ADD COLUMN IF NOT EXISTS supplier_phone VARCHAR(50),
  ADD COLUMN IF NOT EXISTS expected_at DATE,
  ADD COLUMN IF NOT EXISTS subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS amount_paid NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS refunded_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cancel_reason TEXT,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS created_by UUID;

CREATE TABLE IF NOT EXISTS purchase_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  order_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  inventory_item_id UUID REFERENCES inventory_items(id) ON DELETE SET NULL,
  drug_name VARCHAR(255) NOT NULL,
  unit VARCHAR(30),
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  received_quantity INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_purchase_order_items_order ON purchase_order_items (order_id);

CREATE TABLE IF NOT EXISTS purchase_order_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  order_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  kind VARCHAR(12) NOT NULL DEFAULT 'payment',   -- payment | refund
  amount NUMERIC(12,2) NOT NULL,
  method VARCHAR(40),
  reference VARCHAR(120),
  note TEXT,
  paid_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_purchase_order_payments_order ON purchase_order_payments (order_id);

-- Backfill legacy single-item orders into the items table.
INSERT INTO purchase_order_items (tenant_id, order_id, drug_name, quantity, unit_price, total_price, created_at)
SELECT po.tenant_id, po.id, po.drug_name, GREATEST(po.quantity, 1),
       COALESCE(po.unit_price, 0), GREATEST(po.quantity, 1) * COALESCE(po.unit_price, 0), po.created_at
  FROM purchase_orders po
 WHERE NOT EXISTS (SELECT 1 FROM purchase_order_items i WHERE i.order_id = po.id);

-- Seed header totals for rows that predate the columns.
UPDATE purchase_orders po
   SET subtotal = COALESCE((SELECT SUM(i.total_price) FROM purchase_order_items i WHERE i.order_id = po.id), 0),
       total    = COALESCE((SELECT SUM(i.total_price) FROM purchase_order_items i WHERE i.order_id = po.id), 0)
 WHERE po.total = 0 AND po.subtotal = 0;
