-- ============================================================
-- 092: Rename the clinical role 'Consultant' to 'Specialist'
--
-- The role is stored verbatim in staff_users.role and checked by the
-- server/client, so rename the stored value in place. Domain terms
-- (referrals.to_consultant_id, consultant_fee, ...) are unchanged.
-- Idempotent: safe to run on every server boot.
-- ============================================================

UPDATE staff_users
   SET role = 'Specialist',
       updated_at = NOW()
 WHERE role = 'Consultant';
