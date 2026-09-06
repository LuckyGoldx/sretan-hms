-- ============================================================
-- 066: Admission bed-day billing (24-hour cycle from admission time)
--
-- Each active admission accrues one bed charge per started 24-hour
-- block anchored at admitted_at. Charges are stored per day so they
-- can be paid individually at Paypoint and never double-counted.
-- Idempotent: safe to run on every server boot.
-- ============================================================

ALTER TABLE wards ADD COLUMN IF NOT EXISTS daily_rate NUMERIC(12,2) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS admission_daily_charges (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  admission_id UUID NOT NULL REFERENCES admissions(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  day_index INT NOT NULL,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  is_paid BOOLEAN NOT NULL DEFAULT false,
  payment_id UUID REFERENCES payments(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  is_synced BOOLEAN DEFAULT false,
  last_synced_at TIMESTAMPTZ,
  UNIQUE (admission_id, day_index)
);

CREATE INDEX IF NOT EXISTS idx_admission_daily_charges_patient ON admission_daily_charges (patient_id, is_paid);
CREATE INDEX IF NOT EXISTS idx_admission_daily_charges_admission ON admission_daily_charges (admission_id);
CREATE INDEX IF NOT EXISTS idx_admission_daily_charges_unpaid ON admission_daily_charges (is_paid);

DROP TRIGGER IF EXISTS update_admission_daily_charges_updated_at ON admission_daily_charges;
CREATE TRIGGER update_admission_daily_charges_updated_at BEFORE UPDATE ON admission_daily_charges
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
