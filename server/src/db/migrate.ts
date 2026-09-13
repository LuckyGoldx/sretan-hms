import * as fs from 'fs';
import * as path from 'path';
import pool from './pool';

const TRACKING_TABLE = 'schema_migrations';

export async function runMigrations(): Promise<void> {
  const dbDir = path.join(__dirname, '..', '..', '..', 'database');
  if (!fs.existsSync(dbDir)) {
    console.warn('Database migration directory not found:', dbDir);
    return;
  }

  const files = fs.readdirSync(dbDir)
    .filter((f) => f.endsWith('.sql') && /^\d{3}_/.test(f))
    .sort();

  // Migrations may legitimately run longer than the pool's statement_timeout
  // (e.g. creating many indexes on a large table), so they use a dedicated
  // client with the timeout disabled.
  const client = await pool.connect();
  try {
    await client.query('SET statement_timeout = 0');

    await client.query(
      `CREATE TABLE IF NOT EXISTS ${TRACKING_TABLE} (
         filename   text PRIMARY KEY,
         applied_at timestamptz NOT NULL DEFAULT NOW()
       )`
    );

    // Only apply migrations that have not been recorded yet. On the first boot
    // after this change the tracking table is empty, so every existing file runs
    // once (idempotently) and is then recorded; later boots skip them entirely.
    const appliedRes = await client.query(`SELECT filename FROM ${TRACKING_TABLE}`);
    const applied = new Set<string>(appliedRes.rows.map((r: any) => r.filename));

    const pending = files.filter((f) => !applied.has(f));
    if (pending.length === 0) {
      console.log(`Database schema up to date (${files.length} migrations).`);
      return;
    }

    console.log(`Applying ${pending.length} pending migration(s) of ${files.length} total.`);
    for (const file of pending) {
      const filePath = path.join(dbDir, file);
      console.log(`Running migration: ${file}`);
      let successful = true;
      try {
        const sql = fs.readFileSync(filePath, 'utf-8');
        // Execute the entire file as a single query (supports functions/triggers with semicolons)
        try {
          await client.query(sql);
          console.log(`  Done: ${file}`);
        } catch (err: any) {
          // Ignore "already exists" errors for tables/columns/triggers
          const msg = err.message || '';
          if (
            msg.includes('already exists') ||
            msg.includes('duplicate key') ||
            msg.includes('duplicate column')
          ) {
            console.log(`  Skipped (already applied): ${msg.slice(0, 100)}`);
          } else {
            console.error(`  Error in ${file}:`, msg.slice(0, 300));
            successful = false;
          }
        }
      } catch (err: any) {
        console.error(`Failed to read ${file}:`, err.message);
        successful = false;
      }

      // Record only files that applied cleanly, so a genuinely failed migration
      // is retried on the next boot instead of being silently skipped forever.
      if (successful) {
        await client.query(
          `INSERT INTO ${TRACKING_TABLE} (filename) VALUES ($1) ON CONFLICT (filename) DO NOTHING`,
          [file]
        ).catch(() => {});
      }
    }

    console.log('All pending migrations completed.');
  } finally {
    client.release();
  }
}
