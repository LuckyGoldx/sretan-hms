-- ============================================================
-- 065: Per-machine software-update report / "phone home" table.
--
-- Every hospital host machine records its git roll-out state
-- (branch, applied commit SHA, last pull result, auto-update
-- settings) into a LOCAL row keyed by (tenant_id, machine_id),
-- and the update daemon pushes that single row to the cloud
-- (Cloud SaaS / Private Cloud Supabase project) using
-- `Prefer: resolution=merge-duplicates` so the operator can see
-- the whole fleet from one place.
--
-- Deliberately NOT part of the generic upward sync:
--   * it has no `is_synced` column, so getSyncTables() never
--     discovers it and the generic sync cannot double-push;
--   * it is written by the update daemon directly (one row per
--     hospital host), not by clinical data inserts.
-- Idempotent: safe to run on every server boot.
-- ============================================================

CREATE TABLE IF NOT EXISTS machine_update_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  machine_id VARCHAR(120) NOT NULL,
  hospital_name VARCHAR(255),
  deployment_mode VARCHAR(50),
  repo_url_clean TEXT,
  branch VARCHAR(255),
  local_sha VARCHAR(64),
  remote_sha VARCHAR(64),
  last_commit TEXT,
  update_available BOOLEAN DEFAULT FALSE,
  auto_update_enabled BOOLEAN DEFAULT FALSE,
  interval_minutes INTEGER DEFAULT 1,
  cloud_version TEXT,
  local_signal_version TEXT,
  last_check_at TIMESTAMPTZ,
  last_pull_at TIMESTAMPTZ,
  last_pull_ok BOOLEAN,
  last_pull_error TEXT,
  last_pull_output TEXT,
  phone_fingerprint TEXT,
  last_phone_at TIMESTAMPTZ,
  last_phone_ok BOOLEAN,
  last_phone_error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (tenant_id, machine_id)
);

CREATE INDEX IF NOT EXISTS idx_machine_update_reports_tenant ON machine_update_reports (tenant_id);
CREATE INDEX IF NOT EXISTS idx_machine_update_reports_updated ON machine_update_reports (updated_at DESC);

CREATE TRIGGER update_machine_update_reports_updated_at
  BEFORE UPDATE ON machine_update_reports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
