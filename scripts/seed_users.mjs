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
];

async function seed() {
  for (const u of users) {
    const hash = await bcrypt.hash(u.password, 10);
    await pool.query(
      `INSERT INTO staff_users (tenant_id, email, name, role, password, status)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE SET password = $5, role = $4`,
      [TENANT_ID, u.email, u.name, u.role, hash, 'active']
    );
    console.log('Seeded:', u.email, '- Role:', u.role);
  }
  await pool.end();
  console.log('Done.');
}

seed().catch((e) => { console.error(e); process.exit(1); });
