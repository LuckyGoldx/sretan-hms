import { ClinicProfile } from '../config/reader';
import pool from '../db/pool';

// Resolve the effective Supabase credentials for the active hospital.
// - CLOUD_SAAS hospitals use the GLOBAL provider credentials stored in
//   superadmin_settings (configured once in the Super Admin → Cloud & Sync page).
// - PRIVATE_SUPABASE (or legacy) hospitals use their own per-hospital
//   private_supabase_url / private_supabase_anon_key.
export async function resolveCloudCredentials(
  profile: ClinicProfile
): Promise<{ url: string; anonKey: string } | null> {
  if (profile.deployment_mode === 'CLOUD_SAAS') {
    try {
      const res = await pool.query(
        `SELECT setting_key, setting_value FROM superadmin_settings
         WHERE setting_key IN ('cloud_saas_supabase_url', 'cloud_saas_anon_key')`
      );
      const settings: Record<string, string> = {};
      for (const r of res.rows) settings[r.setting_key] = r.setting_value || '';
      if (settings.cloud_saas_supabase_url && settings.cloud_saas_anon_key) {
        return { url: settings.cloud_saas_supabase_url, anonKey: settings.cloud_saas_anon_key };
      }
      return null;
    } catch {
      return null;
    }
  }

  if (profile.private_supabase_url && profile.private_supabase_anon_key) {
    return { url: profile.private_supabase_url, anonKey: profile.private_supabase_anon_key };
  }
  return null;
}
