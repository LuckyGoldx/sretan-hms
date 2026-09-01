-- ============================================================
-- SUPERADMIN USERS: global, tenant-independent accounts
-- Seed: username: lucky / password: lucky
-- Idempotent: safe to run on every server boot.
-- ============================================================

CREATE TABLE IF NOT EXISTS super_admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  name VARCHAR(255),
  password VARCHAR(255) NOT NULL,
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_login_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_super_admin_users_username_lower
  ON super_admin_users (LOWER(username));

CREATE UNIQUE INDEX IF NOT EXISTS idx_super_admin_users_email_lower
  ON super_admin_users (LOWER(email)) WHERE email IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_super_admin_users_updated_at') THEN
    CREATE TRIGGER update_super_admin_users_updated_at
      BEFORE UPDATE ON super_admin_users
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

INSERT INTO super_admin_users (username, email, name, password, status)
SELECT 'lucky', 'lucky@sretan.com', 'Lucky Gold',
       '$2b$10$jh/9EeVmy7ty/pZyrlU1L.KQD0ie5oDItNhEzIf2k0K11.YvQOaJ6',
       'active'
WHERE NOT EXISTS (SELECT 1 FROM super_admin_users WHERE LOWER(username) = 'lucky');

-- ============================================================
-- EXTEND tenant_configurations with hospital-number + profile
-- fields so each hospital carries its own complete setup.
-- ============================================================
ALTER TABLE tenant_configurations ADD COLUMN IF NOT EXISTS hospital_number_prefix VARCHAR(20) DEFAULT 'SRT';
ALTER TABLE tenant_configurations ADD COLUMN IF NOT EXISTS hospital_number_include_year BOOLEAN DEFAULT TRUE;
