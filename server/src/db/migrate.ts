import * as fs from 'fs';
import * as path from 'path';
import pool from './pool';

export async function runMigrations(): Promise<void> {
  const dbDir = path.join(__dirname, '..', '..', '..', 'database');
  if (!fs.existsSync(dbDir)) {
    console.warn('Database migration directory not found:', dbDir);
    return;
  }

  const files = fs.readdirSync(dbDir)
    .filter((f) => f.endsWith('.sql') && /^\d{3}_/.test(f))
    .sort();

  for (const file of files) {
    const filePath = path.join(dbDir, file);
    console.log(`Running migration: ${file}`);
    try {
      const sql = fs.readFileSync(filePath, 'utf-8');
      // Execute the entire file as a single query (supports functions/triggers with semicolons)
      try {
        await pool.query(sql);
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
        }
      }
    } catch (err: any) {
      console.error(`Failed to read ${file}:`, err.message);
    }
  }

  console.log('All migrations completed.');
}
