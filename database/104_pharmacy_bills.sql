-- ============================================================
-- 104: Pharmacy bills (quantify -> Paypoint -> dispense)
--
-- The doctor prescribes a regimen with NO quantity. The pharmacist sees the
-- order, sets the item + unit (unit/pack/carton) + quantity, and this creates a
-- PHARMACY BILL that is sent to Paypoint. Payment gates dispensing.
--
-- Stock is held at bill creation (deducted in base units) and restored if the
-- bill is cancelled, so a bill can never be paid for stock that no longer
-- exists. Dispensing records what was actually handed out.
-- Idempotent: safe to run on every server boot.
-- ============================================================

CREATE TABLE IF NOT EXISTS pharmacy_bills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  bill_number VARCHAR(30),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  prescription_id UUID REFERENCES prescriptions(id) ON DELETE SET NULL,
  encounter_id UUID,
  status VARCHAR(24) NOT NULL DEFAULT 'awaiting_payment',  -- awaiting_payment | paid | dispensed | partially_dispensed | cancelled
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  payment_id UUID,
  billed_by UUID,
  dispensed_by UUID,
  dispensed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pharmacy_bills_patient ON pharmacy_bills (tenant_id, patient_id, status);
CREATE INDEX IF NOT EXISTS idx_pharmacy_bills_status ON pharmacy_bills (tenant_id, status);

CREATE TABLE IF NOT EXISTS pharmacy_bill_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  bill_id UUID NOT NULL REFERENCES pharmacy_bills(id) ON DELETE CASCADE,
  inventory_item_id UUID REFERENCES inventory_items(id) ON DELETE SET NULL,
  drug_name VARCHAR(200),
  unit VARCHAR(30),
  quantity INTEGER NOT NULL DEFAULT 1,
  base_quantity INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  dispensed_quantity INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pharmacy_bill_items_bill ON pharmacy_bill_items (bill_id);

DROP TRIGGER IF EXISTS update_pharmacy_bills_updated_at ON pharmacy_bills;
CREATE TRIGGER update_pharmacy_bills_updated_at BEFORE UPDATE ON pharmacy_bills
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
