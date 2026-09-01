import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import { getSyncTables } from '../sync/upwardSync';

const MIGRATIONS_DIR = path.resolve(__dirname, '..', '..', '..', 'database');

export function getMigrationFiles(): string[] {
  try {
    return fs.readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql') && /^\d{3}_/.test(f))
      .sort();
  } catch {
    return [];
  }
}

export function getLocalSchemaVersion(): string {
  const files = getMigrationFiles();
  return files.length ? files[files.length - 1] : '';
}

async function getSetting(pool: Pool, key: string): Promise<string> {
  try {
    const res = await pool.query(
      `SELECT setting_value FROM superadmin_settings WHERE setting_key = $1`,
      [key]
    );
    return res.rows[0]?.setting_value || '';
  } catch {
    return '';
  }
}

async function setSetting(pool: Pool, key: string, value: string): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO superadmin_settings (setting_key, setting_value)
       VALUES ($1, $2)
       ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = NOW()`,
      [key, value]
    );
  } catch {}
}

// Run after local migrations are applied. If new migration files exist since the
// last boot, reset every syncable table's is_synced flag so the next cloud sync
// re-pushes ALL rows (old data + newly added columns/tables) to Supabase.
export async function detectSchemaChanges(pool: Pool): Promise<void> {
  try {
    const localVersion = getLocalSchemaVersion();
    if (!localVersion) return;

    const stored = await getSetting(pool, 'schema_version_local');
    if (stored === localVersion) return;

    const tables = await getSyncTables(pool);
    let resetCount = 0;
    for (const table of tables) {
      try {
        const res = await pool.query(`UPDATE "${table}" SET is_synced = false`);
        resetCount += res.rowCount || 0;
      } catch {}
    }

    await setSetting(pool, 'schema_version_local', localVersion);
    console.log(
      `[schema] Local schema changed (${stored || 'none'} -> ${localVersion}). ` +
        `Reset is_synced on ${tables.length} tables (${resetCount} rows) for full cloud re-push.`
    );
  } catch (err: any) {
    console.warn('[schema] detectSchemaChanges failed:', err.message);
  }
}

export async function getSchemaStatus(pool: Pool): Promise<{
  local_version: string;
  cloud_version: string;
  has_new_schema: boolean;
  new_migrations: string[];
  migration_count: number;
}> {
  const localVersion = getLocalSchemaVersion();
  const cloudVersion = await getSetting(pool, 'schema_version_cloud');
  const files = getMigrationFiles();
  const newMigrations = cloudVersion
    ? files.slice(files.indexOf(cloudVersion) + 1)
    : [];
  return {
    local_version: localVersion,
    cloud_version: cloudVersion,
    has_new_schema: !!localVersion && localVersion !== cloudVersion,
    new_migrations: newMigrations.filter(Boolean),
    migration_count: files.length,
  };
}

// Mark the current schema as applied to the cloud (user ran it in Supabase).
export async function ackCloudSchema(pool: Pool): Promise<string> {
  const localVersion = getLocalSchemaVersion();
  await setSetting(pool, 'schema_version_cloud', localVersion);
  return localVersion;
}
