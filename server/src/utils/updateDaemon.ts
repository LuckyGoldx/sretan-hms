import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { spawn, execFileSync } from 'child_process';
import axios from 'axios';
import pool from '../db/pool';
import { readClinicProfile } from '../config/reader';
import { resolveCloudCredentials } from '../sync/cloudCredentials';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

function runGit(args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      cwd: REPO_ROOT,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('error', (err) => reject(err));
    child.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`git ${args[0]} failed (exit ${code}): ${(stderr || stdout).slice(0, 300)}`));
    });
  });
}

function gitSync(args: string[]): string {
  return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf-8', windowsHide: true }).trim();
}

async function getSetting(key: string, dflt: string): Promise<string> {
  try {
    const res = await pool.query(
      `SELECT setting_value FROM superadmin_settings WHERE setting_key = $1`,
      [key]
    );
    return res.rows[0]?.setting_value || dflt;
  } catch {
    return dflt;
  }
}

async function setSetting(key: string, value: string): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO superadmin_settings (setting_key, setting_value)
       VALUES ($1, $2)
       ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = NOW()`,
      [key, value]
    );
  } catch {}
}

// ---------------------------------------------------------------------------
// URL safety — never log, store, or display credentials embedded in a git URL.
// ---------------------------------------------------------------------------

export function sanitizeRepoUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/^(https?:\/\/)([^/@\s]+)@(.*)$/i);
  if (m) return `${m[1]}${m[3]}`;
  return url;
}

export function urlHasEmbeddedCredentials(url: string | null | undefined): boolean {
  if (!url) return false;
  return /^https?:\/\/[^/@\s]*:[^/@\s]*@/i.test(url) || /^https?:\/\/[^/@\s]+@/i.test(url);
}

// ---------------------------------------------------------------------------
// Cached status
// The background daemon is the ONLY thing that runs git commands (a cheap
// `ls-remote` each cycle). The status endpoint just reads this in-memory
// cache, so browser polling costs almost nothing and the data is never more
// than one daemon cycle old (~30s, or ~15s via the cloud release signal).
// ---------------------------------------------------------------------------

export interface UpdateStatusCache {
  checked_at: string;
  auto_update_enabled: boolean;
  interval_minutes: number;
  branch: string | null;
  branch_override: string;
  remote: string | null;
  remote_url: string | null;
  credential_secure: boolean;
  local_sha: string | null;
  remote_sha: string | null;
  update_available: boolean;
  cloud_version: string | null;
  local_signal_version: string;
  last_commit: string;
  tenant_cloud_release: string | null;
  tenant_release_applied: string | null;
  tenant_release_pending: boolean;
}

let cachedStatus: UpdateStatusCache | null = null;

// Effective branch to follow. Defaults to the repository's current branch;
// a superadmin can override it with the `git_branch` setting (see the
// Software Update tab) so machines can be pointed at a release branch.
let overrideBranch = '';

function effectiveBranch(): string {
  if (overrideBranch) return overrideBranch;
  try {
    const b = gitSync(['rev-parse', '--abbrev-ref', 'HEAD']);
    return b || 'master';
  } catch {
    return 'master';
  }
}

export interface RepoInfo {
  branch: string;
  remote: string;
  localSha: string;
  remoteSha: string | null;
  remoteUrl: string | null;
}

export function getRepoInfo(): RepoInfo | null {
  try {
    const branch = effectiveBranch();
    const remotes = gitSync(['remote']).split(/\r?\n/).filter(Boolean);
    const remote = remotes[0];
    if (!remote) return null;
    const localSha = gitSync(['rev-parse', 'HEAD']);
    let remoteSha: string | null = null;
    try {
      remoteSha = gitSync(['ls-remote', remote, branch]).split(/\t/)[0] || null;
    } catch {}
    let remoteUrl: string | null = null;
    try {
      remoteUrl = sanitizeRepoUrl(gitSync(['remote', 'get-url', remote]));
    } catch {}
    return { branch, remote, localSha, remoteSha, remoteUrl };
  } catch {
    return null;
  }
}

export function isUpdateAvailable(): boolean {
  const info = getRepoInfo();
  return !!info && !!info.remoteSha && info.remoteSha !== info.localSha;
}

// ---------------------------------------------------------------------------
// Pull outcome tracking — every successful/failed pull is remembered so the
// per-machine report (and therefore the cloud "phone home") records exactly
// which commit was applied and whether the last pull succeeded.
// ---------------------------------------------------------------------------

export interface PullOutcome {
  at: string;
  ok: boolean;
  output?: string;
  error?: string;
}

let lastPullOutcome: PullOutcome | null = null;

export function getLastPullOutcome(): PullOutcome | null {
  return lastPullOutcome;
}

const PENDING_APPLY_FILE = path.join(REPO_ROOT, 'server', 'UPDATE_PENDING_SHA');

// The hospital runs COMPILED output (server/dist + client/dist). A successful
// git pull only changes source files, so we drop a marker that a scheduled
// apply task (scripts/apply_update.ps1) uses to rebuild and restart the
// service. This keeps "push to git → hospital updated" fully hands-off while
// never interrupting a clinic mid-shift.
function recordPendingApply(): void {
  try {
    const sha = gitSync(['rev-parse', 'HEAD']);
    if (sha) fs.writeFileSync(PENDING_APPLY_FILE, sha, 'utf-8');
  } catch {}
}

export function pullUpdate(): string {
  const info = getRepoInfo();
  if (!info) throw new Error('No git remote configured');
  try {
    const out = gitSync(['pull', '--ff-only', info.remote, info.branch]);
    lastPullOutcome = { at: new Date().toISOString(), ok: true, output: out.slice(0, 2000) };
    recordPendingApply();
    return out;
  } catch (e) {
    const message = (e as Error).message;
    lastPullOutcome = { at: new Date().toISOString(), ok: false, error: message.slice(0, 2000) };
    throw new Error(message);
  }
}

async function getCloudVersion(): Promise<string | null> {
  return getCloudSetting('software_version');
}

// Read one global setting straight from the cloud project (used for the global
// release signal and the per-tenant release map). Offline → null.
async function getCloudSetting(key: string): Promise<string | null> {
  try {
    const profile = readClinicProfile();
    const creds = await resolveCloudCredentials(profile);
    if (!creds) return null;
    const url = creds.url.replace(/\/$/, '');
    const headers = { apikey: creds.anonKey, Authorization: `Bearer ${creds.anonKey}` };
    const res = await axios.get(`${url}/rest/v1/superadmin_settings`, {
      headers,
      params: { setting_key: 'eq.' + key, select: 'setting_value', limit: '1' },
    });
    return res.data?.[0]?.setting_value || null;
  } catch {
    return null;
  }
}

// The targeted-release map: { [tenantId]: releaseVersion }. Broadcasts go to
// every hospital (software_version); targeted roll-outs go to ONE tenant's
// entry in this map, and each machine only reacts to its own tenant's entry.
export async function getTenantReleaseMap(): Promise<Record<string, string>> {
  try {
    const raw = await getCloudSetting('tenant_software_releases');
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function getAppliedTenantReleases(): Record<string, string> {
  // sync settings read would need async; use cached value refreshed each cycle
  return appliedTenantReleasesCache;
}

let appliedTenantReleasesCache: Record<string, string> = {};

async function loadAppliedTenantReleases(): Promise<void> {
  const raw = await getSetting('tenant_release_applied', '');
  try {
    const parsed = JSON.parse(raw);
    appliedTenantReleasesCache = parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    appliedTenantReleasesCache = {};
  }
}

async function setAppliedTenantRelease(tenantId: string, version: string): Promise<void> {
  const map = { ...appliedTenantReleasesCache, [tenantId]: version };
  appliedTenantReleasesCache = map;
  await setSetting('tenant_release_applied', JSON.stringify(map));
}

function activeTenantId(): string {
  return readClinicProfile().GLOBAL_SAAS_TENANT_ID || '';
}

// Runs the git checks (one cheap ls-remote) and stores the result in cache.
export async function refreshUpdateCache(): Promise<UpdateStatusCache> {
  overrideBranch = await getSetting('git_branch', '');
  await loadAppliedTenantReleases();
  const info = getRepoInfo();
  const tenantId = activeTenantId();
  const tenantMap = await getTenantReleaseMap();
  const tenantCloudRelease = tenantId ? tenantMap[tenantId] || null : null;
  const tenantApplied = tenantId ? getAppliedTenantReleases()[tenantId] || null : null;
  let lastCommit = '';
  try { lastCommit = gitSync(['log', '-1', '--oneline']); } catch {}
  const status: UpdateStatusCache = {
    checked_at: new Date().toISOString(),
    auto_update_enabled: (await getSetting('auto_update_enabled', 'false')) === 'true',
    interval_minutes: parseInt(await getSetting('auto_update_interval_minutes', '1'), 10) || 1,
    branch: info?.branch || null,
    branch_override: overrideBranch,
    remote: info?.remote || null,
    remote_url: info?.remoteUrl || null,
    credential_secure: info ? !urlHasEmbeddedCredentials(info.remoteUrl) : true,
    local_sha: info?.localSha || null,
    remote_sha: info?.remoteSha || null,
    update_available: !!info && !!info.remoteSha && info.remoteSha !== info.localSha,
    cloud_version: await getCloudVersion(),
    local_signal_version: await getSetting('software_version', ''),
    last_commit: lastCommit,
    tenant_cloud_release: tenantCloudRelease,
    tenant_release_applied: tenantApplied,
    tenant_release_pending: !!tenantCloudRelease && tenantCloudRelease !== tenantApplied,
  };
  cachedStatus = status;
  return status;
}

// Zero-cost read used by the status endpoint — no git subprocesses.
export function getCachedUpdateStatus(): UpdateStatusCache {
  if (cachedStatus) return cachedStatus;
  return {
    checked_at: '',
    auto_update_enabled: false,
    interval_minutes: 1,
    branch: null,
    branch_override: '',
    remote: null,
    remote_url: null,
    credential_secure: true,
    local_sha: null,
    remote_sha: null,
    update_available: false,
    cloud_version: null,
    local_signal_version: '',
    last_commit: 'Not checked yet',
    tenant_cloud_release: null,
    tenant_release_applied: null,
    tenant_release_pending: false,
  };
}

// Applies pending release signals by pulling the latest code:
//  1. GLOBAL release signal (software_version) — every online hospital reacts.
//  2. TARGETED release signal (tenant_software_releases map) — only the machine
//     whose active tenant is targeted reacts (offline-first: markers are only
//     advanced after a successful pull, so a missed signal is retried whenever
//     the hospital next comes online).
async function applyCloudVersion(): Promise<boolean> {
  let pulled = false;
  try {
    const cloudVersion = await getCloudVersion();
    const localVersion = await getSetting('software_version', '');
    if (cloudVersion && cloudVersion !== localVersion) {
      const out = pullUpdate();
      console.log('[update] Global cloud release signal detected — pulled latest code:', out.slice(0, 300));
      await setSetting('software_version', cloudVersion);
      pulled = true;
    }
  } catch {
    // offline — will retry on the next cycle
  }

  const tenantId = activeTenantId();
  if (tenantId) {
    try {
      const map = await getTenantReleaseMap();
      const release = map[tenantId];
      if (release) {
        const applied = getAppliedTenantReleases()[tenantId] || null;
        if (release !== applied) {
          const out = pullUpdate();
          console.log(`[update] Targeted release signal for ${tenantId} — pulled latest code:`, out.slice(0, 300));
          await setAppliedTenantRelease(tenantId, release);
          pulled = true;
        }
      }
    } catch {
      // offline — will retry on the next cycle
    }
  }

  if (pulled) await refreshUpdateCache();
  return pulled;
}

// Called from the sync daemon every cycle (~15s). When the superadmin publishes
// an update, every online hospital pulls the new code almost immediately.
export async function checkUpdateSignal(): Promise<void> {
  try {
    const enabled = (await getSetting('auto_update_enabled', 'false')) === 'true';
    if (!enabled) return;
    await applyCloudVersion();
  } catch {}
}

// ---------------------------------------------------------------------------
// Per-machine report + cloud "phone home" (commit SHA status reporting back).
// The machine records a single local row per (tenant, machine). When the
// state changes it pushes that one row to the cloud with
// `Prefer: resolution=merge-duplicates`, so the operator's central view
// always shows the latest applied commit even after the hospital was offline.
// ---------------------------------------------------------------------------

let machineIdCache: string | null = null;

async function getOrCreateMachineId(): Promise<string> {
  if (machineIdCache) return machineIdCache;
  const existing = await getSetting('machine_id', '');
  if (existing) {
    machineIdCache = existing;
    return existing;
  }
  const id = crypto.randomUUID();
  await setSetting('machine_id', id);
  machineIdCache = id;
  return id;
}

function statusFingerprint(
  status: UpdateStatusCache,
  profile: ReturnType<typeof readClinicProfile>,
  tenantId: string | null
): string {
  const out = lastPullOutcome;
  return JSON.stringify({
    auto: status.auto_update_enabled,
    interval: status.interval_minutes,
    branch: status.branch,
    local: status.local_sha,
    remote: status.remote_sha,
    update: status.update_available,
    cloud: status.cloud_version,
    signal: status.local_signal_version,
    commit: status.last_commit,
    remote_url: status.remote_url,
    pull: out ? { ok: out.ok, at: out.at, err: out.error || '' } : null,
    // Config changes must invalidate the fingerprint too — otherwise a change
    // of deployment mode / hospital would never be written to the report.
    mode: profile.deployment_mode,
    hospital: profile.hospital_name,
    sync_enabled: profile.cloud_sync_enabled,
    tenant: tenantId,
  });
}

const PHONE_MIN_INTERVAL_MS = 30 * 1000;
const HEARTBEAT_MS = 15 * 60 * 1000;
let lastPhoneAttemptAt = 0;
let lastHeartbeatWriteAt = 0;
let lastContentFp = '';

function reportColumns(status: UpdateStatusCache, profile: ReturnType<typeof readClinicProfile>) {
  const out = lastPullOutcome;
  return {
    hospital_name: profile.hospital_name || null,
    deployment_mode: profile.deployment_mode || null,
    repo_url_clean: status.remote_url,
    branch: status.branch,
    local_sha: status.local_sha,
    remote_sha: status.remote_sha,
    last_commit: status.last_commit,
    update_available: status.update_available,
    auto_update_enabled: status.auto_update_enabled,
    interval_minutes: status.interval_minutes,
    cloud_version: status.cloud_version,
    local_signal_version: status.local_signal_version,
    last_check_at: status.checked_at,
    last_pull_at: out ? out.at : null,
    last_pull_ok: out ? (out.ok ? true : false) : null,
    last_pull_error: out?.error ? out.error.slice(0, 2000) : null,
    last_pull_output: out?.output ? out.output.slice(0, 2000) : null,
  };
}

// Persist the latest state locally and push the row to the cloud when this
// machine is cloud-connected. `force` bypasses the phone-home throttle so
// "Check Now" / "Pull Latest" report immediately.
export async function persistUpdateReport(force = false): Promise<void> {
  const status = cachedStatus;
  if (!status) return;
  const profile = readClinicProfile();
  const tenantId = profile.GLOBAL_SAAS_TENANT_ID || null;
  if (!tenantId) return; // not bound to a hospital yet — nothing to report

  const machineId = await getOrCreateMachineId();
  const fp = statusFingerprint(status, profile, tenantId);
  const now = Date.now();
  const heartbeatDue = now - lastHeartbeatWriteAt > HEARTBEAT_MS;
  if (!force && fp === lastContentFp && !heartbeatDue) return;

  const cols = reportColumns(status, profile);
  const nowIso = new Date().toISOString();

  try {
    const existing = await pool.query(
      `SELECT id, phone_fingerprint FROM machine_update_reports
       WHERE machine_id = $1 AND tenant_id = $2`,
      [machineId, tenantId]
    );

    if (existing.rows.length === 0) {
      await pool.query(
        `INSERT INTO machine_update_reports
           (tenant_id, machine_id, hospital_name, deployment_mode, repo_url_clean,
            branch, local_sha, remote_sha, last_commit, update_available,
            auto_update_enabled, interval_minutes, cloud_version, local_signal_version,
            last_check_at, last_pull_at, last_pull_ok, last_pull_error, last_pull_output)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
         ON CONFLICT (tenant_id, machine_id) DO NOTHING`,
        [
          tenantId, machineId, cols.hospital_name, cols.deployment_mode, cols.repo_url_clean,
          cols.branch, cols.local_sha, cols.remote_sha, cols.last_commit, cols.update_available,
          cols.auto_update_enabled, cols.interval_minutes, cols.cloud_version, cols.local_signal_version,
          cols.last_check_at, cols.last_pull_at, cols.last_pull_ok, cols.last_pull_error, cols.last_pull_output,
        ]
      );
    } else {
      await pool.query(
        `UPDATE machine_update_reports SET
           hospital_name = $3, deployment_mode = $4, repo_url_clean = $5, branch = $6,
           local_sha = $7, remote_sha = $8, last_commit = $9, update_available = $10,
           auto_update_enabled = $11, interval_minutes = $12, cloud_version = $13,
           local_signal_version = $14, last_check_at = $15, last_pull_at = $16,
           last_pull_ok = $17, last_pull_error = $18, last_pull_output = $19
         WHERE machine_id = $1 AND tenant_id = $2`,
        [
          machineId, tenantId, cols.hospital_name, cols.deployment_mode, cols.repo_url_clean,
          cols.branch, cols.local_sha, cols.remote_sha, cols.last_commit, cols.update_available,
          cols.auto_update_enabled, cols.interval_minutes, cols.cloud_version, cols.local_signal_version,
          cols.last_check_at, cols.last_pull_at, cols.last_pull_ok, cols.last_pull_error, cols.last_pull_output,
        ]
      );
    }
    lastContentFp = fp;
    lastHeartbeatWriteAt = now;

    // Phone home when something changed since the last successful push, or a
    // previous push failed (offline-first: retried on every cycle).
    if (force || now - lastPhoneAttemptAt > PHONE_MIN_INTERVAL_MS) {
      lastPhoneAttemptAt = now;
      await phoneHome(tenantId, machineId, cols, fp);
    }
  } catch (err: any) {
    console.warn('[update] Failed to persist update report:', err.message);
  }
}

async function phoneHome(
  tenantId: string,
  machineId: string,
  cols: ReturnType<typeof reportColumns>,
  fp: string
): Promise<void> {
  try {
    const row = await pool.query(
      `SELECT phone_fingerprint FROM machine_update_reports
       WHERE machine_id = $1 AND tenant_id = $2`,
      [machineId, tenantId]
    );
    const sentFp = row.rows[0]?.phone_fingerprint || null;
    if (sentFp === fp) return; // cloud already up to date

    const profile = readClinicProfile();
    const creds = await resolveCloudCredentials(profile);
    if (!creds) return; // offline standalone — report stays local

    const url = creds.url.replace(/\/$/, '');
    const payload = {
      machine_id: machineId,
      tenant_id: tenantId,
      hospital_name: cols.hospital_name,
      deployment_mode: cols.deployment_mode,
      repo_url_clean: cols.repo_url_clean,
      branch: cols.branch,
      local_sha: cols.local_sha,
      remote_sha: cols.remote_sha,
      last_commit: cols.last_commit,
      update_available: cols.update_available,
      auto_update_enabled: cols.auto_update_enabled,
      interval_minutes: cols.interval_minutes,
      cloud_version: cols.cloud_version,
      local_signal_version: cols.local_signal_version,
      last_check_at: cols.last_check_at,
      last_pull_at: cols.last_pull_at,
      last_pull_ok: cols.last_pull_ok,
      last_pull_error: cols.last_pull_error,
      last_pull_output: cols.last_pull_output,
      updated_at: new Date().toISOString(),
    };

    await axios.post(`${url}/rest/v1/machine_update_reports`, [payload], {
      headers: {
        apikey: creds.anonKey,
        Authorization: `Bearer ${creds.anonKey}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates',
      },
    });

    await pool.query(
      `UPDATE machine_update_reports
       SET phone_fingerprint = $3, last_phone_at = NOW(), last_phone_ok = TRUE, last_phone_error = NULL
       WHERE machine_id = $1 AND tenant_id = $2`,
      [machineId, tenantId, fp]
    );
    console.log(`[update] Report phoned home (${cols.local_sha?.slice(0, 7) || 'unknown'} @ ${cols.branch})`);
  } catch (err: any) {
    const msg = (err.response?.data?.message || err.message || String(err)).slice(0, 500);
    try {
      await pool.query(
        `UPDATE machine_update_reports SET last_phone_ok = FALSE, last_phone_error = $3
         WHERE machine_id = $1 AND tenant_id = $2`,
        [machineId, tenantId, msg]
      );
    } catch {}
    console.warn('[update] Phone home failed (will retry):', msg);
  }
}

// Latest local report row — attached to the update-status endpoint so the
// console shows the persisted applied-commit state across restarts.
export async function getUpdateReportRow(): Promise<any | null> {
  try {
    const tenantId = readClinicProfile().GLOBAL_SAAS_TENANT_ID;
    const res = await pool.query(
      `SELECT * FROM machine_update_reports
       WHERE tenant_id = $1
       ORDER BY updated_at DESC LIMIT 1`,
      [tenantId || null]
    );
    return res.rows[0] || null;
  } catch {
    return null;
  }
}

export function startUpdateDaemon(): void {
  const loop = async () => {
    try {
      // Always refresh the cache (cheap ls-remote) so the status endpoint stays
      // fresh even when auto-update is off. New code is therefore visible
      // within one cycle regardless of the polling endpoint.
      const status = await refreshUpdateCache();

      if (status.auto_update_enabled) {
        // New code detected on the remote → pull now.
        if (status.update_available) {
          try {
            const out = pullUpdate();
            console.log('[update] New code detected on remote — pulled:', out.slice(0, 300));
            await setSetting('software_version', status.cloud_version || '');
            await refreshUpdateCache();
          } catch (e: any) {
            console.warn('[update] Pull failed (offline or divergent):', e.message);
          }
        }
        // Cloud release signal (primary, near-instant via the sync channel).
        await applyCloudVersion();
      }

      // Persist + phone home the latest state every cycle.
      await persistUpdateReport();
    } catch (err: any) {
      console.warn('[update] daemon error:', err.message);
    }

    const minutes = parseInt(await getSetting('auto_update_interval_minutes', '1'), 10) || 1;
    setTimeout(loop, Math.max(1, minutes) * 60 * 1000);
  };

  // Seed the cache immediately, then start the loop.
  setTimeout(async () => {
    try { await refreshUpdateCache(); } catch {}
  }, 0);
  setTimeout(loop, 30 * 1000);
  console.log('[update] Update daemon started (cached status; event-driven via cloud release signal + cheap SHA check).');
}
