-- ============================================================
-- 080: Deposit ledger + two-step discharge (request -> clearance)
--
-- Phase 2 of the admission financial-clearance work:
--  * doctors can SUBMIT a discharge for financial clearance (summary saved,
--    patient held) instead of being blocked outright;
--  * Finance/Paypoint then CLEAR it after settling the bill;
--  * deposits received on account reduce the outstanding balance.
--
-- Idempotent: safe to run on every server boot.
-- ============================================================

ALTER TABLE admissions ADD COLUMN IF NOT EXISTS discharge_requested_at TIMESTAMPTZ;
ALTER TABLE admissions ADD COLUMN IF NOT EXISTS discharge_requested_by UUID;

CREATE INDEX IF NOT EXISTS idx_admissions_pending_clearance
  ON admissions (tenant_id, status, discharge_requested_at)
  WHERE discharge_requested_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS patient_deposits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  patient_id UUID REFERENCES patients(id) ON DELETE CASCADE NOT NULL,
  admission_id UUID REFERENCES admissions(id) ON DELETE SET NULL,
  amount NUMERIC(12,2) NOT NULL,
  method VARCHAR(30) DEFAULT 'cash',
  -- held    -> money received, not yet applied to a bill
  -- applied -> consumed at discharge clearance
  -- refunded-> returned to the patient
  status VARCHAR(20) NOT NULL DEFAULT 'held',
  payment_id UUID,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  applied_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  is_synced BOOLEAN DEFAULT false,
  last_synced_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_patient_deposits_patient
  ON patient_deposits (tenant_id, patient_id, status);
CREATE INDEX IF NOT EXISTS idx_patient_deposits_admission
  ON patient_deposits (admission_id);
