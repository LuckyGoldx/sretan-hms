-- ============================================================
-- 082: Record which items a deposit paid
--
-- Deposits are applied to outstanding items as soon as they are received.
-- This ledger keeps the itemised record so the discharge settlement statement
-- can still show what was billed and what the deposit settled.
--
-- Idempotent: safe to run on every server boot.
-- ============================================================

CREATE TABLE IF NOT EXISTS deposit_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  patient_id UUID REFERENCES patients(id) ON DELETE CASCADE NOT NULL,
  deposit_id UUID REFERENCES patient_deposits(id) ON DELETE SET NULL,
  service_type VARCHAR(40),
  service_id UUID,
  description TEXT,
  amount NUMERIC(12,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deposit_applications_patient
  ON deposit_applications (tenant_id, patient_id);
