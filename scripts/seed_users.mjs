import bcrypt from 'bcryptjs';
import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'sretan_emr',
  user: 'postgres',
  password: 'postgres',
});

const TENANT_ID = '411d6eb9-5885-4abf-a815-46c5387f4d6a';

const users = [
  { email: 'doctor@sretan.com', name: 'Dr. Sarah Johnson', role: 'Doctor', password: 'doctor123' },
  { email: 'nurse@sretan.com', name: 'Nurse Michael Chen', role: 'Nurse', password: 'nurse123' },
  { email: 'lab@sretan.com', name: 'Lab Scientist Amina', role: 'Lab Scientist', password: 'lab123' },
  { email: 'pharmacy@sretan.com', name: 'Pharmacist James', role: 'Pharmacist', password: 'pharm123' },
  { email: 'records@sretan.com', name: 'Records Officer Blessing', role: 'Records', password: 'records123' },
  { email: 'paypoint@sretan.com', name: 'Paypoint Clerk Chidi', role: 'Paypoint', password: 'pay123' },
  { email: 'admin@sretan.com', name: 'Admin User', role: 'Admin', password: 'admin123' },
  { email: 'consultant@sretan.com', name: 'Dr. Consultant', role: 'Consultant', password: 'consultant', department: 'Gynae & Obstetrics' },
];

async function seed() {
  for (const u of users) {
    const hash = await bcrypt.hash(u.password, 10);
    let deptId = null;
    if (u.department) {
      const deptRes = await pool.query(
        `SELECT id FROM departments WHERE tenant_id = $1 AND name = $2`,
        [TENANT_ID, u.department]
      );
      deptId = deptRes.rows[0]?.id || null;
    }
    const existing = await pool.query(
      `SELECT id FROM staff_users WHERE tenant_id = $1 AND LOWER(email) = LOWER($2)`,
      [TENANT_ID, u.email]
    );
    if (existing.rows.length > 0) {
      await pool.query(
        `UPDATE staff_users SET name = $3, role = $4, password = $5, status = $6, department_id = $7
         WHERE id = $2`,
        [u.email, existing.rows[0].id, u.name, u.role, hash, 'active', deptId]
      );
      console.log('Updated:', u.email, '- Role:', u.role);
    } else {
      await pool.query(
        `INSERT INTO staff_users (tenant_id, email, name, role, password, status, department_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [TENANT_ID, u.email, u.name, u.role, hash, 'active', deptId]
      );
      console.log('Seeded:', u.email, '- Role:', u.role);
    }
  }
  await pool.end();
  console.log('Done.');
}

seed().catch((e) => { console.error(e); process.exit(1); });
