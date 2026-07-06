import * as fs from 'fs';
import * as path from 'path';
import pool from './pool';
import { runMigrations } from './migrate';

export async function ensureSchema(): Promise<void> {
  try {
    await runMigrations();

    const tenantCount = await pool.query('SELECT COUNT(*)::int as count FROM tenants');
    if (tenantCount.rows[0].count === 0) {
      await pool.query(
        `INSERT INTO tenants (hospital_name, subscription_status, subscription_tier)
         VALUES ('Default Hospital', 'active', 'standard')`
      );
      console.log('Default tenant created.');
    }
  } catch (err) {
    console.error('Database initialization error:', err);
    throw err;
  }
}
