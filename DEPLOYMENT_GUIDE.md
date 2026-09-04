# Sretan HMS / MACHOKO EMR — Hospital Deployment Guide

Complete guide for installing the software on ONE hospital host machine, letting every other desktop in the hospital use it over LAN / hospital wireless, enabling offline-first cloud sync, remote software updates, and automatic daily backups to a flash drive.

**Applies to:** the `sretan-hms` monorepo (React/Vite client + Express/TypeScript server + PostgreSQL).

---

## 1. How the System Fits Together (Architecture)

```
        INTERNET (optional — cloud sync only)
                     │
                     │ Supabase (Cloud SaaS or Private Cloud)
                     ▼
         ┌─────────────────────────────────────┐
         │   HOST MACHINE  (ONE per hospital)   │
         │   ────────────────────────────────   │
         │  Node.js 18+  ──  Express API        │
         │  PostgreSQL 16  ── local database    │
         │  client/dist    ── web app files     │
         │  git repo       ── for auto-updates  │
         │  flash drive    ── daily backups     │
         └───────────────┬─────────────────────┘
                         │  LAN / WiFi (HTTP :3000)
        ┌────────────────┼──────────────────┐
        ▼                ▼                   ▼
   Desktop 1        Desktop 2           Desktop 3
   (browser)        (browser)           (browser)
   Records desk      Doctor office        Pharmacy
```

- **One host machine** runs the server + database. All other desktops are **thin clients** that only open a browser.
- All communication is plain HTTP over the hospital network — no per-desktop installation or configuration.
- The hospital keeps working **100% offline**; cloud sync (if enabled) only runs on the host and only when internet is available.
- A **daily flash backup** produces a single portable `.sbackup` file on a USB drive.

> **Important:** Do NOT install the full server on every desktop. Each machine would get its own independent database and they would conflict. The correct model is ONE host + browser on everything else.

---

## 2. What You Build and Copy

### 2.1 Build from source (once, on a developer PC)

**Client (web app):**

```powershell
cd C:\Users\LuckyGold\Desktop\Sretan EMR\client
npm install
npm run build
# Output: client\dist\  (index.html + assets/)
```

**Server (backend):**

```powershell
cd C:\Users\LuckyGold\Desktop\Sretan EMR\server
npm install
npm run build
# Output: server\dist\  (compiled server.js + all routes)
```

### 2.2 One-time production change (recommended)

The Express server does not yet serve the built web app. For single-port deployment, add static serving in `server/src/server.ts` so `http://<host-ip>:3000` serves both the web app and the `/api` routes:

```ts
const distDir = path.join(__dirname, '..', '..', '..', 'client', 'dist');
app.use(express.static(distDir));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(distDir, 'index.html'));
});
```

Then rebuild the server (`npm run build`).

### 2.3 The deployment bundle

Copy these three folders into the hospital machine's install folder (`C:\hms`):

```
C:\hms\
├── server\          ← server\dist\ contents (compiled code)
├── client\dist\     ← the built web app
└── database\        ← all migration files (database\*.sql)
```

> The server loads migrations from `<install_root>\database` (see `server/src/db/migrate.ts:6`), so the `database` folder MUST sit next to `server` and `client`.

Optional extras to bundle: a copy of `scripts\install_service.bat`, the `seed_users.cjs` file, and this guide.

---

## 3. Host Machine Preparation

Pick the computer that will be the hospital host. Requirements:

| Item | Requirement |
|------|-------------|
| OS | Windows 10/11 (64-bit) |
| CPU/RAM | Any modern PC, 4 GB+ RAM recommended |
| Node.js | 18+ (LTS recommended) — download from nodejs.org |
| PostgreSQL | 16+ (e.g., PostgreSQL 18 via EDB installer) |
| Network | Wired LAN or hospital WiFi (same subnet as client PCs) |
| USB | A flash drive for daily backups |

Install Node.js and PostgreSQL using their normal installers. During PostgreSQL installation, **remember the `postgres` superuser password** — you need it once during setup.

---

## 4. Database Setup

Open PowerShell on the host and create the database:

```powershell
& "C:\Program Files\PostgreSQL\18\bin\createdb.exe" -U postgres sretan_emr
```

(Enter the `postgres` password when prompted. Adjust the path if your PostgreSQL version differs.)

The schema is **created automatically** on first server start — every migration in `C:\hms\database` runs in order. You never run migration files by hand.

---

## 5. Install the Application Files

Copy the deployment bundle (Section 2.3) to the host so the layout is:

```
C:\hms\
├── server\          ← compiled backend
├── client\dist\     ← built web app
├── database\        ← migration SQL
├── config\          ← created automatically (clinic_profile.json)
├── logs\            ← created automatically (server logs)
├── assets\          ← created automatically (logos)
└── backups\         ← created automatically (full-system backups)
```

The server creates `config`, `logs`, `assets` and `backups` itself on first boot.

### 5.1 Database connection settings

The server reads connection settings from environment variables (`server/src/db/pool.ts`). Set them as **system environment variables** so the Windows service picks them up:

| Variable | Default | Meaning |
|----------|---------|---------|
| `PG_HOST` | `localhost` | database host |
| `PG_PORT` | `5432` | database port |
| `PG_DATABASE` | `sretan_emr` | database name |
| `PG_USER` | `postgres` | database user |
| `PG_PASSWORD` | `postgres` | database password |
| `PORT` | `3000` | web/API port |

PowerShell (one-time):

```powershell
[Environment]::SetEnvironmentVariable("PG_PASSWORD", "your-postgres-password", "Machine")
[Environment]::SetEnvironmentVariable("PORT", "3000", "Machine")
```

If you keep the defaults (`postgres`/`postgres`) you can skip this — but using a password other than the default is safer.

---

## 6. First Run & Verification

Start the server once manually to verify everything:

```powershell
cd C:\hms\server
node dist\server.js
```

Expected log output:

```
Running migration: 001_multi_tenant_schema.sql
...
MACHOKO HMS Server running on port 3000
```

On this first boot the server:

1. Runs all 65+ database migrations.
2. Creates the default tenant (`Default Hospital`).
3. Starts the offline-first sync daemon and the update daemon.

Verify the health endpoint on the host itself:

```powershell
Invoke-RestMethod -Uri "http://localhost:3000/api/health"
```

Then verify the web app loads:

```powershell
Invoke-WebRequest -Uri "http://localhost:3000" -UseBasicParsing
```

> Expected: HTTP 200. If it 404s, the static-serving step from Section 2.2 was not applied and the client build is not being served.

---

## 7. Run as an Always-On Windows Service

The host machine should run the server automatically at startup, without anyone logging in. Use **NSSM** (a small tool that wraps any exe as a Windows service).

Download nssm (nssm.cc), then:

```powershell
C:\nssm\nssm.exe install Hospital_EMR_Local_Core "C:\Program Files\nodejs\node.exe" "C:\hms\server\dist\server.js"
C:\nssm\nssm.exe set Hospital_EMR_Local_Core AppDirectory "C:\hms\server"
C:\nssm\nssm.exe set Hospital_EMR_Local_Core Start SERVICE_AUTO_START
C:\nssm\nssm.exe set Hospital_EMR_Local_Core AppStdout "C:\hms\logs\server_runtime.log"
C:\nssm\nssm.exe set Hospital_EMR_Local_Core AppStderr "C:\hms\logs\server_runtime.log"
C:\nssm\nssm.exe set Hospital_EMR_Local_Core AppRestartDelay 10000
net start Hospital_EMR_Local_Core
```

The service now starts on every boot, restarts on crash, and logs to `C:\hms\logs\server_runtime.log`.

> A ready-made template exists at `scripts\install_service.bat`.

---

## 8. Networking: LAN & Hospital Wireless

This is the step that makes every desktop able to talk to the host.

### 8.1 Allow the port through Windows Firewall

Windows blocks inbound connections to Node by default. On the HOST machine, run once (as Administrator):

```powershell
netsh advfirewall firewall add rule name="Sretan EMR API" dir=in action=allow protocol=TCP localport=3000 profile=private
```

### 8.2 Give the host a permanent IP address

A static IP (or a DHCP reservation on the router) prevents the host's address from changing:

```powershell
# Example: set static IP 192.168.1.200 (adjust to your network)
Get-NetAdapter | Select-Object Name, InterfaceDescription
New-NetIPAddress -InterfaceAlias "Ethernet" -IPAddress 192.168.1.200 -PrefixLength 24 -DefaultGateway 192.168.1.1
```

Or, simpler for most hospitals: log into the router and create a **DHCP reservation** for the host PC's MAC address.

### 8.3 Network requirements

- All desktops and the host must be on the **same network / subnet** (same router).
- **Disable "AP isolation" / "client isolation" / guest network** on the WiFi router. Many hospital routers ship with client isolation ON, which silently blocks desktops from reaching the host even though they show full WiFi bars.
- Wired Ethernet for the host is more reliable, but WiFi on the host works too.

---

## 9. Connecting Every Desktop in the Hospital

### 9.1 Browser access (recommended, zero install)

On EVERY other desktop in the hospital (records, doctor offices, pharmacy, lab, paypoint, maternity, etc.):

1. Open Chrome/Edge/Firefox.
2. Go to `http://192.168.1.200:3000` (use the host's actual IP).
3. Bookmark it, or set it as the homepage. That's it.

The web app uses **relative API paths** (`/api`), so it automatically talks to the same machine it was loaded from. There is no per-desktop configuration.

### 9.2 Optional: a desktop "app" icon (Tauri shell)

If staff prefer an app icon instead of a browser tab, build the Tauri thin client (`desktop/src-tauri`) — a small Windows installer that opens the fullscreen app pointed at the host. Set the host IP in `desktop/src-tauri/tauri.conf.json`:

```json
"security": {
  "csp": "default-src 'self'; connect-src http://192.168.1.200:3000; style-src 'self' 'unsafe-inline'"
}
```

This shell is optional; the browser version does exactly the same job.

### 9.3 What staff accounts to use

- The default seeded clinical accounts (`admin`, `doctor`, `nurse`, `lab`, `pharmacy`, `records`, `paypoint`, `consultant` — see `SETUP.md`) work immediately.
- For a real hospital, the SuperAdmin console (`http://<host-ip>:3000/superadmin/login`, seeded default `lucky` / `lucky`) is used to create the actual hospital tenant, staff, modules, and branding.

---

## 10. Offline-First & Cloud Sync

The system is fully offline by design. Cloud sync is optional and runs ONLY on the host.

### 10.1 Local-only (no cloud)

The hospital database lives entirely on the host. Nothing leaves the building. This is the default (`OFFLINE_STANDALONE`).

### 10.2 Enable cloud sync (Cloud SaaS or Private Cloud)

1. Login to SuperAdmin → `/superadmin` → Cloud & Sync.
2. Configure **Cloud SaaS** (global Supabase credentials) or **Private Cloud** (this hospital's own Supabase URL + anon key).
3. Run the schema SQL (provided live in the SuperAdmin Cloud page) on the Supabase project.
4. Selecting a deployment mode automatically enables `cloud_sync_enabled`.

Once enabled, the **sync daemon on the host** pushes/pulls changed rows every 15 seconds, so:

- A head-office / SuperAdmin view can see data from many hospitals.
- Subscription tier, enabled modules, and release signals propagate DOWN to the hospital automatically.

If internet drops, nothing breaks — the hospital keeps running locally and sync resumes when connectivity returns.

> Sync requires the host to reach the internet. The 15-second cycle only runs when credentials are valid.

---

## 11. Remote Software Updates

> **Authoritative end-to-end runbook:** `DEPLOY_TO_HOSPITAL.md` — step-by-step for installing a hospital host, connecting LAN desktops, and rolling code/database changes out remotely (global or per-tenant). This section is the short reference.

Updates are delivered **from your git repository** to every hospital automatically — no technician visit needed. Machines never accept inbound connections: you push to GitHub, and each hospital host pulls from GitHub whenever it is online (pull direction works through any router/NAT).

### 11.1 How it works

- The deployed folder `C:\hms` is a **git clone** of your repository (with `.git`, remote `origin`, branch e.g. `master`).
- The server runs `updateDaemon.ts` in the background:
  - It constantly compares the remote commit (a cheap `git ls-remote` SHA check, cached — no subprocesses when polling).
  - It listens for release signals that arrive through the cloud sync cycle: a **global** one (`software_version`) and a **targeted** one (`tenant_software_releases` map, only the named tenant reacts).
  - When a signal or SHA changes, it runs `git pull --ff-only` and writes an apply marker (`server\UPDATE_PENDING_SHA`).
- A scheduled task (`scripts/apply_update.ps1`, see `DEPLOY_TO_HOSPITAL.md`) then **rebuilds** the server + client and **restarts** the service, activating the new code and running any new database migrations on boot. This is what turns "pushed to git" into "running in the hospital" without a visit.
- Browser clients show an update banner and reload — no action needed from hospital staff.

### 11.2 Security: hospital machines are READ-ONLY

Hospital hosts must authenticate with a **read-only** credential. Two enforcements are built in:

1. **Server-side** — create a GitHub **fine-grained PAT with only `Contents: Read`** on your repository (never your personal write token), or a **read-only SSH deploy key**. A read-only credential cannot push even if the hospital machine is compromised.
2. **Application-side** — the console refuses URLs that embed a password/token, disables push on the machine (`pushurl`), and reports a red "Reachable but insecure" banner if it detects a secret inside a git URL.

**Configure a hospital host once** (run as Administrator, as the account the EMR service runs as):

```powershell
# from the project scripts folder
powershell -ExecutionPolicy Bypass -File .\hospital_git_setup.ps1 `
  -Repo "LuckyGoldx/sretan-hms" -Branch "master" -Token "github_pat_..."
```

- The token is stored in the **Windows credential store** (credential.helper = manager-core), never in `.git/config`, never in the database, never in any URL.
- The script verifies with a real `git ls-remote` and prints the remote SHA.
- Alternative: `-DeployKeyPath "C:\hms\deploy_key"` uses an SSH read-only deploy key instead of a PAT.

The per-hospital console (**Super Admin → Cloud & Sync → Software Update → Git Repository & Security**) can also:
- Set/update the repository URL + **branch to follow** (`git_branch` override) — remote changes apply without shell access.
- **Verify Remote Access** — performs the same read-only `ls-remote` check and reports the credential store in use.

### 11.3 Commit-SHA status reporting back (per-machine + fleet view)

Every host records one **update report row per (tenant, machine)** in the `machine_update_reports` table:

- Applied **commit SHA** + branch, remote SHA, `update available` flag, auto-update settings, last commit message.
- **Last pull outcome** (OK/failed + error text) and last check time.
- When cloud sync is configured, the update daemon **phones the row home** to the Supabase project (`Prefer: resolution=merge-duplicates`) whenever the state changes — retrying every cycle until it succeeds, so a hospital that was offline reports its true applied commit as soon as it reconnects. The applied-commit state is also persisted locally, so it survives restarts.

Where you see it:
- **This machine**: Software Update → Update Status now shows *Applied commit (reported)*, *last pull OK/FAILED*, and *Phoned home to cloud*.
- **Whole platform**: a dedicated **SuperAdmin → Fleet Monitor** page (`/superadmin/fleet`) aggregates every hospital host that has phoned home into the shared Cloud SaaS project. It shows:
  - Summary cards (up to date, update pending, pull failed, stale >24 h, auto-update off) and live status badges per host.
  - Per-hospital rows: hospital + deployment mode, machine ID, branch, **applied commit SHA** (with full-SHA copy), update-pending/current state, last pull result and error, last check, and phone-home state.
  - Expandable per-host detail (full SHAs, last commit message, repository URL, pull output/error, cloud release signal) and filters (status pills + free-text search), auto-refreshing every 60 s.
  - Sorting puts failed/pending hosts first so rollout problems surface immediately — this is how you confirm every hospital is on the version you intend.

> **After deploying this update**, migration `065_machine_update_reports.sql` is new, so: re-run the schema SQL in Supabase (Cloud → Cloud Database Schema → Copy SQL → Run) — otherwise the phone-home rows have no table to land in. The server does this automatically for its local database.

### 11.4 Daily workflow for the developer

1. Push code to GitHub (`git push origin master`).
2. Optional: publish a release signal in SuperAdmin → Cloud → Software Update → **Publish Update** to force immediate propagation.
3. Hospitals pull the new code within ~15–60 seconds.
4. Watch **SuperAdmin → Fleet Monitor** to confirm each hospital reports the new applied commit; investigate any host showing `FAILED` on last pull.

### 11.5 Enable auto-update per hospital

The update daemon is **disabled by default**. Enable it on the host via SuperAdmin → Cloud → Software Update (auto-update toggle + interval). Confirm the host has a stable internet connection for the `git ls-remote` check.

---

## 12. Daily Automatic Backup to a Flash Drive

The full-system backup already produces a single portable `.sbackup` zip (database dump + `clinic_profile.json` + assets + uploads + manifest) via `/api/superadmin/backup`. Automatic daily scheduling is added with a small daemon (planned, same pattern as `syncDaemon.ts`/`updateDaemon.ts`).

### 12.1 What the scheduled backup daemon does

- Runs on the host every day at a configured time (e.g., 02:00 AM after closing).
- Reads backup settings (enabled, time, destination drive, retention count).
- Auto-detects the USB flash drive by scanning removable drives on Windows.
- If the flash is missing → skips that day, logs a warning in the audit log. (Offline-friendly: it never fails the hospital.)
- If found → runs the existing full-system backup and writes the `.sbackup` zip to the flash.
- **Retention**: keeps only the last N backups on the drive and deletes older ones, so the flash never fills up.
- **Audit**: every scheduled backup records user = `system`, timestamp, size, destination, success/failure.

### 12.2 Staff procedure (one minute, once a day)

1. At close of day, plug the flash drive into the host machine.
2. The daemon backs up automatically at the configured time.
3. Next morning, unplug the flash and keep it in a safe place (ideally alternate two drives daily, one kept offsite).

### 12.3 Verify a backup exists

From any admin PC, open SuperAdmin → Backup → list/download to confirm today's `.sbackup` is present. Backup status also appears on the SuperAdmin Overview.

### 12.4 Restoring from the flash backup

1. Install a fresh host (Sections 3–6) or use the existing host after a failure.
2. In SuperAdmin → Backup → **Restore**, either point at the `.sbackup` on the flash or upload it.
3. Restore runs `pg_restore --clean --if-exists` + `ensureSchema()`, so the entire hospital (data, logos, uploaded images) returns exactly as it was.

> Full-system restore replaces ALL data — it is a recovery action, not a merge.

---

## 13. Security Checklist

- [ ] Change the seeded SuperAdmin credentials (`lucky`/`lucky`) immediately.
- [ ] Change the default tenant delete master code (default `5788`) in SuperAdmin → Settings.
- [ ] Set a real `PG_PASSWORD` (not the `postgres` default) and keep it in the host's environment variables only.
- [ ] Firewall rule restricted to `profile=private` — do not expose port 3000 to the public internet.
- [ ] Use the hospital network (or a VPN), never port-forward the host from the router.
- [ ] Enable cloud sync only with real Supabase credentials; treat anon keys as public, keep service-role secrets server-side.
- [ ] Hospital git remotes use a **read-only** fine-grained PAT / deploy key (never a personal write token) stored in the Windows credential store — never in a URL.
- [ ] Store at least one flash backup offsite.
- [ ] Every clinical change is already audit-logged with user ID + timestamp — review via SuperAdmin → Audit.

---

## 14. Troubleshooting

| Symptom | Fix |
|---------|-----|
| Desktops cannot reach `http://<host-ip>:3000` | Check firewall rule (8.1), check AP isolation / guest network (8.3), `ping <host-ip>` from a desktop |
| Page loads but login fails | Server down — check `C:\hms\logs\server_runtime.log` and the `Hospital_EMR_Local_Core` service |
| "Clinic Not Configured" at login | `C:\hms\config\clinic_profile.json` missing — create with `{"hospital_name": "Sretan HMS", "GLOBAL_SAAS_TENANT_ID": "00000000-0000-0000-0000-000000000001"}` |
| Database connection refused | PostgreSQL service running? (`Get-Service postgresql*`), correct `PG_*` env vars |
| `http://<host-ip>:3000` returns 404 | Static serving (Section 2.2) not applied — rebuild server |
| Cloud sync not running | Deployment mode not set to Cloud SaaS/Private Cloud, or invalid credentials |
| Auto-update not pulling | Auto-update toggle off on that hospital, or no internet on host |
| Backups stopped | Flash drive not plugged in, or retention count too low (drive full) |

---

## 15. One-Page Summary

1. **Build once:** `client\npm run build` + `server\npm run build` (+ one-time static-serving change).
2. **Copy to host:** `server`, `client\dist`, `database` into `C:\hms`.
3. **Install on host:** Node.js 18+, PostgreSQL 16+, create `sretan_emr` DB, set `PG_*` env vars.
4. **First boot:** `node dist\server.js` auto-migrates and seeds.
5. **Make it a service:** NSSM → `Hospital_EMR_Local_Core`, auto-start.
6. **Network:** firewall rule for port 3000 + static IP for the host + disable AP isolation.
7. **Everyone else:** just open `http://<host-ip>:3000` in a browser — no install.
8. **Cloud (optional):** SuperAdmin → Cloud & Sync → SaaS/Private → schema SQL → 15s sync daemon takes over.
9. **Updates:** push to git + release signal → hospitals pull automatically.
10. **Backup:** plug a flash in daily → scheduled daemon writes `.sbackup` → restore via SuperAdmin anytime.
