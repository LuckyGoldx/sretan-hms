import * as fs from 'fs';
import * as path from 'path';
import pool from './pool';

export async function ensureSchema(): Promise<void> {
  try {
    const result = await pool.query(
      `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'tenants')`
    );
    const tableExists = result.rows[0].exists;

    if (!tableExists) {
      const sqlPath = path.join(__dirname, '..', '..', '..', 'database', '001_multi_tenant_schema.sql');
      if (fs.existsSync(sqlPath)) {
        const sql = fs.readFileSync(sqlPath, 'utf-8');
        await pool.query(sql);
        console.log('Database schema applied successfully.');
      } else {
        console.warn(`Migration file not found at: ${sqlPath}`);
      }
    } else {
      console.log('Database schema already exists.');
    }

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
