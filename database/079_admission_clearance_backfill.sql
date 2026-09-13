-- ============================================================
-- 079: Backfill admission clearance status
--
-- 078 added `clearance_status` with DEFAULT 'pending', which Postgres also
-- applied to pre-existing rows, so the intended backfill (which looked for
-- NULL) did not fire. This corrects historical, non-active admissions to
-- 'cleared' while leaving currently-active admissions as 'pending'.
--
-- Idempotent: safe to run on every server boot.
-- ============================================================

UPDATE admissions
   SET clearance_status = 'cleared'
 WHERE status <> 'active'
   AND clearance_status = 'pending'
   AND cleared_at IS NULL;
