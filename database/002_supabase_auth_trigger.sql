-- Sretan EMR: Supabase Authentication Replication Trigger
-- Automatically replicates new auth.users to public.staff_users

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.staff_users (id, tenant_id, email, name, role, is_synced, last_synced_at)
  VALUES (
    NEW.id,
    (NEW.raw_user_meta_data ->> 'tenant_id')::uuid,
    NEW.email,
    NEW.raw_user_meta_data ->> 'name',
    NEW.raw_user_meta_data ->> 'role',
    true,
    NOW()
  );
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Failed to replicate user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
