-- ============================================================
-- SEED_CONSULTANT: default consultant account
-- username: consultant / email: consultant@sretan.com / password: consultant
-- Attached to the Gynae & Obstetrics department (maternity access demo).
-- Idempotent + self-healing: safe to run on every server boot.
-- ============================================================

-- Remove duplicate consultant accounts (keep one per tenant, earliest created)
DELETE FROM staff_users
WHERE email = 'consultant@sretan.com'
  AND id NOT IN (
    SELECT id FROM (
      SELECT id, ROW_NUMBER() OVER (PARTITION BY tenant_id ORDER BY created_at, id) rn
      FROM staff_users WHERE email = 'consultant@sretan.com'
    ) t WHERE rn = 1
  );

-- Ensure a consultant user exists for every tenant (password: consultant).
INSERT INTO staff_users (tenant_id, username, email, name, role, password, status, department_id)
SELECT t.id, 'consultant_' || LEFT(REPLACE(t.id::text, '-', ''), 6), 'consultant@sretan.com',
       'Dr. Consultant', 'Consultant',
       '$2b$10$W3CAqiV8mzX0mAVl49kSo.8SKfgef/oKxjgm.hs3v/pTjOJGgyyWy',
       'active', d.id
FROM tenants t
LEFT JOIN departments d ON d.tenant_id = t.id AND d.name = 'Gynae & Obstetrics'
WHERE NOT EXISTS (
  SELECT 1 FROM staff_users s WHERE s.email = 'consultant@sretan.com' AND s.tenant_id = t.id
);

-- Fix any existing consultant rows: correct password + department.
UPDATE staff_users su
SET password = '$2b$10$W3CAqiV8mzX0mAVl49kSo.8SKfgef/oKxjgm.hs3v/pTjOJGgyyWy',
    department_id = COALESCE(su.department_id, d.id)
FROM departments d
WHERE su.email = 'consultant@sretan.com'
  AND su.tenant_id = d.tenant_id
  AND d.name = 'Gynae & Obstetrics';

-- Guarantee exactly ONE row keeps the username 'consultant' — prefer the
-- first-created (primary) tenant, matching the configured clinic tenant.
DO $$
DECLARE
  primary_tenant UUID;
  row RECORD;
  n INT := 1;
  keep_consultant BOOLEAN;
BEGIN
  SELECT id INTO primary_tenant FROM tenants ORDER BY created_at, id LIMIT 1;

  FOR row IN
    SELECT su.id, su.tenant_id
    FROM staff_users su
    WHERE su.email = 'consultant@sretan.com'
    ORDER BY CASE WHEN su.tenant_id = primary_tenant THEN 0 ELSE 1 END, su.created_at, su.id
  LOOP
    keep_consultant := (row.tenant_id = primary_tenant);

    IF NOT keep_consultant THEN
      -- Give non-primary tenants unique usernames so migration 041 never
      -- deduplicates the primary 'consultant' username on subsequent boots.
      n := 1;
      WHILE EXISTS (
        SELECT 1 FROM staff_users
        WHERE LOWER(username) = LOWER('consultant_' || n)
          AND id <> row.id
      ) LOOP
        n := n + 1;
      END LOOP;
      UPDATE staff_users SET username = 'consultant_' || n WHERE id = row.id;
    ELSE
      UPDATE staff_users SET username = 'consultant' WHERE id = row.id;
    END IF;
  END LOOP;
END $$;
