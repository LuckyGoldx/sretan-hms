import { Pool } from 'pg';
import axios from 'axios';
import { ClinicProfile } from '../config/reader';

const SYNC_TABLES = [
  'patients', 'encounters', 'vitals', 'prescriptions',
  'lab_orders', 'lab_results', 'radiology_orders',
  'billing_invoices', 'inventory_items', 'audit_logs',
];

export async function upwardSync(pool: Pool, profile: ClinicProfile): Promise<void> {
  if (!profile.private_supabase_url || !profile.private_supabase_anon_key) {
    console.log('Upward sync skipped: Supabase credentials not configured');
    return;
  }

  const supabaseUrl = profile.private_supabase_url.replace(/\/$/, '');
  const headers = {
    apikey: profile.private_supabase_anon_key,
    Authorization: `Bearer ${profile.private_supabase_anon_key}`,
    'Content-Type': 'application/json',
    Prefer: 'return=minimal',
  };

  for (const table of SYNC_TABLES) {
    try {
      let offset = 0;
      const batchSize = 100;

      while (true) {
        const result = await pool.query(
          `SELECT * FROM ${table} WHERE is_synced = false ORDER BY created_at ASC LIMIT $1 OFFSET $2`,
          [batchSize, offset]
        );

        if (result.rows.length === 0) break;

        const rows = result.rows.map((row: any) => {
          const { is_synced, last_synced_at, ...data } = row;
          return data;
        });

        try {
          const response = await axios.post(
            `${supabaseUrl}/rest/v1/${table}`,
            rows,
            { headers }
          );

          if (response.status === 200 || response.status === 201) {
            const ids = result.rows.map((r: any) => r.id);
            await pool.query(
              `UPDATE ${table} SET is_synced = true, last_synced_at = NOW() WHERE id = ANY($1::uuid[])`,
              [ids]
            );
          }
        } catch (apiErr: any) {
          if (apiErr.response) {
            console.error(`Upward sync error for ${table} (status ${apiErr.response.status}):`, apiErr.response.data);
          } else {
            console.error(`Upward sync network error for ${table}:`, apiErr.message);
          }
        }

        offset += batchSize;
      }
    } catch (err: any) {
      console.error(`Upward sync query error for ${table}:`, err.message);
    }
  }
}
