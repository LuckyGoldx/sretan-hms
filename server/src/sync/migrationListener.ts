import { Pool } from 'pg';
import axios from 'axios';
import { readClinicProfile } from '../config/reader';
import { resolveCloudCredentials } from './cloudCredentials';
import { applyTenantToProfile } from '../routes/superadmin';

// Pull the remote tenant_configurations row from Supabase and apply it locally.
// This is the "remote control" channel: a superadmin changing a hospital's
// subscription tier/status, modules, branding or deployment on the portal is
// synced up to Supabase, and every hospital in Private Cloud / Cloud SaaS mode
// pulls the change down on its next sync cycle (offline-first — applied
// whenever the machine next comes online).
export async function migrationListener(pool: Pool, profile: ReturnType<typeof readClinicProfile>): Promise<ReturnType<typeof readClinicProfile>> {
  try {
    if (!profile.GLOBAL_SAAS_TENANT_ID) {
      return profile;
    }

    const creds = await resolveCloudCredentials(profile);
    if (!creds) {
      return profile;
    }

    const supabaseUrl = creds.url.replace(/\/$/, '');
    const anonKey = creds.anonKey;

    const response = await axios.get(
      `${supabaseUrl}/rest/v1/tenant_configurations`,
      {
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
        },
        params: {
          tenant_id: `eq.${profile.GLOBAL_SAAS_TENANT_ID}`,
          select: '*',
          order: 'updated_at.desc',
          limit: '1',
        },
      }
    );

    if (!response.data || !Array.isArray(response.data) || response.data.length === 0) {
      return profile;
    }

    const remote = response.data[0];
    const localProfile = readClinicProfile();

    // Apply the remote configuration to the local tenant_configurations row so
    // subscription tier/status, modules, patterns and branding stay in sync.
    try {
      const existing = await pool.query(
        `SELECT id FROM tenant_configurations WHERE tenant_id = $1`,
        [profile.GLOBAL_SAAS_TENANT_ID]
      );
      if (existing.rows.length > 0) {
        const cols: string[] = [];
        const vals: any[] = [];
        const fields = [
          'hospital_name', 'address', 'phone_number', 'currency_symbol',
          'primary_brand_color', 'secondary_brand_color', 'ui_theme_class',
          'deployment_mode', 'cloud_sync_enabled', 'private_supabase_url', 'private_supabase_anon_key',
          'subscription_tier', 'subscription_status',
          'module_records', 'module_triage', 'module_consultation', 'module_laboratory',
          'module_pharmacy', 'module_radiology', 'module_finance_hmo',
          'module_maternity', 'module_insurance', 'module_referrals', 'module_appointments',
          'module_admissions', 'module_paypoint', 'module_store',
          'module_doctor', 'module_nurses', 'module_consultants',
          'hospital_number_prefix', 'hospital_number_include_year',
          'number_pattern_hospital', 'number_pattern_lab', 'number_pattern_anc',
          'number_pattern_radiology', 'number_pattern_receipt', 'number_pattern_referral',
          'number_pattern_case', 'number_pattern_auth',
        ];
        for (const f of fields) {
          if (remote[f] !== undefined && remote[f] !== null) {
            cols.push(`"${f}" = $${vals.length + 1}`);
            vals.push(remote[f]);
          }
        }
        if (cols.length) {
          vals.push(profile.GLOBAL_SAAS_TENANT_ID);
          await pool.query(
            `UPDATE tenant_configurations SET ${cols.join(', ')} WHERE tenant_id = $${vals.length}`,
            vals
          );
        }
      }
    } catch (cfgErr: any) {
      console.warn('Migration: failed to apply remote config row:', cfgErr.message);
    }

    // Apply branding/theme/deployment/subscription to the running profile when
    // this is the active hospital so the app reflects remote changes.
    const tenant = { id: profile.GLOBAL_SAAS_TENANT_ID, hospital_name: remote.hospital_name || localProfile.hospital_name };
    const hasProfileChange =
      (remote.primary_brand_color && remote.primary_brand_color !== localProfile.primary_brand_color) ||
      (remote.secondary_brand_color && remote.secondary_brand_color !== localProfile.secondary_brand_color) ||
      (remote.ui_theme_class && remote.ui_theme_class !== localProfile.ui_theme_class) ||
      (remote.deployment_mode && remote.deployment_mode !== localProfile.deployment_mode) ||
      (remote.hospital_name && remote.hospital_name !== localProfile.hospital_name) ||
      (remote.subscription_tier && remote.subscription_tier !== (localProfile as any).subscription_tier) ||
      (remote.subscription_status && remote.subscription_status !== (localProfile as any).subscription_status);

    if (hasProfileChange) {
      applyTenantToProfile(tenant, remote);
      console.log('Migration: applied remote configuration locally.');

      // If the deployment mode changed, re-queue everything for a full re-sync.
      if (remote.deployment_mode && remote.deployment_mode !== localProfile.deployment_mode) {
        const tables = await getSyncTablesForReset(pool);
        for (const table of tables) {
          try { await pool.query(`UPDATE "${table}" SET is_synced = false`); } catch {}
        }
        console.log('Migration: deployment mode changed — all rows queued for full re-sync.');
      }
    }

    return readClinicProfile();
  } catch (err: any) {
    if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
      console.log('Migration listener: Supabase unavailable, using local config.');
    } else {
      console.error('Migration listener error:', err.message);
    }
    return readClinicProfile();
  }
}

async function getSyncTablesForReset(pool: Pool): Promise<string[]> {
  const res = await pool.query(
    `SELECT DISTINCT c.table_name FROM information_schema.columns c
     WHERE c.table_schema = 'public' AND c.column_name = 'tenant_id'
       AND EXISTS (SELECT 1 FROM information_schema.columns c2
                   WHERE c2.table_schema = 'public' AND c2.table_name = c.table_name AND c2.column_name = 'is_synced')
     ORDER BY c.table_name`
  );
  return res.rows.map((r: any) => r.table_name);
}
