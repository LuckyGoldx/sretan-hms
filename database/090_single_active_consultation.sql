-- Enforce one active consultation per specialist.
--
-- A specialist can only be with one patient at a time, but the queue
-- historically allowed several referrals to sit in 'in_consultation' at once
-- (a start was never completed before the next patient was started, before the
-- server-side guard existed).
--
-- 1) Reconcile the existing rows: for each specialist keep the referral whose
--    consultation started most recently and return the older ones to
--    'accepted' (they were accepted and never completed). Every change is
--    written to audit_logs.
-- 2) Enforce the rule at the database level with a partial unique index, so a
--    race between two concurrent starts can never both succeed.

WITH ranked AS (
  SELECT r.id,
         ROW_NUMBER() OVER (
           PARTITION BY r.tenant_id, COALESCE(r.to_consultant_id, r.accepted_by)
           ORDER BY COALESCE(r.accepted_at, r.updated_at, r.created_at) DESC,
                    r.created_at DESC,
                    r.id
         ) AS rn
    FROM referrals r
   WHERE r.status = 'in_consultation'
     AND COALESCE(r.to_consultant_id, r.accepted_by) IS NOT NULL
),
to_demote AS (
  SELECT r.* FROM referrals r JOIN ranked ON ranked.id = r.id WHERE ranked.rn > 1
),
updated AS (
  UPDATE referrals r
     SET status = 'accepted'
    FROM ranked
   WHERE r.id = ranked.id AND ranked.rn > 1
   RETURNING r.*
)
INSERT INTO audit_logs (tenant_id, action, table_name, record_id, performed_by, old_data, new_data)
SELECT u.tenant_id, 'UPDATE', 'referrals', u.id, NULL,
       (SELECT to_jsonb(t) FROM to_demote t WHERE t.id = u.id),
       to_jsonb(u)
  FROM updated u;

CREATE UNIQUE INDEX IF NOT EXISTS uq_referral_single_active_consult
  ON referrals (tenant_id, COALESCE(to_consultant_id, accepted_by))
  WHERE status = 'in_consultation'
    AND COALESCE(to_consultant_id, accepted_by) IS NOT NULL;
