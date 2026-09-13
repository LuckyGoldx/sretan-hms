-- ============================================================
-- 094: Rename the seeded demo Specialist account's display name
--
-- The placeholder account created by 049_seed_consultant.sql is still named
-- "Dr. Consultant". Rename it to match the Specialist terminology. Scoped to
-- the seed account (email + exact old name) so real staff names are untouched.
-- Idempotent: safe to run on every server boot.
-- ============================================================

UPDATE staff_users
   SET name = 'Dr. Specialist',
       updated_at = NOW()
 WHERE email = 'consultant@sretan.com'
   AND name = 'Dr. Consultant';
