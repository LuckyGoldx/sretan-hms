import { Pool } from 'pg';
import axios from 'axios';
import { ClinicProfile } from '../config/reader';
import { resolveCloudCredentials } from './cloudCredentials';

// Discover syncable tables dynamically: any tenant-scoped table with
// is_synced + updated_at columns. Future tables added via migrations are
// included automatically as long as they carry a tenant_id column.
export async function getSyncTables(pool: Pool): Promise<string[]> {
  const res = await pool.query(
    `SELECT DISTINCT c.table_name
     FROM information_schema.columns c
     WHERE c.table_schema = 'public' AND c.column_name = 'tenant_id'
       AND EXISTS (SELECT 1 FROM information_schema.columns c2
                   WHERE c2.table_schema = 'public' AND c2.table_name = c.table_name AND c2.column_name = 'is_synced')
       AND EXISTS (SELECT 1 FROM information_schema.columns c3
                   WHERE c3.table_schema = 'public' AND c3.table_name = c.table_name AND c3.column_name = 'updated_at')
     ORDER BY c.table_name`
  );
  return res.rows.map((r: any) => r.table_name);
}

export async function upwardSync(pool: Pool, profile: ClinicProfile): Promise<void> {
  const creds = await resolveCloudCredentials(profile);
  if (!creds) {
    console.log('Upward sync skipped: Supabase credentials not configured');
    return;
  }

  const tenantId = profile.GLOBAL_SAAS_TENANT_ID;
  if (!tenantId) return;

  const supabaseUrl = creds.url.replace(/\/$/, '');
  const headers = {
    apikey: creds.anonKey,
    Authorization: `Bearer ${creds.anonKey}`,
    'Content-Type': 'application/json',
    Prefer: 'return=minimal',
  };

  const tables = await getSyncTables(pool);
  let pushed = 0;

  for (const table of tables) {
    try {
      let offset = 0;
      const batchSize = 100;

      while (true) {
        const result = await pool.query(
          `SELECT * FROM "${table}" WHERE tenant_id = $1 AND is_synced = false ORDER BY id ASC LIMIT $2 OFFSET $3`,
          [tenantId, batchSize, offset]
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
              `UPDATE "${table}" SET is_synced = true, last_synced_at = NOW() WHERE id = ANY($1::uuid[]) AND tenant_id = $2`,
              [ids, tenantId]
            );
            pushed += result.rows.length;
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

  if (pushed > 0) console.log(`Upward sync: ${pushed} row(s) pushed to cloud (${tables.length} tables).`);
}
