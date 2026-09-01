-- ============================================================
-- STAFF_DEPARTMENT: link staff (esp. consultants) to a department
-- Idempotent: safe to run on every server boot.
-- ============================================================
ALTER TABLE staff_users ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES departments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_staff_users_department_id
  ON staff_users (department_id);
