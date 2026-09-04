import { Router, Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { spawn, execFileSync } from 'child_process';
import multer from 'multer';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import pool from '../db/pool';
import { readClinicProfile, writeProfile } from '../config/reader';
import { ensureSchema } from '../db/init';
import { superadminAuth, SUPERADMIN_TOKEN } from '../middleware/superadminAuth';
import { getSchemaStatus, ackCloudSchema } from '../utils/schemaVersion';
import {
  getCachedUpdateStatus,
  refreshUpdateCache,
  pullUpdate,
  persistUpdateReport,
  getUpdateReportRow,
  sanitizeRepoUrl,
  urlHasEmbeddedCredentials,
} from '../utils/updateDaemon';
import { resolveCloudCredentials } from '../sync/cloudCredentials';
import axios from 'axios';

const router = Router();

const BACKUP_DIR = 'C:/hms/backups';
const ASSETS_DIR = 'C:/hms/assets';
const CONFIG_DIR = 'C:/hms/config';
const CONFIG_FILE = path.join(CONFIG_DIR, 'clinic_profile.json');
const UPLOADS_DIR = path.resolve(__dirname, '..', 'uploads');
const MIGRATIONS_DIR = path.resolve(__dirname, '..', '..', '..', 'database');

const VALID_ROLES = ['Doctor', 'Nurse', 'Lab Scientist', 'Pharmacist', 'Records', 'Paypoint', 'Admin', 'Finance', 'Radiology', 'Consultant'];

const DEFAULT_DEPARTMENTS: Array<[string, string, string]> = [
  ['General Medicine', 'MED', 'Internal medicine and general consultation'],
  ['Paediatrics', 'PED', 'Child and adolescent care'],
  ['Gynae & Obstetrics', 'O&G', 'Women health, antenatal, labour and delivery'],
  ['Surgery', 'SUR', 'General and specialty surgery'],
  ['Orthopaedics', 'ORT', 'Bones, joints and musculoskeletal care'],
  ['ENT', 'ENT', 'Ear, nose and throat care'],
  ['Ophthalmology', 'OPH', 'Eye care and vision'],
  ['Cardiology', 'CAR', 'Heart and cardiovascular care'],
  ['Neurology', 'NEU', 'Brain and nervous system care'],
  ['Dermatology', 'DER', 'Skin care'],
  ['Psychiatry', 'PSY', 'Mental health care'],
  ['Urology', 'URO', 'Urinary tract and male reproductive care'],
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function dbEnv() {
  return {
    host: process.env.PG_HOST || 'localhost',
    port: process.env.PG_PORT || '5432',
    database: process.env.PG_DATABASE || 'sretan_emr',
    user: process.env.PG_USER || 'postgres',
    password: process.env.PG_PASSWORD || 'postgres',
  };
}

function pgBinDirs(): string[] {
  const dirs: string[] = [];
  if (process.env.PG_BIN_DIR) dirs.push(process.env.PG_BIN_DIR);
  const base = 'C:/Program Files/PostgreSQL';
  try {
    if (fs.existsSync(base)) {
      const versions = fs.readdirSync(base).filter((d) => /^\d+$/.test(d)).sort().reverse();
      for (const v of versions) {
        const p = path.join(base, v, 'bin');
        if (fs.existsSync(p) && !dirs.includes(p)) dirs.push(p);
      }
    }
  } catch {}
  return dirs;
}

function resolvePgTool(tool: 'pg_dump' | 'pg_restore' | 'psql'): string {
  const exe = process.platform === 'win32' ? `${tool}.exe` : tool;
  const pathDirs = (process.env.PATH || '').split(path.delimiter);
  for (const d of pathDirs) {
    try { if (d && fs.existsSync(path.join(d, exe))) return path.join(d, exe); } catch {}
  }
  for (const d of pgBinDirs()) {
    try { if (fs.existsSync(path.join(d, exe))) return path.join(d, exe); } catch {}
  }
  return tool;
}

function runCmd(exe: string, args: string[], cwd?: string): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(exe, args, {
      env: { ...process.env as NodeJS.ProcessEnv, PGPASSWORD: dbEnv().password } as NodeJS.ProcessEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      cwd,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('error', (err) => reject(err));
    child.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${path.basename(exe)} failed (exit ${code}): ${(stderr || stdout).slice(0, 800)}`));
    });
  });
}

function copyDirIfExists(src: string, dest: string): void {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const e of entries) {
    const s = path.join(src, e.name);
    const d = path.join(dest, e.name);
    if (e.isDirectory()) copyDirIfExists(s, d);
    else if (e.isFile()) {
      try { fs.copyFileSync(s, d); } catch {}
    }
  }
}

function isValidBackupName(name: string): boolean {
  return /^[A-Za-z0-9._-]+$/.test(name) && name.toLowerCase().endsWith('.sbackup');
}

function param(v: unknown): string {
  if (Array.isArray(v)) return String(v[0] || '');
  return v == null ? '' : String(v);
}

// ---------------------------------------------------------------------------
// Per-tenant (hospital-level) backup helpers.
// Discover tenant-scoped tables dynamically so any future table with a
// tenant_id column is automatically included in exports and cleared on
// restore without affecting other hospitals.
// ---------------------------------------------------------------------------

function quoteIdent(name: string): string {
  return '"' + name.replace(/"/g, '""') + '"';
}

async function getTenantScopedTables(client: any): Promise<string[]> {
  const res = await client.query(
    `SELECT DISTINCT table_name
     FROM information_schema.columns
     WHERE table_schema = 'public' AND column_name = 'tenant_id'
     ORDER BY table_name`
  );
  return res.rows.map((r: any) => r.table_name);
}

async function tenantFkGraph(client: any, tables: string[]): Promise<Map<string, string[]>> {
  const res = await client.query(
    `SELECT tc.table_name AS child, ccu.table_name AS parent
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu
       ON kcu.constraint_name = tc.constraint_name AND kcu.table_name = tc.table_name
     JOIN information_schema.constraint_column_usage ccu
       ON ccu.constraint_name = tc.constraint_name
     WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'`
  );
  const set = new Set(tables);
  const graph = new Map<string, string[]>();
  for (const t of tables) graph.set(t, []);
  for (const r of res.rows) {
    if (set.has(r.child) && set.has(r.parent) && r.child !== r.parent) {
      const parents = graph.get(r.child)!;
      if (!parents.includes(r.parent)) parents.push(r.parent);
    }
  }
  return graph;
}

function fkOrder(graph: Map<string, string[]>): { insert: string[]; del: string[] } {
  const state = new Map<string, number>();
  const post: string[] = [];
  const visit = (t: string) => {
    const s = state.get(t) || 0;
    if (s === 2) return;
    if (s === 1) return; // cycle guard; transaction rollback keeps restore safe
    state.set(t, 1);
    for (const p of graph.get(t) || []) visit(p);
    state.set(t, 2);
    post.push(t);
  };
  for (const t of graph.keys()) visit(t);
  return { insert: post, del: [...post].reverse() };
}

async function exportTenantData(client: any, tenantId: string): Promise<Array<{ table: string; rows: any[] }>> {
  const tables = await getTenantScopedTables(client);
  const out: Array<{ table: string; rows: any[] }> = [];
  for (const t of tables) {
    const res = await client.query(`SELECT * FROM ${quoteIdent(t)} WHERE tenant_id = $1`, [tenantId]);
    out.push({ table: t, rows: res.rows });
  }
  return out;
}

async function deleteTenantRows(client: any, tenantId: string): Promise<string[]> {
  const tables = await getTenantScopedTables(client);
  const graph = await tenantFkGraph(client, tables);
  const { del } = fkOrder(graph);
  for (const t of del) {
    await client.query(`DELETE FROM ${quoteIdent(t)} WHERE tenant_id = $1`, [tenantId]);
  }
  return tables;
}

async function importTenantRows(client: any, tenantId: string, data: Array<{ table: string; rows: any[] }>): Promise<number> {
  const tables = data.map((d) => d.table);
  const graph = await tenantFkGraph(client, tables);
  const { insert } = fkOrder(graph);
  let inserted = 0;
  for (const t of insert) {
    const d = data.find((x) => x.table === t);
    if (!d || !d.rows.length) continue;
    const colsRes = await client.query(
      `SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
      [t]
    );
    const colTypes = new Map(colsRes.rows.map((r: any) => [r.column_name, r.data_type]));
    const existing = new Set(colTypes.keys());
    const validCols = Object.keys(d.rows[0]).filter((c) => existing.has(c));
    if (!validCols.length) continue;
    const quoted = validCols.map(quoteIdent).join(', ');
    const placeholders = validCols.map((_, i) => `$${i + 1}`).join(', ');
    for (const row of d.rows) {
      const vals = validCols.map((c) => {
        let v = row[c] === undefined ? null : row[c];
        const type = colTypes.get(c);
        if (v !== null && (type === 'json' || type === 'jsonb') && typeof v === 'object') {
          v = JSON.stringify(v);
        }
        return v;
      });
      await client.query(`INSERT INTO ${quoteIdent(t)} (${quoted}) VALUES (${placeholders})`, vals);
      inserted++;
    }
  }
  return inserted;
}

function isValidTenantBackupName(name: string): boolean {
  return /^[A-Za-z0-9._-]+$/.test(name) && name.toLowerCase().endsWith('.tbk');
}

function listTenantBackups(tenantId: string): Array<{ name: string; size: number; modified_at: string; manifest: any | null }> {
  const dir = path.join(BACKUP_DIR, 'tenants', tenantId);
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.tbk'));
  const out: Array<{ name: string; size: number; modified_at: string; manifest: any | null }> = [];
  for (const f of entries) {
    const full = path.join(dir, f);
    try {
      const st = fs.statSync(full);
      let manifest: any = null;
      try {
        const raw = execFileSync('tar', ['-xOf', full, 'manifest.json'], { encoding: 'utf-8', windowsHide: true, timeout: 30000 });
        try { manifest = JSON.parse(raw.trim()); } catch {}
      } catch {}
      out.push({ name: f, size: st.size, modified_at: st.mtime.toISOString(), manifest });
    } catch {}
  }
  return out.sort((a, b) => b.modified_at.localeCompare(a.modified_at));
}

function listBackupFiles(): Array<{ name: string; size: number; modified_at: string; manifest: any | null }> {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  const entries = fs.readdirSync(BACKUP_DIR).filter((f) => f.toLowerCase().endsWith('.sbackup'));
  const out: Array<{ name: string; size: number; modified_at: string; manifest: any | null }> = [];
  for (const f of entries) {
    const full = path.join(BACKUP_DIR, f);
    try {
      const st = fs.statSync(full);
      let manifest: any = null;
      try {
        const raw = execFileSync('tar', ['-xOf', full, 'manifest.json'], { encoding: 'utf-8', windowsHide: true, timeout: 30000 });
        try { manifest = JSON.parse(raw.trim()); } catch {}
      } catch {}
      out.push({ name: f, size: st.size, modified_at: st.mtime.toISOString(), manifest });
    } catch {}
  }
  return out.sort((a, b) => b.modified_at.localeCompare(a.modified_at));
}

async function auditLog(
  tenantId: string | null,
  action: string,
  tableName: string,
  recordId: string | null,
  performedBy: string | null,
  oldData: any,
  newData: any
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO audit_logs (tenant_id, action, table_name, record_id, performed_by, old_data, new_data)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        tenantId,
        action,
        tableName,
        recordId,
        performedBy || null,
        oldData !== undefined && oldData !== null ? JSON.stringify(oldData) : null,
        newData !== undefined && newData !== null ? JSON.stringify(newData) : null,
      ]
    );
  } catch {}
}

function actingUser(req: Request): string | null {
  const id = req.headers['x-superadmin-id'];
  return typeof id === 'string' && id ? id : null;
}

export function applyTenantToProfile(tenant: any, cfg: any): void {
  const profile = readClinicProfile();
  profile.GLOBAL_SAAS_TENANT_ID = tenant.id;
  profile.hospital_name = tenant.hospital_name || profile.hospital_name;
  profile.address = cfg?.address ?? '';
  profile.phone_number = cfg?.phone_number ?? '';
  profile.currency_symbol = cfg?.currency_symbol ?? '₦';
  profile.cloud_sync_enabled = cfg?.cloud_sync_enabled ?? (cfg?.deployment_mode !== 'OFFLINE_STANDALONE');
  profile.primary_brand_color = cfg?.primary_brand_color ?? '#2563eb';
  profile.secondary_brand_color = cfg?.secondary_brand_color ?? '#10b981';
  profile.ui_theme_class = cfg?.ui_theme_class ?? 'theme-trust-blue';
  profile.deployment_mode = cfg?.deployment_mode ?? 'OFFLINE_STANDALONE';
  profile.private_supabase_url = cfg?.private_supabase_url ?? '';
  profile.private_supabase_anon_key = cfg?.private_supabase_anon_key ?? '';
  profile.module_records = cfg?.module_records ?? true;
  profile.module_triage = cfg?.module_triage ?? true;
  profile.module_consultation = cfg?.module_consultation ?? true;
  profile.module_laboratory = cfg?.module_laboratory ?? false;
  profile.module_pharmacy = cfg?.module_pharmacy ?? false;
  profile.module_radiology = cfg?.module_radiology ?? false;
  profile.module_finance_hmo = cfg?.module_finance_hmo ?? false;
  profile.module_maternity = cfg?.module_maternity ?? false;
  profile.module_insurance = cfg?.module_insurance ?? false;
  profile.module_referrals = cfg?.module_referrals ?? false;
  profile.module_appointments = cfg?.module_appointments ?? false;
  profile.module_admissions = cfg?.module_admissions ?? false;
  profile.module_paypoint = cfg?.module_paypoint ?? false;
  profile.module_store = cfg?.module_store ?? false;
  profile.module_doctor = cfg?.module_doctor ?? false;
  profile.module_nurses = cfg?.module_nurses ?? false;
  profile.module_consultants = cfg?.module_consultants ?? false;
  profile.hospital_number_prefix = cfg?.hospital_number_prefix ?? 'SRT';
  profile.hospital_number_include_year = cfg?.hospital_number_include_year ?? true;
  writeProfile(profile);
}

async function insertDefaultDepartments(client: any, tenantId: string): Promise<void> {
  for (const [name, code, desc] of DEFAULT_DEPARTMENTS) {
    const modules = name === 'Gynae & Obstetrics' ? JSON.stringify(['maternity']) : JSON.stringify([]);
    await client.query(
      `INSERT INTO departments (tenant_id, name, code, description, modules)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (tenant_id, name) DO NOTHING`,
      [tenantId, name, code, desc, modules]
    );
  }
}

const memoryUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1024 * 1024 * 1024 },
});

// ---------------------------------------------------------------------------
// Login (public)
// ---------------------------------------------------------------------------

router.post('/api/superadmin/login', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body || {};
    const identifier = (username || '').trim().toLowerCase();
    if (!identifier || !password) {
      res.status(400).json({ error: true, message: 'Username and password required' });
      return;
    }
    const result = await pool.query(
      `SELECT id, username, email, name, password, status FROM super_admin_users
       WHERE LOWER(username) = $1 OR LOWER(email) = $1`,
      [identifier]
    );
    if (result.rows.length === 0) {
      res.status(401).json({ error: true, message: 'Invalid credentials' });
      return;
    }
    const user = result.rows[0];
    if (user.status !== 'active') {
      res.status(403).json({ error: true, message: 'Account is disabled' });
      return;
    }
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      res.status(401).json({ error: true, message: 'Invalid credentials' });
      return;
    }
    await pool.query(`UPDATE super_admin_users SET last_login_at = NOW() WHERE id = $1`, [user.id]);
    res.json({
      token: SUPERADMIN_TOKEN,
      user: {
        id: user.id,
        name: user.name,
        username: user.username,
        email: user.email,
        role: 'SuperAdmin',
        user_type: 'superadmin',
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.use('/api/superadmin', superadminAuth);

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

router.get('/api/superadmin/overview', async (_req: Request, res: Response) => {
  try {
    const stats = await pool.query(
      `SELECT
        (SELECT count(1)::int FROM tenants) AS total_tenants,
        (SELECT count(1)::int FROM staff_users) AS total_staff,
        (SELECT count(1)::int FROM patients) AS total_patients,
        (SELECT count(1)::int FROM encounters) AS total_encounters,
        (SELECT count(1)::int FROM prescriptions) AS total_prescriptions,
        (SELECT count(1)::int FROM lab_orders) AS total_lab_orders,
        (SELECT count(1)::int FROM radiology_orders) AS total_radiology_orders,
        (SELECT count(1)::int FROM super_admin_users) AS total_superadmins`
    );
    const profile = readClinicProfile();
    const backups = listBackupFiles();
    res.json({
      stats: stats.rows[0],
      active_tenant: profile.GLOBAL_SAAS_TENANT_ID
        ? {
            tenant_id: profile.GLOBAL_SAAS_TENANT_ID,
            hospital_name: profile.hospital_name,
            deployment_mode: profile.deployment_mode,
          }
        : null,
      backups: { count: backups.length, last: backups[0] || null },
      server_time: new Date().toISOString(),
    });
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// ---------------------------------------------------------------------------
// Tenants / Hospitals
// ---------------------------------------------------------------------------

router.get('/api/superadmin/tenants', async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT t.id, t.hospital_name, t.subscription_status, t.subscription_tier, t.created_at,
              tc.address, tc.phone_number, tc.logo_url, tc.currency_symbol,
              tc.primary_brand_color, tc.secondary_brand_color, tc.ui_theme_class, tc.deployment_mode,
              tc.cloud_sync_enabled, tc.private_supabase_url, tc.private_supabase_anon_key,
              tc.module_records, tc.module_triage, tc.module_consultation, tc.module_laboratory,
              tc.module_pharmacy, tc.module_radiology, tc.module_finance_hmo,
              tc.module_maternity, tc.module_insurance, tc.module_referrals, tc.module_appointments,
              tc.module_admissions, tc.module_paypoint, tc.module_store,
              tc.module_doctor, tc.module_nurses, tc.module_consultants,
              tc.hospital_number_prefix, tc.hospital_number_include_year,
              tc.number_pattern_hospital, tc.number_pattern_lab, tc.number_pattern_anc,
              tc.number_pattern_radiology, tc.number_pattern_receipt, tc.number_pattern_referral,
              tc.number_pattern_case, tc.number_pattern_auth,
              (SELECT count(1)::int FROM staff_users s WHERE s.tenant_id = t.id) AS staff_count,
              (SELECT count(1)::int FROM patients p WHERE p.tenant_id = t.id) AS patient_count,
              (SELECT count(1)::int FROM encounters e WHERE e.tenant_id = t.id) AS encounter_count
       FROM tenants t
       LEFT JOIN tenant_configurations tc ON tc.tenant_id = t.id
       ORDER BY t.created_at DESC`
    );
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.post('/api/superadmin/tenants', async (req: Request, res: Response) => {
  const body = req.body || {};
  try {
    const hospitalName = (body.hospital_name || '').trim();
    if (!hospitalName) {
      res.status(400).json({ error: true, message: 'hospital_name is required' });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const tenantRes = await client.query(
        `INSERT INTO tenants (hospital_name, subscription_status, subscription_tier)
         VALUES ($1, $2, $3) RETURNING id, hospital_name, subscription_status, subscription_tier`,
        [hospitalName, body.subscription_status || 'active', body.subscription_tier || 'standard']
      );
      const tenant = tenantRes.rows[0];

      await client.query(
        `INSERT INTO tenant_configurations (
           tenant_id, hospital_name, address, phone_number, currency_symbol,
           primary_brand_color, secondary_brand_color, ui_theme_class, deployment_mode,
           cloud_sync_enabled, private_supabase_url, private_supabase_anon_key,
           module_records, module_triage, module_consultation, module_laboratory,
           module_pharmacy, module_radiology, module_finance_hmo,
           module_maternity, module_insurance, module_referrals, module_appointments,
           module_admissions, module_paypoint, module_store,
           module_doctor, module_nurses, module_consultants,
           hospital_number_prefix, hospital_number_include_year,
           number_pattern_hospital, number_pattern_lab, number_pattern_anc,
           number_pattern_radiology, number_pattern_receipt, number_pattern_referral,
           number_pattern_case, number_pattern_auth,
           subscription_tier, subscription_status
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,$40,$41)`,
        [
          tenant.id, hospitalName, body.address || '', body.phone_number || null, body.currency_symbol || '₦',
          body.primary_brand_color || '#2563eb', body.secondary_brand_color || '#10b981',
          body.ui_theme_class || 'theme-trust-blue', body.deployment_mode || 'OFFLINE_STANDALONE',
          body.cloud_sync_enabled ?? (body.deployment_mode !== 'OFFLINE_STANDALONE'),
          body.private_supabase_url || null, body.private_supabase_anon_key || null,
          body.module_records ?? true, body.module_triage ?? true, body.module_consultation ?? true,
          body.module_laboratory ?? false, body.module_pharmacy ?? false,
          body.module_radiology ?? false, body.module_finance_hmo ?? false,
          body.module_maternity ?? false, body.module_insurance ?? false,
          body.module_referrals ?? false, body.module_appointments ?? false,
          body.module_admissions ?? false, body.module_paypoint ?? false,
          body.module_store ?? false,
          body.module_doctor ?? false, body.module_nurses ?? false, body.module_consultants ?? false,
          body.hospital_number_prefix || 'SRT', body.hospital_number_include_year ?? true,
          body.number_pattern_hospital || null, body.number_pattern_lab || null, body.number_pattern_anc || null,
          body.number_pattern_radiology || null, body.number_pattern_receipt || null, body.number_pattern_referral || null,
          body.number_pattern_case || null, body.number_pattern_auth || null,
          body.subscription_tier || 'standard', body.subscription_status || 'active',
        ]
      );

      await insertDefaultDepartments(client, tenant.id);

      const admin = body.create_admin;
      if (admin && admin.name && admin.email && admin.password) {
        const uname = (admin.username || '').trim().toLowerCase() || admin.email.trim().split('@')[0].toLowerCase();
        if (!/^[a-z0-9._-]+$/.test(uname)) {
          throw new Error('Admin username may only contain letters, numbers, dots, dashes and underscores');
        }
        const dup = await client.query(`SELECT id FROM staff_users WHERE LOWER(username) = LOWER($1) AND tenant_id = $2`, [uname, tenant.id]);
        if (dup.rows.length > 0) throw new Error('This admin username is already taken for this hospital');
        const hash = await bcrypt.hash(admin.password, 10);
        await client.query(
          `INSERT INTO staff_users (id, tenant_id, email, username, name, role, phone, password, status)
           VALUES ($1, $2, $3, $4, $5, 'Admin', $6, $7, 'active')`,
          [uuidv4(), tenant.id, admin.email.trim(), uname, admin.name.trim(), admin.phone || null, hash]
        );
      }

      await client.query('COMMIT');

      if (body.set_active) {
        const cfgRes = await pool.query(`SELECT * FROM tenant_configurations WHERE tenant_id = $1`, [tenant.id]);
        applyTenantToProfile(tenant, cfgRes.rows[0] || {});
      }

      await auditLog(tenant.id, 'CREATE', 'tenants', tenant.id, actingUser(req), null, { hospital_name: hospitalName });
      res.status(201).json({ success: true, tenant });
    } catch (err: any) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.put('/api/superadmin/tenants/:id', async (req: Request, res: Response) => {
  try {
    const id = param(req.params.id);
    const body = req.body || {};

    const existing = await pool.query(`SELECT * FROM tenants WHERE id = $1`, [id]);
    if (existing.rows.length === 0) {
      res.status(404).json({ error: true, message: 'Tenant not found' });
      return;
    }
    const oldTenant = existing.rows[0];

    await pool.query(
      `UPDATE tenants SET
         hospital_name = COALESCE($1, hospital_name),
         subscription_status = COALESCE($2, subscription_status),
         subscription_tier = COALESCE($3, subscription_tier)
       WHERE id = $4`,
      [body.hospital_name || null, body.subscription_status || null, body.subscription_tier || null, id]
    );

    const hospitalName = body.hospital_name || oldTenant.hospital_name;
    // Deployment mode change auto-derives cloud sync unless the caller explicitly set it
    const derivedCloudSync = body.cloud_sync_enabled !== undefined
      ? body.cloud_sync_enabled
      : (body.deployment_mode !== undefined ? body.deployment_mode !== 'OFFLINE_STANDALONE' : null);
    const cfgRes = await pool.query(`SELECT id FROM tenant_configurations WHERE tenant_id = $1`, [id]);
    if (cfgRes.rows.length > 0) {
      await pool.query(
        `UPDATE tenant_configurations SET
           hospital_name = $1,
           address = COALESCE($2, address),
           phone_number = COALESCE($3, phone_number),
           currency_symbol = COALESCE($4, currency_symbol),
           primary_brand_color = COALESCE($5, primary_brand_color),
           secondary_brand_color = COALESCE($6, secondary_brand_color),
           ui_theme_class = COALESCE($7, ui_theme_class),
           deployment_mode = COALESCE($8, deployment_mode),
           cloud_sync_enabled = COALESCE($9, cloud_sync_enabled),
           private_supabase_url = COALESCE($10, private_supabase_url),
           private_supabase_anon_key = COALESCE($11, private_supabase_anon_key),
           module_records = COALESCE($12, module_records),
           module_triage = COALESCE($13, module_triage),
           module_consultation = COALESCE($14, module_consultation),
           module_laboratory = COALESCE($15, module_laboratory),
           module_pharmacy = COALESCE($16, module_pharmacy),
           module_radiology = COALESCE($17, module_radiology),
           module_finance_hmo = COALESCE($18, module_finance_hmo),
           module_maternity = COALESCE($19, module_maternity),
           module_insurance = COALESCE($20, module_insurance),
           module_referrals = COALESCE($21, module_referrals),
           module_appointments = COALESCE($22, module_appointments),
           module_admissions = COALESCE($23, module_admissions),
           module_paypoint = COALESCE($24, module_paypoint),
           module_store = COALESCE($25, module_store),
           module_doctor = COALESCE($26, module_doctor),
           module_nurses = COALESCE($27, module_nurses),
           module_consultants = COALESCE($28, module_consultants),
           hospital_number_prefix = COALESCE($29, hospital_number_prefix),
           hospital_number_include_year = COALESCE($30, hospital_number_include_year),
           number_pattern_hospital = COALESCE($31, number_pattern_hospital),
           number_pattern_lab = COALESCE($32, number_pattern_lab),
           number_pattern_anc = COALESCE($33, number_pattern_anc),
           number_pattern_radiology = COALESCE($34, number_pattern_radiology),
           number_pattern_receipt = COALESCE($35, number_pattern_receipt),
           number_pattern_referral = COALESCE($36, number_pattern_referral),
           number_pattern_case = COALESCE($37, number_pattern_case),
           number_pattern_auth = COALESCE($38, number_pattern_auth),
           subscription_tier = COALESCE($39, subscription_tier),
           subscription_status = COALESCE($40, subscription_status)
         WHERE tenant_id = $41`,
        [
          hospitalName,
          body.address ?? null, body.phone_number ?? null, body.currency_symbol ?? null,
          body.primary_brand_color ?? null, body.secondary_brand_color ?? null,
          body.ui_theme_class ?? null, body.deployment_mode ?? null,
          derivedCloudSync, body.private_supabase_url ?? null,
          body.private_supabase_anon_key ?? null,
          body.module_records ?? null, body.module_triage ?? null, body.module_consultation ?? null,
          body.module_laboratory ?? null, body.module_pharmacy ?? null,
          body.module_radiology ?? null, body.module_finance_hmo ?? null,
          body.module_maternity ?? null, body.module_insurance ?? null,
          body.module_referrals ?? null, body.module_appointments ?? null,
          body.module_admissions ?? null, body.module_paypoint ?? null,
          body.module_store ?? null,
          body.module_doctor ?? null, body.module_nurses ?? null, body.module_consultants ?? null,
          body.hospital_number_prefix ?? null, body.hospital_number_include_year ?? null,
          body.number_pattern_hospital ?? null, body.number_pattern_lab ?? null, body.number_pattern_anc ?? null,
          body.number_pattern_radiology ?? null, body.number_pattern_receipt ?? null, body.number_pattern_referral ?? null,
          body.number_pattern_case ?? null, body.number_pattern_auth ?? null,
          body.subscription_tier ?? null, body.subscription_status ?? null,
          id,
        ]
      );
    } else {
      await pool.query(
        `INSERT INTO tenant_configurations (
           tenant_id, hospital_name, address, phone_number, currency_symbol,
           primary_brand_color, secondary_brand_color, ui_theme_class, deployment_mode,
           cloud_sync_enabled, module_records, module_triage, module_consultation,
           module_laboratory, module_pharmacy, module_radiology, module_finance_hmo,
           module_maternity, module_insurance, module_referrals, module_appointments,
           module_admissions, module_paypoint, module_store,
           module_doctor, module_nurses, module_consultants,
           hospital_number_prefix, hospital_number_include_year,
           number_pattern_hospital, number_pattern_lab, number_pattern_anc,
           number_pattern_radiology, number_pattern_receipt, number_pattern_referral,
           number_pattern_case, number_pattern_auth,
           subscription_tier, subscription_status
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39)`,
        [
          id, hospitalName, body.address || '', body.phone_number || null, body.currency_symbol || '₦',
          body.primary_brand_color || '#2563eb', body.secondary_brand_color || '#10b981',
          body.ui_theme_class || 'theme-trust-blue', body.deployment_mode || 'OFFLINE_STANDALONE',
          body.cloud_sync_enabled ?? true, body.module_records ?? true, body.module_triage ?? true,
          body.module_consultation ?? true, body.module_laboratory ?? false, body.module_pharmacy ?? false,
          body.module_radiology ?? false, body.module_finance_hmo ?? false,
          body.module_maternity ?? false, body.module_insurance ?? false,
          body.module_referrals ?? false, body.module_appointments ?? false,
          body.module_admissions ?? false, body.module_paypoint ?? false,
          body.module_store ?? false,
          body.module_doctor ?? false, body.module_nurses ?? false, body.module_consultants ?? false,
          body.hospital_number_prefix || 'SRT', body.hospital_number_include_year ?? true,
          body.number_pattern_hospital || null, body.number_pattern_lab || null, body.number_pattern_anc || null,
          body.number_pattern_radiology || null, body.number_pattern_receipt || null, body.number_pattern_referral || null,
          body.number_pattern_case || null, body.number_pattern_auth || null,
          body.subscription_tier || 'standard', body.subscription_status || 'active',
        ]
      );
    }

    const activeProfile = readClinicProfile();
    if (activeProfile.GLOBAL_SAAS_TENANT_ID === id) {
      const ten = await pool.query(`SELECT * FROM tenants WHERE id = $1`, [id]);
      const cfg = await pool.query(`SELECT * FROM tenant_configurations WHERE tenant_id = $1`, [id]);
      if (ten.rows[0]) applyTenantToProfile(ten.rows[0], cfg.rows[0] || {});
      // The report stores the active hospital's deployment mode — refresh it now
      // so the Fleet Monitor tag updates immediately after a settings change.
      await persistUpdateReport(true).catch(() => {});
    }

    await auditLog(id, 'UPDATE', 'tenants', id, actingUser(req), { hospital_name: oldTenant.hospital_name }, body);
    res.json({ success: true, message: 'Tenant updated' });
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.post('/api/superadmin/tenants/:id/activate', async (req: Request, res: Response) => {
  try {
    const id = param(req.params.id);
    const tenantRes = await pool.query(`SELECT * FROM tenants WHERE id = $1`, [id]);
    if (tenantRes.rows.length === 0) {
      res.status(404).json({ error: true, message: 'Tenant not found' });
      return;
    }
    let cfgRes = await pool.query(`SELECT * FROM tenant_configurations WHERE tenant_id = $1`, [id]);
    if (cfgRes.rows.length === 0) {
      await pool.query(
        `INSERT INTO tenant_configurations (tenant_id, hospital_name, address)
         SELECT $1, $2, ''
         WHERE NOT EXISTS (SELECT 1 FROM tenant_configurations WHERE tenant_id = $1)`,
        [id, tenantRes.rows[0].hospital_name]
      );
      cfgRes = await pool.query(`SELECT * FROM tenant_configurations WHERE tenant_id = $1`, [id]);
    }
    const cfg = cfgRes.rows[0];
    applyTenantToProfile(tenantRes.rows[0], cfg);
    // Refresh the machine update report immediately so the Fleet Monitor tag
    // shows this hospital's new deployment mode right away.
    await persistUpdateReport(true).catch(() => {});
    await auditLog(id, 'ACTIVATE', 'tenants', id, actingUser(req), null, { hospital_name: tenantRes.rows[0].hospital_name });
    res.json({ success: true, message: `Activated ${tenantRes.rows[0].hospital_name}`, profile: readClinicProfile() });
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.delete('/api/superadmin/tenants/:id', async (req: Request, res: Response) => {
  try {
    const id = param(req.params.id);
    const suppliedCode = String((req.body && req.body.master_code) || (req.query.master_code as string) || '').trim();
    const codeRes = await pool.query(
      `SELECT setting_value FROM superadmin_settings WHERE setting_key = 'master_code'`
    );
    const expectedCode = codeRes.rows[0]?.setting_value || '5788';
    if (!suppliedCode || suppliedCode !== expectedCode) {
      res.status(403).json({ error: true, message: 'Invalid master code. Hospital was not deleted.' });
      return;
    }
    const existing = await pool.query(`SELECT * FROM tenants WHERE id = $1`, [id]);
    if (existing.rows.length === 0) {
      res.status(404).json({ error: true, message: 'Tenant not found' });
      return;
    }
    await pool.query('DELETE FROM tenant_configurations WHERE tenant_id = $1', [id]);
    await pool.query('DELETE FROM tenants WHERE id = $1', [id]);
    await auditLog(id, 'DELETE', 'tenants', id, actingUser(req), { hospital_name: existing.rows[0].hospital_name }, null);

    const profile = readClinicProfile();
    if (profile.GLOBAL_SAAS_TENANT_ID === id) {
      profile.GLOBAL_SAAS_TENANT_ID = '';
      profile.hospital_name = '';
      writeProfile(profile);
    }
    res.json({ success: true, message: 'Tenant deleted' });
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// ---------------------------------------------------------------------------
// Global settings (superadmin key/value, e.g. master delete code)
// ---------------------------------------------------------------------------

router.get('/api/superadmin/settings', async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT setting_key, setting_value FROM superadmin_settings ORDER BY setting_key`
    );
    res.json(Object.fromEntries(result.rows.map((r: any) => [r.setting_key, r.setting_value])));
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.put('/api/superadmin/settings', async (req: Request, res: Response) => {
  try {
    const body = req.body || {};
    const entries = Object.entries(body).filter(([, v]) => v !== undefined && v !== null);
    if (entries.length === 0) {
      res.status(400).json({ error: true, message: 'No settings provided' });
      return;
    }
    for (const [key, value] of entries) {
      await pool.query(
        `INSERT INTO superadmin_settings (setting_key, setting_value, updated_by, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (setting_key) DO UPDATE
           SET setting_value = EXCLUDED.setting_value,
               updated_by = EXCLUDED.updated_by,
               updated_at = NOW()`,
        [key, String(value), actingUser(req)]
      );
    }
    await auditLog(null, 'UPDATE', 'superadmin_settings', null, actingUser(req), null, body);
    res.json({ success: true, message: 'Settings updated' });
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// ---------------------------------------------------------------------------
// Departments (cross-tenant, for staff assignment)
// ---------------------------------------------------------------------------

router.get('/api/superadmin/departments', async (req: Request, res: Response) => {
  try {
    const tenantId = param(req.query.tenant_id);
    if (!tenantId) {
      res.status(400).json({ error: true, message: 'tenant_id is required' });
      return;
    }
    const result = await pool.query(
      `SELECT id, name, code FROM departments WHERE tenant_id = $1 ORDER BY name`,
      [tenantId]
    );
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// ---------------------------------------------------------------------------
// Staff (cross-hospital, including Admins)
// ---------------------------------------------------------------------------

router.get('/api/superadmin/staff', async (req: Request, res: Response) => {
  try {
    const tenantId = (req.query.tenant_id as string) || null;
    const result = await pool.query(
      `SELECT su.id, su.email, su.username, su.name, su.role, su.phone, su.status,
              su.department_id, su.tenant_id, su.created_at,
              d.name AS department_name, t.hospital_name
       FROM staff_users su
       LEFT JOIN departments d ON d.id = su.department_id
       LEFT JOIN tenants t ON t.id = su.tenant_id
       WHERE ($1::uuid IS NULL OR su.tenant_id = $1)
       ORDER BY t.hospital_name, su.name`,
      [tenantId]
    );
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.post('/api/superadmin/staff', async (req: Request, res: Response) => {
  try {
    const { tenant_id, name, email, role, phone, password, username, department_id } = req.body || {};
    if (!tenant_id || !name || !email || !role || !password) {
      res.status(400).json({ error: true, message: 'Required: tenant_id, name, email, role, password' });
      return;
    }
    if (!VALID_ROLES.includes(role)) {
      res.status(400).json({ error: true, message: `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}` });
      return;
    }
    const tenantCheck = await pool.query(`SELECT id FROM tenants WHERE id = $1`, [tenant_id]);
    if (tenantCheck.rows.length === 0) {
      res.status(404).json({ error: true, message: 'Tenant not found' });
      return;
    }
    const uname = (username || '').trim().toLowerCase() || email.trim().split('@')[0].toLowerCase() || null;
    if (!uname) {
      res.status(400).json({ error: true, message: 'Username is required (or an email to derive it from)' });
      return;
    }
    if (!/^[a-z0-9._-]+$/.test(uname)) {
      res.status(400).json({ error: true, message: 'Username may only contain letters, numbers, dots, dashes and underscores' });
      return;
    }
    const existing = await pool.query(`SELECT id FROM staff_users WHERE email = $1 AND tenant_id = $2`, [email, tenant_id]);
    if (existing.rows.length > 0) {
      res.status(409).json({ error: true, message: 'A user with this email already exists for this hospital' });
      return;
    }
    const dup = await pool.query(`SELECT id FROM staff_users WHERE LOWER(username) = LOWER($1) AND tenant_id = $2`, [uname, tenant_id]);
    if (dup.rows.length > 0) {
      res.status(409).json({ error: true, message: 'This username is already taken for this hospital' });
      return;
    }
    const hash = await bcrypt.hash(password, 10);
    const id = uuidv4();
    const result = await pool.query(
      `INSERT INTO staff_users (id, tenant_id, email, username, name, role, phone, password, status, department_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active', $9)
       RETURNING id, email, username, name, role, phone, status, department_id, tenant_id`,
      [id, tenant_id, email, uname, name, role, phone || null, hash, department_id || null]
    );
    await auditLog(tenant_id, 'CREATE', 'staff_users', id, actingUser(req), null, { name, role, email });
    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.put('/api/superadmin/staff/:id', async (req: Request, res: Response) => {
  try {
    const id = param(req.params.id);
    const { tenant_id, name, email, role, phone, password, status, username, department_id } = req.body || {};
    if (role && !VALID_ROLES.includes(role)) {
      res.status(400).json({ error: true, message: `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}` });
      return;
    }
    const uname = username !== undefined && username !== null && username !== ''
      ? String(username).trim().toLowerCase()
      : null;
    if (uname !== null && !/^[a-z0-9._-]+$/.test(uname)) {
      res.status(400).json({ error: true, message: 'Username may only contain letters, numbers, dots, dashes and underscores' });
      return;
    }
    let query = `UPDATE staff_users SET
        name = COALESCE($1, name),
        email = COALESCE($2, email),
        username = COALESCE($3, username),
        role = COALESCE($4, role),
        phone = COALESCE($5, phone),
        status = COALESCE($6, status)`;
    const params: any[] = [name || null, email || null, uname, role || null, phone || null, status || null];
    let paramIdx = 7;
    if (department_id !== undefined) {
      query += `, department_id = $${paramIdx}`;
      params.push(department_id || null);
      paramIdx++;
    }
    if (password) {
      const hash = await bcrypt.hash(password, 10);
      query += `, password = $${paramIdx}`;
      params.push(hash);
      paramIdx++;
    }
    if (tenant_id) {
      query += ` WHERE id = $${paramIdx} AND tenant_id = $${paramIdx + 1}`;
      params.push(id, tenant_id);
    } else {
      query += ` WHERE id = $${paramIdx}`;
      params.push(id);
    }
    query += ` RETURNING id, email, username, name, role, phone, status, department_id, tenant_id`;
    const result = await pool.query(query, params);
    if (result.rows.length === 0) {
      res.status(404).json({ error: true, message: 'Staff not found' });
      return;
    }
    await auditLog(tenant_id || result.rows[0].tenant_id, 'UPDATE', 'staff_users', id, actingUser(req), null, { name, role, status });
    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.delete('/api/superadmin/staff/:id', async (req: Request, res: Response) => {
  try {
    const id = param(req.params.id);
    const tenantId = (req.query.tenant_id as string) || null;
    const existing = await pool.query(
      `SELECT * FROM staff_users WHERE id = $1 ${tenantId ? 'AND tenant_id = $2' : ''}`,
      tenantId ? [id, tenantId] : [id]
    );
    if (existing.rows.length === 0) {
      res.status(404).json({ error: true, message: 'Staff not found' });
      return;
    }
    await pool.query(`DELETE FROM staff_users WHERE id = $1`, [id]);
    await auditLog(tenantId || existing.rows[0].tenant_id, 'DELETE', 'staff_users', id, actingUser(req), { name: existing.rows[0].name, role: existing.rows[0].role }, null);
    res.json({ success: true, message: 'Staff deleted' });
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// ---------------------------------------------------------------------------
// Audit logs
// ---------------------------------------------------------------------------

router.get('/api/superadmin/audit-logs', async (req: Request, res: Response) => {
  try {
    const action = (req.query.action as string) || null;
    const tableName = (req.query.table_name as string) || null;
    const tenantId = (req.query.tenant_id as string) || null;
    const from = (req.query.from as string) || null;
    const to = (req.query.to as string) || null;
    const limit = Math.min(parseInt((req.query.limit as string) || '100', 10) || 100, 500);
    const offset = parseInt((req.query.offset as string) || '0', 10) || 0;
    const result = await pool.query(
      `SELECT al.id, al.action, al.table_name, al.record_id, al.performed_by, al.old_data, al.new_data,
              al.created_at, t.hospital_name
       FROM audit_logs al
       LEFT JOIN tenants t ON t.id = al.tenant_id
       WHERE ($1::text IS NULL OR al.action ILIKE '%' || $1 || '%')
         AND ($2::text IS NULL OR al.table_name = $2)
         AND ($3::uuid IS NULL OR al.tenant_id = $3)
         AND ($4::timestamptz IS NULL OR al.created_at >= $4)
         AND ($5::timestamptz IS NULL OR al.created_at <= $5)
       ORDER BY al.created_at DESC
       LIMIT $6 OFFSET $7`,
      [action, tableName, tenantId, from, to, limit, offset]
    );
    const total = await pool.query(
      `SELECT count(1)::int AS total FROM audit_logs al
       WHERE ($1::text IS NULL OR al.action ILIKE '%' || $1 || '%')
         AND ($2::text IS NULL OR al.table_name = $2)
         AND ($3::uuid IS NULL OR al.tenant_id = $3)
         AND ($4::timestamptz IS NULL OR al.created_at >= $4)
         AND ($5::timestamptz IS NULL OR al.created_at <= $5)`,
      [action, tableName, tenantId, from, to]
    );
    res.json({ rows: result.rows, total: total.rows[0].total });
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

router.get('/api/superadmin/health', async (_req: Request, res: Response) => {
  try {
    const started = Date.now();
    await pool.query('SELECT 1');
    const latencyMs = Date.now() - started;

    const tables = await pool.query(
      `SELECT c.relname AS table_name,
              c.reltuples::bigint AS row_estimate,
              pg_size_pretty(pg_total_relation_size(c.oid)) AS size
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind = 'r'
       ORDER BY c.relname`
    );

    let migrations: string[] = [];
    try {
      migrations = fs.readdirSync(MIGRATIONS_DIR)
        .filter((f) => f.endsWith('.sql') && /^\d{3}_/.test(f))
        .sort();
    } catch {}

    const backups = listBackupFiles();
    const totalBackupSize = backups.reduce((acc, b) => acc + b.size, 0);

    const tenantsByTier = await pool.query(
      `SELECT subscription_tier, count(1)::int AS count FROM tenants GROUP BY subscription_tier ORDER BY subscription_tier`
    );

    res.json({
      db: { connected: true, latency_ms: latencyMs },
      tables: tables.rows,
      migrations: { available: migrations.length, files: migrations },
      backups: { count: backups.length, total_size: totalBackupSize, last: backups[0] || null },
      tenants_by_tier: tenantsByTier.rows,
      system: {
        node_version: process.version,
        platform: process.platform,
        arch: process.arch,
        uptime_seconds: Math.round(process.uptime()),
        memory_mb: Math.round(process.memoryUsage().rss / 1024 / 1024),
        server_time: new Date().toISOString(),
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message, db: { connected: false } });
  }
});

// ---------------------------------------------------------------------------
// Backup & Restore
// ---------------------------------------------------------------------------

router.post('/api/superadmin/backup', async (_req: Request, res: Response) => {
  try {
    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const baseName = `backup_${ts}`;
    const safeName = `${baseName}.sbackup`;
    const tmpDir = path.join(BACKUP_DIR, `.tmp_${baseName}`);
    fs.mkdirSync(tmpDir, { recursive: true });
    const dumpPath = path.join(tmpDir, 'database.dump');

    const db = dbEnv();
    await runCmd(resolvePgTool('pg_dump'), [
      '--format=custom', '--no-owner', '--no-privileges',
      '--file=' + dumpPath,
      '-h', db.host, '-p', db.port, '-U', db.user, db.database,
    ]);

    if (fs.existsSync(CONFIG_FILE)) fs.copyFileSync(CONFIG_FILE, path.join(tmpDir, 'clinic_profile.json'));
    copyDirIfExists(ASSETS_DIR, path.join(tmpDir, 'assets'));
    copyDirIfExists(UPLOADS_DIR, path.join(tmpDir, 'uploads'));

    const tablesRes = await pool.query(`SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`);
    const tables = tablesRes.rows.map((r) => r.tablename);

    let migrationFiles: string[] = [];
    try {
      migrationFiles = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql') && /^\d{3}_/.test(f)).sort();
    } catch {}

    const manifest = {
      format: 'sretan-emr-backup',
      version: '1.0',
      created_at: new Date().toISOString(),
      database: db.database,
      tables,
      migration_files: migrationFiles,
      config_file: 'clinic_profile.json',
      files: ['database.dump', 'clinic_profile.json', 'assets/', 'uploads/'],
      app: 'MACHOKO HMS / Sretan EMR',
    };
    fs.writeFileSync(path.join(tmpDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

    const finalPath = path.join(BACKUP_DIR, safeName);
    await runCmd('tar', ['-cf', finalPath, '--format', 'zip', '-C', tmpDir, '.']);
    fs.rmSync(tmpDir, { recursive: true, force: true });

    const size = fs.statSync(finalPath).size;
    await auditLog(null, 'CREATE', 'backups', null, actingUser(_req), null, { name: safeName, size, tables: tables.length });
    res.status(201).json({ success: true, message: 'Backup created', name: safeName, size, tables: tables.length, created_at: manifest.created_at });
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.get('/api/superadmin/backups', async (_req: Request, res: Response) => {
  try {
    res.json(listBackupFiles());
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.get('/api/superadmin/backups/:name/download', async (req: Request, res: Response) => {
  try {
    const name = param(req.params.name);
    if (!isValidBackupName(name)) {
      res.status(400).json({ error: true, message: 'Invalid backup name' });
      return;
    }
    const full = path.join(BACKUP_DIR, name);
    if (!fs.existsSync(full)) {
      res.status(404).json({ error: true, message: 'Backup not found' });
      return;
    }
    res.download(full, name);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.delete('/api/superadmin/backups/:name', async (req: Request, res: Response) => {
  try {
    const name = param(req.params.name);
    if (!isValidBackupName(name)) {
      res.status(400).json({ error: true, message: 'Invalid backup name' });
      return;
    }
    const full = path.join(BACKUP_DIR, name);
    if (!fs.existsSync(full)) {
      res.status(404).json({ error: true, message: 'Backup not found' });
      return;
    }
    fs.unlinkSync(full);
    await auditLog(null, 'DELETE', 'backups', null, actingUser(req), { name }, null);
    res.json({ success: true, message: 'Backup deleted' });
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.post('/api/superadmin/restore', memoryUpload.single('file'), async (req: Request, res: Response) => {
  let workDir = '';
  try {
    const name = (req.body && req.body.name as string) || '';
    workDir = path.join(BACKUP_DIR, `.restore_${Date.now()}`);
    fs.mkdirSync(workDir, { recursive: true });

    if (req.file) {
      const upPath = path.join(workDir, 'upload.sbackup');
      fs.writeFileSync(upPath, req.file.buffer);
      await runCmd('tar', ['-xf', upPath, '-C', workDir]);
    } else if (name) {
      if (!isValidBackupName(name)) {
        res.status(400).json({ error: true, message: 'Invalid backup name' });
        return;
      }
      const sourceZip = path.join(BACKUP_DIR, name);
      if (!fs.existsSync(sourceZip)) {
        res.status(404).json({ error: true, message: 'Backup not found' });
        return;
      }
      await runCmd('tar', ['-xf', sourceZip, '-C', workDir]);
    } else {
      res.status(400).json({ error: true, message: 'Provide a backup name or upload a .sbackup file' });
      return;
    }

    const manifestPath = path.join(workDir, 'manifest.json');
    const dumpPath = path.join(workDir, 'database.dump');
    if (!fs.existsSync(manifestPath) || !fs.existsSync(dumpPath)) {
      res.status(400).json({ error: true, message: 'Invalid backup bundle: manifest or database dump missing' });
      return;
    }
    let manifest: any = null;
    try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')); } catch {}

    const db = dbEnv();
    await runCmd(resolvePgTool('pg_restore'), [
      '--clean', '--if-exists', '--no-owner', '--no-privileges',
      '-h', db.host, '-p', db.port, '-U', db.user, '-d', db.database, dumpPath,
    ]);

    const cfgPath = path.join(workDir, 'clinic_profile.json');
    if (fs.existsSync(cfgPath)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
      fs.copyFileSync(cfgPath, CONFIG_FILE);
    }
    copyDirIfExists(path.join(workDir, 'assets'), ASSETS_DIR);
    copyDirIfExists(path.join(workDir, 'uploads'), UPLOADS_DIR);

    await ensureSchema();
    await auditLog(null, 'RESTORE', 'backups', null, actingUser(req), null, { name: name || 'uploaded' });

    res.json({ success: true, message: 'Restore completed', manifest });
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  } finally {
    if (workDir) {
      try { fs.rmSync(workDir, { recursive: true, force: true }); } catch {}
    }
  }
});

// ---------------------------------------------------------------------------
// Per-tenant (hospital-level) Backup & Restore
// Only the selected hospital's rows are exported / replaced; all other
// hospitals are left untouched. Adapts automatically to future tables.
// ---------------------------------------------------------------------------

router.post('/api/superadmin/tenants/:id/backup', async (req: Request, res: Response) => {
  const id = param(req.params.id);
  try {
    const tenantRes = await pool.query(`SELECT id, hospital_name FROM tenants WHERE id = $1`, [id]);
    if (tenantRes.rows.length === 0) {
      res.status(404).json({ error: true, message: 'Tenant not found' });
      return;
    }
    const client = await pool.connect();
    let tablesData: Array<{ table: string; rows: any[] }>;
    try {
      await client.query('BEGIN');
      tablesData = await exportTenantData(client, id);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const safeName = `tenantbackup_${ts}.tbk`;
    const dir = path.join(BACKUP_DIR, 'tenants', id);
    fs.mkdirSync(dir, { recursive: true });
    const tmpDir = path.join(dir, `.tmp_${ts}`);
    fs.mkdirSync(tmpDir, { recursive: true });

    const manifest = {
      format: 'sretan-tenant-backup',
      version: '1.0',
      tenant_id: id,
      hospital_name: tenantRes.rows[0].hospital_name,
      created_at: new Date().toISOString(),
      tables: tablesData.map((d) => ({ table: d.table, rows: d.rows.length })),
    };
    fs.writeFileSync(path.join(tmpDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
    fs.writeFileSync(path.join(tmpDir, 'data.json'), JSON.stringify(tablesData));

    const finalPath = path.join(dir, safeName);
    await runCmd('tar', ['-cf', finalPath, '--format', 'zip', '-C', tmpDir, '.']);
    fs.rmSync(tmpDir, { recursive: true, force: true });

    const size = fs.statSync(finalPath).size;
    const totalRows = tablesData.reduce((a, d) => a + d.rows.length, 0);
    await auditLog(id, 'CREATE', 'tenant_backups', id, actingUser(req), null, { name: safeName, size, rows: totalRows });
    res.status(201).json({ success: true, message: 'Hospital backup created', name: safeName, size, tables: manifest.tables.length, rows: totalRows });
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.get('/api/superadmin/tenants/:id/backups', async (req: Request, res: Response) => {
  try {
    res.json(listTenantBackups(param(req.params.id)));
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.get('/api/superadmin/tenants/:id/backups/:name/download', async (req: Request, res: Response) => {
  try {
    const id = param(req.params.id);
    const name = param(req.params.name);
    if (!isValidTenantBackupName(name)) {
      res.status(400).json({ error: true, message: 'Invalid backup name' });
      return;
    }
    const full = path.join(BACKUP_DIR, 'tenants', id, name);
    if (!fs.existsSync(full)) {
      res.status(404).json({ error: true, message: 'Backup not found' });
      return;
    }
    res.download(full, name);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.delete('/api/superadmin/tenants/:id/backups/:name', async (req: Request, res: Response) => {
  try {
    const id = param(req.params.id);
    const name = param(req.params.name);
    if (!isValidTenantBackupName(name)) {
      res.status(400).json({ error: true, message: 'Invalid backup name' });
      return;
    }
    const full = path.join(BACKUP_DIR, 'tenants', id, name);
    if (!fs.existsSync(full)) {
      res.status(404).json({ error: true, message: 'Backup not found' });
      return;
    }
    fs.unlinkSync(full);
    await auditLog(id, 'DELETE', 'tenant_backups', id, actingUser(req), { name }, null);
    res.json({ success: true, message: 'Backup deleted' });
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.post('/api/superadmin/tenants/:id/restore', memoryUpload.single('file'), async (req: Request, res: Response) => {
  const id = param(req.params.id);
  let workDir = '';
  try {
    const dir = path.join(BACKUP_DIR, 'tenants', id);
    const name = (req.body && req.body.name as string) || '';
    workDir = path.join(dir, `.restore_${Date.now()}`);
    fs.mkdirSync(workDir, { recursive: true });

    if (req.file) {
      const upPath = path.join(workDir, 'upload.tbk');
      fs.writeFileSync(upPath, req.file.buffer);
      await runCmd('tar', ['-xf', upPath, '-C', workDir]);
    } else if (name) {
      if (!isValidTenantBackupName(name)) {
        res.status(400).json({ error: true, message: 'Invalid backup name' });
        return;
      }
      const sourceZip = path.join(dir, name);
      if (!fs.existsSync(sourceZip)) {
        res.status(404).json({ error: true, message: 'Backup not found' });
        return;
      }
      await runCmd('tar', ['-xf', sourceZip, '-C', workDir]);
    } else {
      res.status(400).json({ error: true, message: 'Provide a backup name or upload a .tbk file' });
      return;
    }

    const manifestPath = path.join(workDir, 'manifest.json');
    const dataPath = path.join(workDir, 'data.json');
    if (!fs.existsSync(manifestPath) || !fs.existsSync(dataPath)) {
      res.status(400).json({ error: true, message: 'Invalid hospital backup bundle' });
      return;
    }
    let manifest: any = null;
    try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')); } catch {}
    if (manifest && manifest.tenant_id && manifest.tenant_id !== id) {
      res.status(400).json({ error: true, message: 'This backup belongs to a different hospital and cannot be restored here' });
      return;
    }
    const tablesData = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));

    const client = await pool.connect();
    let inserted = 0;
    try {
      await client.query('BEGIN');
      let roleDisabled = false;
      try {
        await client.query('SET LOCAL session_replication_role = replica');
        roleDisabled = true;
      } catch {}
      await deleteTenantRows(client, id);
      inserted = await importTenantRows(client, id, tablesData);
      if (roleDisabled) {
        await client.query('SET LOCAL session_replication_role = origin');
      }
      await client.query('COMMIT');

      const profile = readClinicProfile();
      if (profile.GLOBAL_SAAS_TENANT_ID === id) {
        const ten = await pool.query(`SELECT * FROM tenants WHERE id = $1`, [id]);
        const cfg = await pool.query(`SELECT * FROM tenant_configurations WHERE tenant_id = $1`, [id]);
        if (ten.rows[0]) applyTenantToProfile(ten.rows[0], cfg.rows[0] || {});
      }
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    await auditLog(id, 'RESTORE', 'tenant_backups', id, actingUser(req), null, { name: name || 'uploaded', rows: inserted });
    res.json({ success: true, message: 'Hospital restored', inserted, manifest });
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  } finally {
    if (workDir) {
      try { fs.rmSync(workDir, { recursive: true, force: true }); } catch {}
    }
  }
});

router.get('/api/superadmin/schema-status', async (_req: Request, res: Response) => {
  try {
    const status = await getSchemaStatus(pool);
    res.json(status);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.post('/api/superadmin/schema-ack', async (_req: Request, res: Response) => {
  try {
    const version = await ackCloudSchema(pool);
    await auditLog(null, 'UPDATE', 'superadmin_settings', null, actingUser(_req), null, { schema_version_cloud: version });
    res.json({ success: true, cloud_version: version });
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// ---------------------------------------------------------------------------
// Remote software update — pull the latest code from the central git repository
// (offline-first: the machine must be online for a moment; then restart the
// server to apply). Data is never touched — only code files change.
//
// Security: the deployed repository must use a READ-ONLY credential (a
// read-only fine-grained PAT or deploy key, configured with
// scripts/hospital_git_setup.ps1). URLs containing an embedded password are
// rejected here and flagged by /git-config — credentials must never live in
// .git/config or in settings.
// ---------------------------------------------------------------------------

router.post('/api/superadmin/git-update', async (_req: Request, res: Response) => {
  try {
    const out = pullUpdate();
    const status = await refreshUpdateCache();
    await persistUpdateReport(true);
    const output = (out || '').trim();
    await auditLog(null, 'UPDATE', 'software_update', null, actingUser(_req), null, { result: output.slice(0, 2000), commit: status.local_sha });
    res.json({ success: true, message: 'Repository updated. Restart the server to apply the new code.', output });
  } catch (err: any) {
    await refreshUpdateCache().catch(() => {});
    await persistUpdateReport(true).catch(() => {});
    await auditLog(null, 'UPDATE', 'software_update', null, actingUser(_req), null, { result: (err.message || '').slice(0, 2000) });
    res.status(500).json({ error: true, message: err.message, output: err.message });
  }
});

// Software update status — reads the daemon's cached status (no git subprocess)
// plus the persisted per-machine report (applied commit, last pull, phone home).
router.get('/api/superadmin/update-status', async (_req: Request, res: Response) => {
  try {
    const status = getCachedUpdateStatus();
    const report = await getUpdateReportRow();
    res.json({ ...status, report });
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// Force a live git check (cheap ls-remote), update the cache, and persist +
// phone home the latest state immediately.
router.post('/api/superadmin/update-check', async (_req: Request, res: Response) => {
  try {
    const status = await refreshUpdateCache();
    await persistUpdateReport(true);
    const report = await getUpdateReportRow();
    res.json({ ...status, report });
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// Git remote configuration (read-only discipline):
// GET returns the sanitized repo/branch/credential state; PUT stores the repo
// URL + branch to follow and applies `git remote set-url origin` locally.
// URLs with embedded credentials are rejected — use the setup script instead.
router.get('/api/superadmin/git-config', async (_req: Request, res: Response) => {
  try {
    const repoRoot = path.resolve(__dirname, '..', '..', '..');
    let originUrl = '';
    let isGit = true;
    try {
      const remotes = (await runCmd('git', ['remote'], repoRoot)).stdout.trim().split(/\r?\n/).filter(Boolean);
      const remote = remotes[0] || 'origin';
      originUrl = (await runCmd('git', ['remote', 'get-url', remote], repoRoot)).stdout.trim();
    } catch {
      isGit = false;
    }
    const clean = sanitizeRepoUrl(originUrl || null);
    const result = await pool.query(
      `SELECT setting_key, setting_value FROM superadmin_settings
       WHERE setting_key IN ('git_remote_url', 'git_branch')`
    );
    const settings: Record<string, string> = {};
    for (const r of result.rows) settings[r.setting_key] = r.setting_value || '';
    res.json({
      repo_root: repoRoot,
      is_git: isGit,
      origin_url: clean,
      has_embedded_credentials: urlHasEmbeddedCredentials(originUrl || null),
      remote_url_setting: sanitizeRepoUrl(settings.git_remote_url || null),
      branch_setting: settings.git_branch || '',
      branch_override_enabled: !!settings.git_branch,
    });
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.put('/api/superadmin/git-config', async (req: Request, res: Response) => {
  try {
    const remoteUrl = (req.body?.remote_url || '').trim().replace(/\/+$/, '');
    const branch = (req.body?.branch || '').trim();
    if (remoteUrl && urlHasEmbeddedCredentials(remoteUrl)) {
      res.status(400).json({
        error: true,
        message: 'Refusing to store a URL that contains a password/token. Configure the read-only credential with scripts/hospital_git_setup.ps1 instead, and store only the plain https URL here.',
      });
      return;
    }

    // Store the URL/branch to follow in settings (used by the daemon + UI).
    const keys: string[] = [];
    const vals: any[] = [];
    if (remoteUrl) {
      keys.push('git_remote_url');
      vals.push(remoteUrl);
    }
    if (branch) {
      keys.push('git_branch');
      vals.push(branch);
    }
    if (!keys.length) {
      res.status(400).json({ error: true, message: 'Provide a remote_url and/or branch' });
      return;
    }
    for (let i = 0; i < keys.length; i++) {
      await pool.query(
        `INSERT INTO superadmin_settings (setting_key, setting_value, updated_by, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (setting_key) DO UPDATE
           SET setting_value = EXCLUDED.setting_value, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
        [keys[i], vals[i], actingUser(req)]
      );
    }

    // Apply to the actual git repository (credentials are NOT part of this URL).
    if (remoteUrl) {
      const repoRoot = path.resolve(__dirname, '..', '..', '..');
      const remotes = (await runCmd('git', ['remote'], repoRoot)).stdout.trim().split(/\r?\n/).filter(Boolean);
      const remote = remotes[0] || 'origin';
      if (!remotes.length) {
        await runCmd('git', ['remote', 'add', remote, remoteUrl], repoRoot);
      } else {
        await runCmd('git', ['remote', 'set-url', remote, remoteUrl], repoRoot);
      }
    }

    await refreshUpdateCache();
    await persistUpdateReport(true);
    await auditLog(null, 'UPDATE', 'superadmin_settings', null, actingUser(req), null, {
      git_remote_url: sanitizeRepoUrl(remoteUrl || null),
      git_branch: branch,
    });
    res.json({ success: true, message: 'Git remote saved. Credentials stay in the OS credential store (see hospital_git_setup.ps1).' });
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// Verify the configured remote is reachable with the stored read-only
// credential (a cheap `git ls-remote`). Reports whether the credential was
// found and whether the URL accidentally embeds one.
router.post('/api/superadmin/git-verify', async (_req: Request, res: Response) => {
  try {
    const repoRoot = path.resolve(__dirname, '..', '..', '..');
    let remoteName = 'origin';
    try {
      const remotes = (await runCmd('git', ['remote'], repoRoot)).stdout.trim().split(/\r?\n/).filter(Boolean);
      remoteName = remotes[0] || 'origin';
    } catch {}
    let branch = 'master';
    try { branch = (await runCmd('git', ['rev-parse', '--abbrev-ref', 'HEAD'], repoRoot)).stdout.trim() || 'master'; } catch {}
    const branchSetting = await pool.query(
      `SELECT setting_value FROM superadmin_settings WHERE setting_key = 'git_branch'`
    );
    if (branchSetting.rows[0]?.setting_value) branch = branchSetting.rows[0].setting_value;

    let rawUrl = '';
    let helper = '';
    let embedded = false;
    try {
      rawUrl = (await runCmd('git', ['remote', 'get-url', remoteName], repoRoot)).stdout.trim();
      embedded = urlHasEmbeddedCredentials(rawUrl);
    } catch {}
    try {
      helper = (await runCmd('git', ['config', '--get', 'credential.helper'], repoRoot)).stdout.trim();
    } catch {}

    const { stdout, stderr } = await runCmd('git', ['ls-remote', remoteName, branch], repoRoot);
    const remoteSha = (stdout.split(/\t/)[0] || '').trim();
    const ok = !!remoteSha;
    const credentialFound = !!(await checkCredentialHelper(remoteName, rawUrl));
    res.json({
      success: ok,
      reachable: ok,
      remote_sha: remoteSha || null,
      branch,
      remote_name: remoteName,
      remote_url_clean: sanitizeRepoUrl(rawUrl || null),
      has_embedded_credentials: embedded,
      credential_helper: helper || 'none',
      credential_found: credentialFound,
      message: ok
        ? embedded
          ? 'Remote reachable, but the git URL embeds a secret — remove it and use the OS credential store.'
          : 'Remote reachable with the stored read-only credential.'
        : 'Remote not reachable (offline, wrong credential, or repository missing). Output: ' + (stderr || stdout).slice(0, 300),
    });
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message, reachable: false });
  }
});

// Best-effort detection that a credential provider exists for the remote host
// (git-credential-manager / manager-core / wincred are all acceptable; we only
// require that credentials are NOT embedded in the URL).
async function checkCredentialHelper(_remote: string, rawUrl: string): Promise<string | null> {
  if (!rawUrl || /^(file|ssh):/i.test(rawUrl)) return 'none-needed';
  try {
    const repoRoot = path.resolve(__dirname, '..', '..', '..');
    const helper = (await runCmd('git', ['config', '--get', 'credential.helper'], repoRoot)).stdout.trim();
    return helper || null;
  } catch {
    return null;
  }
}

// Publish a release signal to the cloud so hospitals pull the latest code
// within seconds (event-driven, no polling waits).
//   - No tenant_id  → GLOBAL release: every online hospital reacts.
//   - With tenant_id → TARGETED release: only that hospital (tenant) pulls.
// Targeted releases use the tenant_software_releases map in superadmin_settings
// (the same no-RLS channel as software_version), so they work on Cloud SaaS and
// Private Cloud alike. Works for Cloud SaaS (shared project); Private Cloud
// hospitals also react via the cheap git SHA check.
router.post('/api/superadmin/publish-update', async (req: Request, res: Response) => {
  try {
    const profile = readClinicProfile();
    const creds = await resolveCloudCredentials(profile);
    if (!creds) {
      res.status(400).json({
        error: true,
        message: 'No cloud project configured for the active hospital. Push to GitHub instead — hospitals with auto-update enabled will pull it via git.',
      });
      return;
    }
    const supabaseUrl = creds.url.replace(/\/$/, '');
    const headers = {
      apikey: creds.anonKey,
      Authorization: `Bearer ${creds.anonKey}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates',
    };
    const version = new Date().toISOString();
    const tenantId = (req.body?.tenant_id || '').trim();

    if (tenantId) {
      // Targeted roll-out: merge this tenant into the release map so only its
      // host machine reacts. Machines that were offline apply it on reconnect.
      let map: Record<string, string> = {};
      try {
        const existing = await axios.get(`${supabaseUrl}/rest/v1/superadmin_settings`, {
          headers: { apikey: creds.anonKey, Authorization: `Bearer ${creds.anonKey}` },
          params: { setting_key: 'eq.tenant_software_releases', select: 'setting_value', limit: '1' },
        });
        const raw = existing.data?.[0]?.setting_value;
        if (raw) map = JSON.parse(raw);
      } catch {}
      map[tenantId] = version;
      await axios.post(
        `${supabaseUrl}/rest/v1/superadmin_settings`,
        [{ setting_key: 'tenant_software_releases', setting_value: JSON.stringify(map) }],
        { headers }
      );
      await auditLog(null, 'PUBLISH', 'software_update', tenantId, actingUser(req), null, { version, target: tenantId });
      res.json({
        success: true,
        targeted: true,
        tenant_id: tenantId,
        message: `Release signal published for hospital ${tenantId}. Its host pulls the latest code within seconds (when online).`,
        version,
      });
      return;
    }

    await axios.post(
      `${supabaseUrl}/rest/v1/superadmin_settings`,
      [{ setting_key: 'software_version', setting_value: version }],
      { headers }
    );
    await auditLog(null, 'PUBLISH', 'software_update', null, actingUser(req), null, { version });
    res.json({
      success: true,
      targeted: false,
      message: 'Release signal published. Every online hospital will pull the latest code within seconds.',
      version,
    });
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// Fleet roll-out view — reads every hospital host's latest update report from
// the shared Cloud SaaS project (rows are scoped per tenant). When the console
// machine runs in Cloud SaaS mode the whole platform is visible in one list.
router.get('/api/superadmin/fleet-status', async (_req: Request, res: Response) => {
  try {
    const profile = readClinicProfile();
    const creds = await resolveCloudCredentials(profile);
    if (!creds) {
      res.status(400).json({ error: true, message: 'No cloud project configured for the active hospital. Fleet status is available on a Cloud SaaS console.' });
      return;
    }
    const url = creds.url.replace(/\/$/, '');
    const response = await axios.get(`${url}/rest/v1/machine_update_reports`, {
      headers: { apikey: creds.anonKey, Authorization: `Bearer ${creds.anonKey}` },
      params: { select: '*', order: 'updated_at.desc', limit: '1000' },
    });
    res.json({ rows: response.data || [], mode: profile.deployment_mode });
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// Comprehensive fleet monitor for the Software Update / Deployments page.
// Aggregates every hospital host's update report (commit SHA, last pull,
// phone-home state) and computes roll-out summary metrics so a central console
// can see at a glance which hospitals are on the latest code.
router.get('/api/superadmin/fleet', async (req: Request, res: Response) => {
  try {
    const profile = readClinicProfile();
    const localTenantId = profile.GLOBAL_SAAS_TENANT_ID || null;
    const localRows: any[] = await getLocalUpdateReports();

    let cloudRows: any[] = [];
    let source: 'cloud' | 'local' | 'none' = 'local';
    let mode: string | null = profile.deployment_mode || null;
    let error: string | null = null;

    const creds = await resolveCloudCredentials(profile);
    if (creds) {
      try {
        const url = creds.url.replace(/\/$/, '');
        const response = await axios.get(`${url}/rest/v1/machine_update_reports`, {
          headers: { apikey: creds.anonKey, Authorization: `Bearer ${creds.anonKey}` },
          params: { select: '*', order: 'updated_at.desc', limit: '5000' },
        });
        cloudRows = response.data || [];
        source = 'cloud';
      } catch (err: any) {
        error = err.response?.status === 404
          ? 'machine_update_reports table missing in the cloud project — run the updated schema SQL (Cloud & Sync → Cloud Database Schema).'
          : (err.message || 'Cloud read failed');
        cloudRows = [];
      }
    } else if (localRows.length > 0) {
      source = 'local';
    } else {
      source = 'none';
    }

    // Merge: cloud is the authoritative fleet view (all hospitals). Local rows
    // are a fallback for Offline Standalone consoles and fill gaps for
    // hospitals that have not phoned home yet.
    const merged = mergeFleetRows(localRows, cloudRows);

    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;
    const fmt = (v: any): string | null => (v ? String(v) : null);

    const rows = merged.map((r) => ({
      tenant_id: fmt(r.tenant_id),
      machine_id: fmt(r.machine_id),
      hospital_name: fmt(r.hospital_name) || 'Unknown hospital',
      deployment_mode: fmt(r.deployment_mode) || 'OFFLINE_STANDALONE',
      branch: fmt(r.branch) || '—',
      local_sha: fmt(r.local_sha),
      remote_sha: fmt(r.remote_sha),
      last_commit: fmt(r.last_commit),
      update_available: !!r.update_available,
      auto_update_enabled: !!r.auto_update_enabled,
      interval_minutes: r.interval_minutes ?? null,
      cloud_version: fmt(r.cloud_version),
      local_signal_version: fmt(r.local_signal_version),
      repo_url_clean: fmt(r.repo_url_clean),
      last_check_at: fmt(r.last_check_at),
      last_pull_at: fmt(r.last_pull_at),
      last_pull_ok: r.last_pull_ok === true ? true : (r.last_pull_ok === false ? false : null),
      last_pull_error: fmt(r.last_pull_error),
      last_pull_output: fmt(r.last_pull_output),
      last_phone_at: fmt(r.last_phone_at),
      last_phone_ok: r.last_phone_ok === true ? true : (r.last_phone_ok === false ? false : null),
      last_phone_error: fmt(r.last_phone_error),
      updated_at: fmt(r.updated_at),
      source: r.__source,
    }));

    const staleAfterMs = Math.max(parseInt(req.query.stale_hours as string, 10) || 24, 1) * 60 * 60 * 1000;
    const upToDate = rows.filter((r) => !r.update_available);
    const summary = {
      total: rows.length,
      distinct_hospitals: new Set(rows.map((r) => r.tenant_id).filter(Boolean)).size,
      up_to_date: upToDate.length,
      update_pending: rows.filter((r) => r.update_available).length,
      pull_failed: rows.filter((r) => r.last_pull_ok === false).length,
      stale: rows.filter((r) => r.updated_at && now - new Date(r.updated_at).getTime() > staleAfterMs).length,
      auto_update_off: rows.filter((r) => !r.auto_update_enabled).length,
      never_pulled: rows.filter((r) => !r.last_pull_at && !!r.local_sha).length,
      never_reported: rows.filter((r) => !r.last_phone_at).length,
      source,
    };

    const sortRank = (r: any) =>
      (r.last_pull_ok === false ? 0 : r.update_available ? 1 : r.last_phone_ok === false ? 2 : 3);
    rows.sort((a, b) => sortRank(a) - sortRank(b) || (a.hospital_name || '').localeCompare(b.hospital_name || ''));

    res.json({
      source,
      mode,
      local_tenant: localTenantId,
      error,
      generated_at: new Date().toISOString(),
      summary,
      rows,
    });
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

async function getLocalUpdateReports(): Promise<any[]> {
  try {
    const res = await pool.query(
      `SELECT * FROM machine_update_reports ORDER BY updated_at DESC`
    );
    return res.rows;
  } catch {
    return [];
  }
}

// Combine local + cloud report rows. When both exist for the same
// (tenant, machine) the CLOUD copy is authoritative: a machine phones home
// AFTER every local write, so the cloud row reflects the latest state and must
// surface as a cloud row (otherwise the Roll out button would never appear).
function mergeFleetRows(localRows: any[], cloudRows: any[]): any[] {
  const byKey = new Map<string, any>();
  for (const r of localRows) {
    const key = `${r.tenant_id || ''}|${r.machine_id || ''}`;
    byKey.set(key, { ...r, __source: 'local' });
  }
  for (const r of cloudRows) {
    const key = `${r.tenant_id || ''}|${r.machine_id || ''}`;
    byKey.set(key, { ...r, __source: 'cloud' }); // cloud row always wins
  }
  return Array.from(byKey.values());
}

// ---------------------------------------------------------------------------
// Clear data screen support — empty the clinical/operational DATA of one
// tenant (hospital) or ALL tenants while NEVER deleting the schema, the
// tenant/hospital rows, hospital configurations, or superadmin accounts.
// Only tenant-scoped tables can be cleared; protected tables are excluded
// server-side. Requires the superadmin master code.
// ---------------------------------------------------------------------------

const CLEAR_LOCKED_TABLES = ['tenants', 'tenant_configurations'];
// Never offered at all — global system tables.
const CLEAR_GLOBAL_PROTECTED = ['super_admin_users', 'superadmin_settings'];
// Checked-off by default in the UI (users/operational records), but selectable.
const CLEAR_KEEP_BY_DEFAULT = [
  'staff_users', 'departments', 'audit_logs', 'machine_update_reports',
];

async function listTenantScopedTables(client: any): Promise<string[]> {
  const res = await client.query(
    `SELECT DISTINCT table_name
     FROM information_schema.columns
     WHERE table_schema = 'public' AND column_name = 'tenant_id'
     ORDER BY table_name`
  );
  return res.rows.map((r: any) => r.table_name);
}

async function listTenants(): Promise<Array<{ id: string; hospital_name: string }>> {
  const res = await pool.query(
    `SELECT id, hospital_name FROM tenants ORDER BY hospital_name`
  );
  return res.rows.map((r: any) => ({ id: r.id, hospital_name: r.hospital_name }));
}

router.get('/api/superadmin/clear-catalog', async (_req: Request, res: Response) => {
  try {
    const tenants = await listTenants();
    const tableNames = await listTenantScopedTables(pool);
    const tables = [];
    for (const name of tableNames) {
      const cnt = await pool.query(
        `SELECT count(*)::int AS c FROM ${quoteIdent(name)}`
      );
      tables.push({
        name,
        approx_rows: cnt.rows[0]?.c ?? 0,
        is_locked: CLEAR_LOCKED_TABLES.includes(name),
        selected_by_default: !CLEAR_KEEP_BY_DEFAULT.includes(name),
      });
    }
    res.json({
      tenants,
      tables,
      locked: CLEAR_LOCKED_TABLES,
      global_protected: CLEAR_GLOBAL_PROTECTED,
      keep_by_default: CLEAR_KEEP_BY_DEFAULT,
    });
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// Clear data rows.
// body: { tenant_id?: string | null (omit/"all" => every tenant), tables: string[], master_code: string }
router.post('/api/superadmin/clear-data', async (req: Request, res: Response) => {
  try {
    const codeRes = await pool.query(
      `SELECT setting_value FROM superadmin_settings WHERE setting_key = 'master_code'`
    );
    const expected = codeRes.rows[0]?.setting_value || '5788';
    if (String((req.body?.master_code || '')).trim() !== String(expected)) {
      res.status(403).json({ error: true, message: 'Incorrect master code' });
      return;
    }

    const requested: string[] = Array.isArray(req.body?.tables)
      ? (req.body.tables as string[]).map((t) => String(t)).filter(Boolean)
      : [];
    const tenantRaw = String(req.body?.tenant_id || '').trim();
    const allTenants = !tenantRaw || tenantRaw.toLowerCase() === 'all';

    if (requested.length === 0) {
      res.status(400).json({ error: true, message: 'Select at least one table to clear' });
      return;
    }

    // Validate tenant (when a specific one is requested).
    let tenantId: string | null = null;
    if (!allTenants) {
      const tRes = await pool.query(`SELECT id FROM tenants WHERE id = $1`, [tenantRaw]);
      if (tRes.rows.length === 0) {
        res.status(400).json({ error: true, message: 'Tenant not found' });
        return;
      }
      tenantId = tRes.rows[0].id;
    }

    // Validate tables: must exist, be tenant-scoped, and not locked/protected.
    const scoped = await listTenantScopedTables(pool);
    const scopedSet = new Set(scoped);
    const selected: string[] = [];
    for (const name of requested) {
      if (!scopedSet.has(name)) {
        res.status(400).json({ error: true, message: `Table ${name} is not a tenant-scoped data table.` });
        return;
      }
      if (CLEAR_LOCKED_TABLES.includes(name)) {
        res.status(403).json({ error: true, message: `Table ${name} is locked — tenants are never deleted by this tool.` });
        return;
      }
      if (CLEAR_GLOBAL_PROTECTED.includes(name)) {
        res.status(403).json({ error: true, message: `Table ${name} is system-protected.` });
        return;
      }
      if (!selected.includes(name)) selected.push(name);
    }

    const client = await pool.connect();
    const cleared: Array<{ table: string; rows: number }> = [];
    try {
      await client.query('BEGIN');
      // Suspend FK enforcement so deletion order never matters; the transaction
      // restores the role automatically on COMMIT/ROLLBACK.
      await client.query('SET LOCAL session_replication_role = replica');
      for (const table of selected) {
        const q = allTenants
          ? `DELETE FROM ${quoteIdent(table)}`
          : `DELETE FROM ${quoteIdent(table)} WHERE tenant_id = $1`;
        const resQ = allTenants
          ? await client.query(q)
          : await client.query(q, [tenantId]);
        cleared.push({ table, rows: resQ.rowCount || 0 });
      }
      await client.query('COMMIT');
    } catch (err: any) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    const total = cleared.reduce((n, c) => n + c.rows, 0);
    await auditLog(
      tenantId,
      'DELETE',
      'data_clear',
      tenantId || null,
      actingUser(req),
      null,
      { scope: allTenants ? 'ALL_TENANTS' : tenantId, tables: cleared, total }
    );
    res.json({
      success: true,
      scope: allTenants ? 'all' : tenantId,
      message: `Cleared ${total} row(s) from ${cleared.length} table(s). The schema and tenants were NOT touched.`,
      tables: cleared,
      total,
    });
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// ---------------------------------------------------------------------------
// Schema export — full SQL to recreate the database schema elsewhere
// (e.g. Supabase SQL editor) so Private Cloud / Cloud SaaS sync can work.
// ---------------------------------------------------------------------------

router.get('/api/superadmin/schema-export', async (req: Request, res: Response) => {
  try {
    let sql = '-- ============================================================\n';
    sql += '-- Sretan EMR / MACHOKO HMS complete database schema\n';
    sql += '-- Generated: ' + new Date().toISOString() + '\n';
    sql += '-- Run this in the Supabase SQL editor (or any PostgreSQL) to recreate the schema.\n';
    sql += '-- ============================================================\n\n';

    let migrationFiles: string[] = [];
    try {
      migrationFiles = fs.readdirSync(MIGRATIONS_DIR)
        .filter((f) => f.endsWith('.sql') && /^\d{3}_/.test(f))
        .sort();
    } catch {}

    for (const f of migrationFiles) {
      const content = fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf-8');
      sql += `-- ============ ${f} ============\n${content}\n\n`;
    }

    if (req.query.inline === '1') {
      res.json({ sql, migration_files: migrationFiles, generated_at: new Date().toISOString() });
      return;
    }

    res.setHeader('Content-Type', 'application/sql');
    res.setHeader('Content-Disposition', 'attachment; filename="sretan-emr-schema.sql"');
    res.send(sql);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

export default router;
