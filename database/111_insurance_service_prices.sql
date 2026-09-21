-- ============================================================
-- 111: Per-provider insurance SERVICE PRICES (tariff overrides)
--
-- Sibling of insurance_provider_coverage_rules. Insurance staff set the price
-- their provider will be billed for any inventory item / service. A row with
-- inventory_item_id NULL is the category-level price for that service type.
--
-- Billing rule (enforced in server/src/utils/insurancePricing.ts):
--   effective price = provider price override ?? inventory default price
--   insurer share   = effective price x qty x coverage %
--
-- Idempotent: safe to run on every server boot.
-- ============================================================

CREATE TABLE IF NOT EXISTS insurance_provider_service_prices (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  provider_id UUID REFERENCES insurance_providers(id) ON DELETE CASCADE,
  service_type VARCHAR(50) NOT NULL,
  inventory_item_id UUID NULL,
  price DECIMAL(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (provider_id, service_type, inventory_item_id)
);

CREATE INDEX IF NOT EXISTS idx_ins_service_prices_provider
  ON insurance_provider_service_prices (provider_id, service_type);

CREATE INDEX IF NOT EXISTS idx_ins_service_prices_item
  ON insurance_provider_service_prices (inventory_item_id)
  WHERE inventory_item_id IS NOT NULL;

-- Store BOTH the list (default inventory) price and the insurance (effective)
-- price actually billed on every case service, so a claim line is auditable and
-- the receipt/invoice can show the price that was used. New bills only.
ALTER TABLE insurance_case_services ADD COLUMN IF NOT EXISTS default_unit_price DECIMAL(10,2);
ALTER TABLE insurance_case_services ADD COLUMN IF NOT EXISTS insurance_unit_price DECIMAL(10,2);
