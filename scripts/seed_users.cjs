const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'sretan_emr',
  user: 'postgres',
  password: 'postgres',
});

const TENANT_ID = '411d6eb9-5885-4abf-a815-46c5387f4d6a';

const users = [
  { username: 'doctor', email: 'doctor@sretan.com', name: 'Dr. Sarah Johnson', role: 'Doctor', password: 'doctor123' },
  { username: 'nurse', email: 'nurse@sretan.com', name: 'Nurse Michael Chen', role: 'Nurse', password: 'nurse123' },
  { username: 'lab', email: 'lab@sretan.com', name: 'Lab Scientist Amina', role: 'Lab Scientist', password: 'lab123' },
  { username: 'pharmacy', email: 'pharmacy@sretan.com', name: 'Pharmacist James', role: 'Pharmacist', password: 'pharm123' },
  { username: 'records', email: 'records@sretan.com', name: 'Records Officer Blessing', role: 'Records', password: 'records123' },
  { username: 'paypoint', email: 'paypoint@sretan.com', name: 'Paypoint Clerk Chidi', role: 'Paypoint', password: 'pay123' },
  { username: 'admin', email: 'admin@sretan.com', name: 'Admin User', role: 'Admin', password: 'admin123' },
];

async function seed() {
  for (const u of users) {
    const hash = await bcrypt.hash(u.password, 10);
    await pool.query(
      `INSERT INTO staff_users (tenant_id, username, email, name, role, password, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO UPDATE SET username = $2, password = $6, role = $5`,
      [TENANT_ID, u.username, u.email, u.name, u.role, hash, 'active']
    );
    console.log('Seeded:', u.username, '/', u.email, '- Role:', u.role);
  }
  await pool.end();
  console.log('Done.');
}

seed().catch((e) => { console.error(e); process.exit(1); });
