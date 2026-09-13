-- ============================================================
-- 086: Nursing shift handover
--
-- A shift-level handover per ward (outgoing -> incoming nurse) with a
-- general/situational section, plus a structured per-patient entry
-- (SBAR/priority/flags/pending tasks/contingency) and acknowledgment.
--
-- Idempotent: safe to run on every server boot.
-- ============================================================

CREATE TABLE IF NOT EXISTS handovers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  ward_id UUID REFERENCES wards(id) ON DELETE SET NULL,
  shift VARCHAR(20) DEFAULT 'morning',       -- morning | afternoon | night
  handover_date DATE DEFAULT CURRENT_DATE,
  handover_from UUID,
  handover_to UUID,
  general_notes TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending | acknowledged
  acknowledged_by UUID,
  acknowledged_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  is_synced BOOLEAN DEFAULT false,
  last_synced_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_handovers_tenant_date ON handovers (tenant_id, handover_date);
CREATE INDEX IF NOT EXISTS idx_handovers_tenant_ward ON handovers (tenant_id, ward_id, shift);
CREATE INDEX IF NOT EXISTS idx_handovers_to ON handovers (tenant_id, handover_to, status);

CREATE TABLE IF NOT EXISTS handover_patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  handover_id UUID REFERENCES handovers(id) ON DELETE CASCADE,
  patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
  admission_id UUID,
  priority VARCHAR(20) NOT NULL DEFAULT 'routine',  -- routine | watch | critical
  flags JSONB DEFAULT '[]'::jsonb,
  situation TEXT,
  background TEXT,
  assessment TEXT,
  recommendation TEXT,
  pending_tasks TEXT,
  contingency TEXT,
  notes TEXT,
  acknowledged_by UUID,
  acknowledged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_handover_patients_handover ON handover_patients (handover_id);
CREATE INDEX IF NOT EXISTS idx_handover_patients_patient ON handover_patients (tenant_id, patient_id);
