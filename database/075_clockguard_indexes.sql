-- 075_clockguard_indexes.sql
-- Supports the clock-tamper guard (server/src/middleware/clockGuard.ts).
--
-- The guard compares NOW() against GREATEST(MAX(created_at), MAX(updated_at)) of
-- the table being written. Without indexes that is a full table scan on every
-- write. A btree index lets PostgreSQL satisfy MAX(...) with a single backward
-- index read (O(1)), turning the guard from a table scan into a constant cost.
--
-- Only the tables that actually call clockGuard on interactive writes are
-- covered here; sync-driven calls already pay far more for network round-trips.

CREATE INDEX IF NOT EXISTS idx_cg_patients_created        ON patients (created_at);
CREATE INDEX IF NOT EXISTS idx_cg_patients_updated        ON patients (updated_at);
CREATE INDEX IF NOT EXISTS idx_cg_encounters_created      ON encounters (created_at);
CREATE INDEX IF NOT EXISTS idx_cg_encounters_updated      ON encounters (updated_at);
CREATE INDEX IF NOT EXISTS idx_cg_encounter_notes_created ON encounter_notes (created_at);
CREATE INDEX IF NOT EXISTS idx_cg_encounter_notes_updated ON encounter_notes (updated_at);
CREATE INDEX IF NOT EXISTS idx_cg_vitals_updated          ON vitals (updated_at);
CREATE INDEX IF NOT EXISTS idx_cg_visits_created          ON visits (created_at);
CREATE INDEX IF NOT EXISTS idx_cg_visits_updated          ON visits (updated_at);
CREATE INDEX IF NOT EXISTS idx_cg_prescriptions_created   ON prescriptions (created_at);
CREATE INDEX IF NOT EXISTS idx_cg_prescriptions_updated   ON prescriptions (updated_at);
CREATE INDEX IF NOT EXISTS idx_cg_radiology_created       ON radiology_orders (created_at);
CREATE INDEX IF NOT EXISTS idx_cg_radiology_updated       ON radiology_orders (updated_at);
CREATE INDEX IF NOT EXISTS idx_cg_inventory_created       ON inventory_items (created_at);
CREATE INDEX IF NOT EXISTS idx_cg_inventory_updated       ON inventory_items (updated_at);
CREATE INDEX IF NOT EXISTS idx_cg_departments_created     ON departments (created_at);
CREATE INDEX IF NOT EXISTS idx_cg_departments_updated     ON departments (updated_at);
CREATE INDEX IF NOT EXISTS idx_cg_referrals_created       ON referrals (created_at);
CREATE INDEX IF NOT EXISTS idx_cg_referrals_updated       ON referrals (updated_at);
CREATE INDEX IF NOT EXISTS idx_cg_billing_created         ON billing_invoices (created_at);
CREATE INDEX IF NOT EXISTS idx_cg_billing_updated         ON billing_invoices (updated_at);

-- vitals(created_at) already exists as idx_vitals_created (074_performance_indexes.sql).
