-- ============================================================
-- 063: Make EVERY tenant-scoped table cloud-syncable by adding
-- is_synced / last_synced_at / updated_at (+ trigger) where missing.
-- The sync daemon discovers tables dynamically, so any future
-- table with a tenant_id column becomes syncable automatically.
-- Idempotent: safe to run on every server boot.
-- ============================================================

DO $$
DECLARE
  t TEXT;
  trig TEXT;
BEGIN
  FOR t IN
    SELECT DISTINCT table_name FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name = 'tenant_id'
  LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS is_synced BOOLEAN DEFAULT FALSE', t);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ', t);
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = t AND column_name = 'updated_at') THEN
      EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()', t);
    END IF;
    trig := 'update_' || replace(t, ' ', '_') || '_updated_at';
    IF NOT EXISTS (SELECT 1 FROM pg_trigger tr
                   JOIN pg_proc p ON p.oid = tr.tgfoid
                   WHERE tr.tgrelid = format('public.%I', t)::regclass
                     AND (p.proname = 'update_updated_at_column' OR tr.tgname = trig)
                     AND NOT tr.tgisinternal) THEN
      EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()', trig, t);
    END IF;
  END LOOP;
END $$;
