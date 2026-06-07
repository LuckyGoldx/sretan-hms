import { Pool } from 'pg';
import axios from 'axios';
import { ClinicProfile } from '../config/reader';
import { clockGuard } from '../middleware/clockGuard';

const SYNC_TABLES = [
  'patients', 'encounters', 'vitals', 'prescriptions',
  'lab_orders', 'lab_results', 'radiology_orders',
  'billing_invoices', 'inventory_items', 'audit_logs',
];

export async function downwardSync(pool: Pool, profile: ClinicProfile): Promise<void> {
  if (!profile.private_supabase_url || !profile.private_supabase_anon_key) {
    console.log('Downward sync skipped: Supabase credentials not configured');
    return;
  }

  const supabaseUrl = profile.private_supabase_url.replace(/\/$/, '');
  const headers = {
    apikey: profile.private_supabase_anon_key,
    Authorization: `Bearer ${profile.private_supabase_anon_key}`,
  };

  for (const table of SYNC_TABLES) {
    try {
      const lastSyncResult = await pool.query(
        `SELECT COALESCE(MAX(last_synced_at), '1970-01-01'::timestamptz) as last_sync FROM ${table}`
      );
      const lastSyncedAt = lastSyncResult.rows[0]?.last_sync || '1970-01-01T00:00:00Z';

      const response = await axios.get(
        `${supabaseUrl}/rest/v1/${table}`,
        {
          headers,
          params: {
            select: '*',
            updated_at: `gt.${lastSyncedAt}`,
            order: 'updated_at.asc',
          },
        }
      );

      if (response.data && Array.isArray(response.data) && response.data.length > 0) {
        for (const row of response.data) {
          try {
            await clockGuard(pool, table);

            const existing = await pool.query(
              `SELECT id FROM ${table} WHERE id = $1`,
              [row.id]
            );

            if (existing.rows.length > 0) {
              const { id, created_at, updated_at, ...updateData } = row;
              const setClauses = Object.keys(updateData)
                .map((key, i) => `${key} = $${i + 2}`)
                .join(', ');
              const values = Object.values(updateData);
              await pool.query(
                `UPDATE ${table} SET ${setClauses} WHERE id = $1`,
                [id, ...values]
              );
            } else {
              const columns = Object.keys(row).join(', ');
              const placeholders = Object.keys(row).map((_, i) => `$${i + 1}`).join(', ');
              const values = Object.values(row);
              await pool.query(
                `INSERT INTO ${table} (${columns}) VALUES (${placeholders}) ON CONFLICT (id) DO NOTHING`,
                values
              );
            }
          } catch (rowErr: any) {
            if (rowErr.name === 'ClockGuardError') throw rowErr;
            console.error(`Downward sync upsert error for ${table} row ${row.id}:`, rowErr.message);
          }
        }

        console.log(`Downward sync: ${response.data.length} rows synced for ${table}`);
      }
    } catch (err: any) {
      if (err.name === 'ClockGuardError') throw err;
      if (err.response) {
        console.error(`Downward sync error for ${table} (status ${err.response.status}):`, err.response.data);
      } else {
        console.error(`Downward sync network error for ${table}:`, err.message);
      }
    }
  }
}
