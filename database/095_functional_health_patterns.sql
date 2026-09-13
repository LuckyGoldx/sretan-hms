-- ============================================================
-- 095: Gordon's Functional Health Patterns (FHP) for inpatients
--
-- A holistic nursing assessment of the 11 Functional Health Patterns.
-- It is anchored to an ADMISSION EPISODE (not just the patient) so each
-- admission gets its own baseline / shift / discharge assessment, and the
-- form is only offered while the patient is admitted.
--
-- Nothing is rewritten: an assessment is stored once and updated only while
-- it is a draft; completing it freezes the clinical content.
-- Idempotent: safe to run on every server boot.
-- ============================================================

CREATE TABLE IF NOT EXISTS fhp_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  admission_id UUID NOT NULL REFERENCES admissions(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  assessment_type VARCHAR(20) NOT NULL DEFAULT 'baseline',   -- baseline | shift | discharge
  template_version VARCHAR(20) NOT NULL DEFAULT '1.0',
  status VARCHAR(20) NOT NULL DEFAULT 'draft',               -- draft | completed
  summary TEXT,
  assessed_by UUID REFERENCES staff_users(id),
  assessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_synced BOOLEAN DEFAULT false,
  last_synced_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_fhp_assessments_admission ON fhp_assessments (admission_id, assessed_at DESC);
CREATE INDEX IF NOT EXISTS idx_fhp_assessments_patient ON fhp_assessments (patient_id, assessed_at DESC);
CREATE INDEX IF NOT EXISTS idx_fhp_assessments_tenant ON fhp_assessments (tenant_id, assessed_at DESC);

CREATE TABLE IF NOT EXISTS fhp_findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  assessment_id UUID NOT NULL REFERENCES fhp_assessments(id) ON DELETE CASCADE,
  pattern_code VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'not_assessed',        -- effective | ineffective | at_risk | not_assessed
  responses JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes TEXT,
  flagged BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_fhp_findings_pattern ON fhp_findings (assessment_id, pattern_code);
CREATE INDEX IF NOT EXISTS idx_fhp_findings_flagged ON fhp_findings (tenant_id, flagged) WHERE flagged = true;

DROP TRIGGER IF EXISTS update_fhp_assessments_updated_at ON fhp_assessments;
CREATE TRIGGER update_fhp_assessments_updated_at BEFORE UPDATE ON fhp_assessments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_fhp_findings_updated_at ON fhp_findings;
CREATE TRIGGER update_fhp_findings_updated_at BEFORE UPDATE ON fhp_findings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
