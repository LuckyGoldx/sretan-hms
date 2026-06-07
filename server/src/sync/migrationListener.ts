import { Pool } from 'pg';
import axios from 'axios';
import { ClinicProfile, readClinicProfile, writeProfile } from '../config/reader';

export async function migrationListener(pool: Pool, profile: ClinicProfile): Promise<ClinicProfile> {
  try {
    if (!profile.GLOBAL_SAAS_TENANT_ID) {
      return profile;
    }

    const supabaseUrl = profile.private_supabase_url?.replace(/\/$/, '');
    const anonKey = profile.private_supabase_anon_key;

    if (!supabaseUrl || !anonKey) {
      return profile;
    }

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
        },
      }
    );

    if (!response.data || !Array.isArray(response.data) || response.data.length === 0) {
      return profile;
    }

    const remoteConfig = response.data[0];
    const localProfile = readClinicProfile();
    const updates: Partial<ClinicProfile> = {};

    if (remoteConfig.primary_brand_color) {
      updates.primary_brand_color = remoteConfig.primary_brand_color;
    }
    if (remoteConfig.secondary_brand_color) {
      updates.secondary_brand_color = remoteConfig.secondary_brand_color;
    }
    if (remoteConfig.ui_theme_class) {
      updates.ui_theme_class = remoteConfig.ui_theme_class;
    }

    if (remoteConfig.deployment_mode) {
      const remoteMode = remoteConfig.deployment_mode as ClinicProfile['deployment_mode'];

      if (remoteMode === 'OFFLINE_STANDALONE' && localProfile.deployment_mode !== 'OFFLINE_STANDALONE') {
        updates.deployment_mode = 'OFFLINE_STANDALONE';
        updates.cloud_sync_enabled = false;
        console.log('ISOLATION ALERT: Deployment mode changed to OFFLINE_STANDALONE. Cloud sync disabled.');
      } else if (remoteMode === 'PRIVATE_SUPABASE' && remoteConfig.private_supabase_url) {
        updates.deployment_mode = 'PRIVATE_SUPABASE';
        updates.private_supabase_url = remoteConfig.private_supabase_url;
        updates.private_supabase_anon_key = remoteConfig.private_supabase_anon_key || '';
        updates.cloud_sync_enabled = true;

        try {
          await pool.query(`UPDATE patients SET is_synced = false`);
          await pool.query(`UPDATE encounters SET is_synced = false`);
          await pool.query(`UPDATE vitals SET is_synced = false`);
          await pool.query(`UPDATE prescriptions SET is_synced = false`);
          await pool.query(`UPDATE lab_orders SET is_synced = false`);
          await pool.query(`UPDATE lab_results SET is_synced = false`);
          await pool.query(`UPDATE radiology_orders SET is_synced = false`);
          await pool.query(`UPDATE billing_invoices SET is_synced = false`);
          await pool.query(`UPDATE inventory_items SET is_synced = false`);
          await pool.query(`UPDATE audit_logs SET is_synced = false`);
          console.log('Migration: All rows marked as unsynced for full re-sync.');
        } catch (dbErr: any) {
          console.error('Migration: Failed to reset sync flags:', dbErr.message);
        }
      }
    }

    const mergedProfile: ClinicProfile = { ...localProfile, ...updates };
    writeProfile(mergedProfile);

    return mergedProfile;
  } catch (err: any) {
    if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
      console.log('Migration listener: Supabase unavailable, using local config.');
    } else {
      console.error('Migration listener error:', err.message);
    }
    return profile;
  }
}
