-- ============================================================
-- 091: Ward transfers + one active admission per patient
--
-- A patient can only be admitted once at a time. Moving between
-- wards is a TRANSFER (nurse/doctor/admin), not a second admission:
-- the current ward stay is closed and a new one opened, so bed-day
-- billing can charge each ward's own rate for the days actually spent
-- there (e.g. 2 days ICU + 4 days Male Ward).
--
-- Also reconciles duplicate active admissions created before the
-- server-side guard existed, then enforces the rule with a partial
-- unique index so a race can never create a second active admission.
-- Idempotent: safe to run on every server boot.
-- ============================================================

-- 1) Ward-stay history: one open row per active admission, a closed row per
--    completed segment.
CREATE TABLE IF NOT EXISTS admission_ward_stays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  admission_id UUID NOT NULL REFERENCES admissions(id) ON DELETE CASCADE,
  ward_id UUID REFERENCES wards(id) ON DELETE SET NULL,
  bed_number VARCHAR(20),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  transferred_by UUID,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  is_synced BOOLEAN DEFAULT false,
  last_synced_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_admission_ward_stays_admission ON admission_ward_stays (admission_id, started_at);
CREATE INDEX IF NOT EXISTS idx_admission_ward_stays_tenant_ward ON admission_ward_stays (tenant_id, ward_id);

DROP TRIGGER IF EXISTS update_admission_ward_stays_updated_at ON admission_ward_stays;
CREATE TRIGGER update_admission_ward_stays_updated_at BEFORE UPDATE ON admission_ward_stays
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 2) Attribute each bed-day charge to the ward actually occupied that day.
ALTER TABLE admission_daily_charges ADD COLUMN IF NOT EXISTS ward_id UUID REFERENCES wards(id) ON DELETE SET NULL;

-- 3) Backfill one stay per existing admission (whole episode in its ward).
INSERT INTO admission_ward_stays (tenant_id, admission_id, ward_id, bed_number, started_at, ended_at)
SELECT a.tenant_id, a.id, a.ward_id, a.bed_number, a.admitted_at, a.discharged_at
  FROM admissions a
 WHERE NOT EXISTS (SELECT 1 FROM admission_ward_stays s WHERE s.admission_id = a.id);

-- 4) Backfill the ward on existing charges from the admission they belong to.
UPDATE admission_daily_charges dc
   SET ward_id = a.ward_id
  FROM admissions a
 WHERE a.id = dc.admission_id AND dc.ward_id IS NULL;

-- 5) Reconcile duplicate ACTIVE admissions: keep the earliest, remove the
--    accidental later duplicates (their unpaid bed-day charges cascade away).
--    Every removed admission is written to the immutable audit log first.
INSERT INTO audit_logs (tenant_id, action, table_name, record_id, performed_by, old_data)
SELECT a.tenant_id, 'DELETE', 'admissions', a.id, NULL, to_jsonb(a)
  FROM admissions a
  JOIN (
    SELECT id, ROW_NUMBER() OVER (
             PARTITION BY tenant_id, patient_id
             ORDER BY admitted_at ASC, created_at ASC, id
           ) AS rn
      FROM admissions WHERE status = 'active'
  ) r ON r.id = a.id
 WHERE r.rn > 1;

DELETE FROM admissions a
 USING (
   SELECT id, ROW_NUMBER() OVER (
            PARTITION BY tenant_id, patient_id
            ORDER BY admitted_at ASC, created_at ASC, id
          ) AS rn
     FROM admissions WHERE status = 'active'
 ) r
 WHERE a.id = r.id AND r.rn > 1;

-- 6) Enforce one active admission per patient at the database level.
CREATE UNIQUE INDEX IF NOT EXISTS uq_admission_active_patient
  ON admissions (tenant_id, patient_id) WHERE status = 'active';
