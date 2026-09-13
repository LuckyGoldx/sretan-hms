-- ============================================================
-- 078: Admission financial clearance (discharge gate)
--
-- Prevents a patient from being discharged with an unpaid balance
-- (absconding). At discharge the server totals the patient's outstanding
-- pending items; unless the balance is zero or the payer is approved
-- (e.g. active insurance), discharge is blocked. An administrator may
-- override with a recorded reason (emergency/LAMA/waiver).
--
-- Idempotent: safe to run on every server boot.
-- ============================================================

ALTER TABLE admissions ADD COLUMN IF NOT EXISTS payer_type VARCHAR(20) DEFAULT 'self_pay';
ALTER TABLE admissions ADD COLUMN IF NOT EXISTS clearance_status VARCHAR(20) DEFAULT 'pending';
ALTER TABLE admissions ADD COLUMN IF NOT EXISTS cleared_by UUID;
ALTER TABLE admissions ADD COLUMN IF NOT EXISTS cleared_at TIMESTAMPTZ;
ALTER TABLE admissions ADD COLUMN IF NOT EXISTS balance_at_clearance NUMERIC(12,2);
ALTER TABLE admissions ADD COLUMN IF NOT EXISTS override_reason TEXT;
ALTER TABLE admissions ADD COLUMN IF NOT EXISTS final_bill_total NUMERIC(12,2);
ALTER TABLE admissions ADD COLUMN IF NOT EXISTS final_bill_items JSONB;

CREATE INDEX IF NOT EXISTS idx_admissions_clearance
  ON admissions (tenant_id, status, clearance_status);

-- Historical admissions were closed under the old (no-gate) rules, so mark
-- them cleared. Only currently-active admissions start as pending.
-- NOTE: ADD COLUMN ... DEFAULT 'pending' backfills existing rows with 'pending',
-- so the condition targets non-active rows rather than NULLs.
UPDATE admissions
   SET clearance_status = 'cleared'
 WHERE status <> 'active' AND clearance_status = 'pending';
