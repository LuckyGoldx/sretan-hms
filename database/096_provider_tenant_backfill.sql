-- ============================================================
-- 096: Reassign the seeded insurance provider catalogue to the
--      hospital's real tenant.
--
-- The provider seed wrote every row with a placeholder all-zero tenant
-- ('00000000-0000-0000-0000-000000000000'). /insurance/providers filters by
-- the hospital tenant, so Greenfield HMO and the rest of the seeded catalogue
-- were invisible in the providers screen even though patient policies and
-- cases reference them (and billing priced against their rules).
--
-- Move every placeholder-tenant provider to the tenant that the real data
-- (patient policies / cases) actually belongs to. Idempotent.
-- ============================================================

WITH target AS (
  SELECT tenant_id
    FROM (
      SELECT tenant_id FROM patient_insurance_policies
       WHERE tenant_id IS NOT NULL AND tenant_id <> '00000000-0000-0000-0000-000000000000'
      UNION ALL
      SELECT tenant_id FROM insurance_cases
       WHERE tenant_id IS NOT NULL AND tenant_id <> '00000000-0000-0000-0000-000000000000'
    ) src
   GROUP BY tenant_id
   ORDER BY COUNT(*) DESC
   LIMIT 1
)
UPDATE insurance_providers p
   SET tenant_id = (SELECT tenant_id FROM target),
       updated_at = NOW()
 WHERE p.tenant_id = '00000000-0000-0000-0000-000000000000'
   AND EXISTS (SELECT 1 FROM target);
