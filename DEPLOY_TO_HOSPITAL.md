# Deploying Sretan EMR to a Hospital — End-to-End Runbook

Everything you need to take the system to one hospital that is wired on a LAN/router, run the whole
clinic from **one server machine**, and then push **code and database changes to that hospital
remotely over the internet** — to all hospitals or to **one hospital (tenant) only** — and watch it
happen from your office.

> Read this whole file once before you start. Every command is exact. "You" = the developer/operator.
> One hospital = **one tenant** = **one host machine** (its own copy of the app + its own PostgreSQL).

---

## 0. The finished picture

```
                     YOUR OFFICE (internet)
   ┌────────────────────────────────────────────────┐
   │  Hub console: the same app, logged in as        │
   │  SuperAdmin, pointed at the SHARED Supabase      │
   │  project (Cloud SaaS).                          │
   │   • Fleet Monitor  → every hospital's commit    │
   │   • Publish Update → ALL hospitals              │
   │   • Roll out (per row) → ONE hospital           │
   └──────────────────┬─────────────────────────────┘
                      │ internet (Supabase + GitHub)
   ┌──────────────────▼─────────────────────────────┐
   │  HOSPITAL HOST  (one per hospital, C:\hms)      │
   │  Node 18 + PostgreSQL 16 + git clone + app      │
   │  • update daemon pulls from your GitHub         │
   │  • sync daemon ↔ shared Supabase (15s)          │
   │  • scheduled task rebuilds + restarts service   │
   └──────────────────┬─────────────────────────────┘
                      │ LAN / hospital WiFi  (http://HOST-IP:3000)
        ┌─────────────┼──────────────┬───────────────┐
   Records desk   Doctor office   Pharmacy desk   Maternity
   (browser)      (browser)       (browser)       (browser)
```

- All clinic PCs just open `http://<host-ip>:3000` in a browser. No installation on them.
- The clinic runs **100% offline**; internet is only used by the HOST for git updates + cloud sync.

---

## 1. Important realities (read first — these shape every step)

1. **The hospital runs compiled code.** The service runs `C:\hms\server\dist\server.js` and the web
   app is served from `C:\hms\client\dist`. `git pull` only changes *source*. A rebuild of both
   folders + a service restart is what actually activates new code and runs new database migrations.
2. **Because of (1), remote deployment is two beats:**
   - **Beat 1 — pull:** the host pulls the new code within seconds (release signal) or minutes (SHA check).
   - **Beat 2 — apply:** a scheduled task rebuilds + restarts, normally within 10–15 minutes of your push.
   Plan deployments for quiet hours or accept the ≤15-min latency. Nothing ever interrupts a live clinic
   mid-shift (auto-restart only happens on that task's schedule).
3. **Database changes are also code.** A new migration file ships with the code. When the hospital
   restarts, migrations run **automatically on its local PostgreSQL**. Then the hospital starts pushing
   data up — but the **cloud copy of the schema must be updated by you first** (see Section 8), otherwise
   cloud sync waits (rows queue safely; the clinic is never affected).
4. **Remote updates need internet on the hospital host.** If the hospital has no internet at all, there
   is no remote path — you must carry a USB stick (clone/zip) to the site. Everything else still works.
5. **Each hospital host is bound to one tenant** (the "active hospital" in its console). Targeted
   releases reach the host whose active tenant you target. Put one hospital per host machine.
6. **Auto-update must be ON** on the hospital host for releases to self-apply. If it is OFF, the host
   only updates when someone clicks **Pull Latest Code** on that machine (or when you remote into it).

---

## 2. One-time preparation at your office

### 2.1 The repository

- Private GitHub repo (you have: `github.com/LuckyGoldx/sretan-hms`), default branch `master`.
- **Never force-push** that branch. Hospitals pull `--ff-only`; a rewritten history would require a
  site visit on every machine.
- Create a **read-only fine-grained PAT** for hospital machines: GitHub → Settings → Developer settings →
  Fine-grained tokens → *Contents: Read* on that one repository. It starts with `github_pat_`. Do this
  once; the same read-only token can be stored on every hospital host (or create one per hospital).

### 2.2 The shared Supabase project (Cloud SaaS hub)

The hub (fleet view, release signals, remote config) needs ONE Supabase project that every
Cloud SaaS hospital syncs to.

1. Create a project at supabase.com (free tier is enough to test).
2. Get the schema SQL: from any running copy, call
   `GET http://localhost:3000/api/superadmin/schema-export?inline=1` (or SuperAdmin → Cloud & Sync →
   Cloud Database Schema → Copy SQL). Paste into Supabase **SQL Editor** and **Run**.
3. Copy the project **URL** and **anon key** (Settings → API). You will paste the same URL+key:
   - into the HUB console's Cloud & Sync page (once), and
   - into EVERY Cloud SaaS hospital console's Cloud & Sync page (the hospital resolver reads it from
     its own local settings).

> Re-run the schema SQL in Supabase every time you add a migration file (Section 8).

### 2.3 Build the deploy bundle (after every release)

The `dist/` folders are git-ignored, so you ship them separately. On your build machine:

```powershell
# 1. Server (TypeScript → server/dist)
cd C:\Users\LuckyGold\Desktop\Sretan EMR\server
npm install
npm run build

# 2. Client (React → client/dist)
cd C:\Users\LuckyGold\Desktop\Sretan EMR\client
npm install
npm run build
```

Copy these folders into your release zip/flash:
- `server\dist\` (compiled backend)
- `client\dist\` (compiled web app)
- `scripts\hospital_git_setup.ps1`
- `scripts\apply_update.ps1`

The repo itself (sources + `database\*.sql` + `.git`) is cloned separately on the host (Section 4).

---

## 3. Prepare the hub console (your office machine)

You run this on your own office PC/laptop (it can double as your dev machine or a tiny always-on box).

1. Install Node 18+ and PostgreSQL 16+ on it (the hub keeps a local DB too).
2. Create its database: `createdb -U postgres sretan_emr`
3. Clone your repo to `C:\hms` (Section 4, step A) and overlay `server\dist` + `client\dist`; then
   `npm install` in `server` and `client`; run the app (Section 4, steps D–F) — or run it on demand:
   `cd C:\hms\server; node dist\server.js`, open `http://localhost:3000/superadmin/login`.
4. Log in (`lucky` / `lucky` — **change it now** in SuperAdmin settings/DB).
5. SuperAdmin → Cloud & Sync → **Deployment** tab: paste the **Supabase URL + anon key** from 2.2.
6. Confirm your active hospital (Overview shows it). If the hub's own tenant isn't a real hospital,
   create one or leave it — the **Fleet Monitor** reads the shared cloud project regardless of local
   tenants once hospitals start phoning home.

Your office console is now the **control panel** for the whole platform.

---

## 4. Hospital site — first installation (do once per hospital)

### A. Lay down the code (internet needed once)

```powershell
# As Administrator on the hospital server machine
New-Item -ItemType Directory -Path C:\hms
git clone https://github.com/LuckyGoldx/sretan-hms.git C:\hms
cd C:\hms
git checkout master
```

Then overlay the compiled output from your release zip so these exist:
- `C:\hms\server\dist\server.js`
- `C:\hms\client\dist\index.html`

### B. Install prerequisites on the host

- Node.js 18+ LTS from nodejs.org (defaults are fine).
- PostgreSQL 16+ (EDB installer). **Note the `postgres` password**.
- Git for Windows (git-scm.com).
- NSSM (nssm.cc) — copy `nssm.exe` to `C:\nssm\`.

Install dependencies **including devDependencies** (needed later to rebuild on the host):

```powershell
cd C:\hms\server; npm install
cd C:\hms\client; npm install
```

### C. Create the database and set environment variables

```powershell
& "C:\Program Files\PostgreSQL\18\bin\createdb.exe" -U postgres sretan_emr
```

Set machine-level environment variables (replace with your real postgres password):

```powershell
[Environment]::SetEnvironmentVariable("PG_PASSWORD", "YOUR_POSTGRES_PASSWORD", "Machine")
[Environment]::SetEnvironmentVariable("PORT", "3000", "Machine")
```

The schema auto-creates on first boot.

### D. First manual boot and verification

```powershell
cd C:\hms\server
node dist\server.js
```

Expected: migrations run (`Running migration: 001_...` … `064_...`, `065_...`), then
`MACHOKO HMS Server running on port 3000`.

```powershell
Invoke-RestMethod -Uri "http://localhost:3000/api/health"          # {status:"ok",...}
Invoke-WebRequest -Uri "http://localhost:3000" -UseBasicParsing    # HTTP 200 = web app served
```

> If `/` returns 404, the `server\dist` overlay is missing or stale — rebuild and copy it again.
> If it returns the login page you are good. Stop the server with `Ctrl+C`.

### E. Run it as an always-on Windows service

```powershell
C:\nssm\nssm.exe install Hospital_EMR_Local_Core "C:\Program Files\nodejs\node.exe" "C:\hms\server\dist\server.js"
C:\nssm\nssm.exe set Hospital_EMR_Local_Core AppDirectory "C:\hms\server"
C:\nssm\nssm.exe set Hospital_EMR_Local_Core Start SERVICE_AUTO_START
C:\nssm\nssm.exe set Hospital_EMR_Local_Core AppStdout "C:\hms\logs\server_runtime.log"
C:\nssm\nssm.exe set Hospital_EMR_Local_Core AppStderr "C:\hms\logs\server_runtime.log"
C:\nssm\nssm.exe set Hospital_EMR_Local_Core AppRestartDelay 10000
net start Hospital_EMR_Local_Core
```

### F. Networking (LAN + wireless)

```powershell
# Open the port on the private network profile
netsh advfirewall firewall add rule name="Sretan EMR API" dir=in action=allow protocol=TCP localport=3000 profile=private
```

- Give the host a **fixed IP** (router DHCP reservation or static IP).
- On the router: **disable AP isolation / guest network** so WiFi PCs can reach the host.
- Wire the host to the router if possible.

### G. Configure the read-only git credential (security)

```powershell
powershell -ExecutionPolicy Bypass -File C:\hms\scripts\hospital_git_setup.ps1 `
  -Repo "LuckyGoldx/sretan-hms" -Branch "master" -Token "github_pat_..."
```

Run it as the account the service runs under. It stores the token in the Windows credential store,
disables push, and verifies with `git ls-remote`. The console (SuperAdmin → Cloud & Sync →
Software Update → **Git Repository & Security**) shows the plain URL + **Verify Remote Access**.

### H. Configure this hospital in the console (tenant)

1. Open `http://localhost:3000/superadmin/login` on the host. Log in as SuperAdmin.
2. **Hospitals** → create/select this hospital's tenant. (One hospital = one tenant.)
3. On the **Overview / Hospitals**, use **Enter Hospital** so the active hospital = this tenant
   (this writes `GLOBAL_SAAS_TENANT_ID` into the local clinic profile — the machine now reports and
   receives releases for THIS tenant).
4. **Cloud & Sync → Deployment** tab:
   - Paste the shared **Supabase URL + anon key** (2.2) into *Cloud SaaS — Global Provider Credentials*.
   - Set this hospital's deployment mode to **Cloud SaaS** (its own Settings/tenant configuration).
5. **Software Update** tab:
   - Confirm repository URL + branch (`master`).
   - Turn **Auto-update this machine ON** (interval e.g. 5 minutes).
   - Click **Check Now** → status shows branch/remote and "Up to date".
6. Verify the 15s sync is running (server log lines `Sync cycle starting…`).

### I. Schedule the automatic apply task (pull → rebuild → restart)

This is what turns your git pushes into running code. Run as Administrator on the host:

```powershell
schtasks /create /tn "EMR Apply Updates" /sc minute /mo 10 /ru SYSTEM /f `
  /tr "powershell -ExecutionPolicy Bypass -File C:\hms\scripts\apply_update.ps1"
```

Test it once manually:
```powershell
powershell -ExecutionPolicy Bypass -File C:\hms\scripts\apply_update.ps1
```
(Exits in <1s when there is nothing pending. After a real pull it rebuilds `server\dist` +
`client\dist` and restarts the service.)

### J. Connect every clinic desktop

On each PC (records, doctors, pharmacy, lab, paypoint, maternity…): open the browser and go to
`http://<host-ip>:3000`. Bookmark it. No software install, no configuration.

### K. First real rollout to this hospital (close the loop)

Back at your office console: push a trivial commit (or any change), wait ≤15 s, then watch
**Fleet Monitor** (or this host's Software Update status): commit changes to the new SHA, then
"Up to date", then within ~10 min the apply task rebuilds/restarts. Confirm the app still loads
at `http://<host-ip>:3000`. Done — the hospital is now remote-manageable.

---

## 5. Daily data safety at the hospital (flash backup)

Automatic scheduled backup to USB is **not yet built**. Today, do it manually (30 seconds/day):

1. SuperAdmin → **Backup & Restore → Create Full Backup** on the host.
2. Download the `.sbackup` file from **C:\hms\backups** onto a flash drive.
3. Keep the flash safe (rotate two drives; keep one offsite).
4. To restore a hospital onto a fresh machine: install per Section 4, then Backup & Restore →
   **Restore** and point at the `.sbackup`.

(Planned: a daemon that auto-writes `.sbackup` to a detected USB drive each night — same pattern as
`updateDaemon.ts`.)

---

## 6. Remote update runbook — the three ways

> All three require: hospital host online, auto-update ON, and internet reachable.

### Option A — Push only (no signal)
```powershell
git add -A; git commit -m "description"; git push origin master
```
Hospital pulls at its next SHA check (≤ the interval you set). Applied by the task within ~10 min.

### Option B — Push + global release (all hospitals, seconds)
1. `git push origin master`
2. Hub console → **Cloud & Sync → Software Update → Publish Update**
3. Every online hospital pulls within ~15 s (release signal rides the sync cycle); the apply task
   rebuilds + restarts within its cadence.

### Option C — One hospital only (targeted)
1. `git push origin master`
2. Hub console → **Fleet Monitor** → find that hospital → **Roll out** (next to its row).
3. ONLY that hospital's host pulls; every other hospital ignores it. Confirmed in Fleet Monitor when
   its commit changes and it shows **Up to date** (and **Targeted release: Applied** on that host's
   Software Update status).

> Targeted releases use a per-tenant release map (`tenant_software_releases`) in the shared cloud
> project; each host only reacts to its own tenant's entry, and applies it whenever it is next online
> if it missed it.

### Confirm rollout
Hub console → **Fleet Monitor**:
- The hospital's **Applied commit** shows your new SHA.
- Status badge **Up to date**, last pull **OK**.
- Any **Pull failed** → expand the row for the exact error (usually offline at pull time — it
  self-heals on the next cycle, or the machine's credential/URL is wrong → re-run Section G).

---

## 7. After a code-only update — what to check

1. Server restarted cleanly: `Get-Service Hospital_EMR_Local_Core` = Running; log tail of
   `C:\hms\logs\server_runtime.log` shows boot + migrations.
2. Web app loads and staff log in (browser auto-reloads after a rebuild; press Ctrl+F5 if a stale tab
   is cached).
3. If this release had **new migration files**, continue to Section 8.

---

## 8. After a database (schema) change — the exact sequence

A schema change = a new file like `database\066_xxx.sql` (increment the number; keep it additive and
idempotent like the existing ones).

1. **On your build machine:** add the file, `npm run build` for server + client, rebuild the bundle.
2. **Push + release** (Option A/B/C above). The hospital pulls, the apply task rebuilds + restarts,
   and on boot **its local database migrates automatically** (the migration runner is idempotent).
3. The hospital then detects the new schema and resets `is_synced` on every table, so its data starts
   re-pushing to the cloud — but the **cloud copy must match first**. Until you do step 4, cloud sync
   for that hospital simply waits (its rows stay queued locally; the clinic is unaffected).
4. **You update the cloud schema:** open the shared Supabase project → SQL Editor → paste the current
   schema SQL (SuperAdmin → Cloud & Sync → Cloud Database Schema → **Copy SQL** — this regenerates from
   the live migration files of the updated build) → **Run**. You can also get it per machine from
   `http://<host>:3000/api/superadmin/schema-export?inline=1`.
5. Watch **Fleet Monitor** / the hospital's sync log — upward sync resumes and marks rows synced.

**Ordering rules (no mistakes):**
- Never publish a migration that **breaks older hospital code** — ship code + migration together, and
  remember hospitals that were offline pull later, so keep every migration backward-tolerant.
- Cloud schema re-run is a **you** step (Supabase). Hospitals can never do it for you.
- Migrations that only touch the local database (no new cloud-facing columns) still appear in the
  schema export — re-running it in Supabase is harmless and required for the version counter to match.

---

## 9. If something goes wrong (rollback)

| Situation | Action |
|-----------|--------|
| A release breaks the clinic | Push a **revert commit** (`git revert <bad>`) + publish again. The hospital pulls and the apply task restores the previous code. |
| Need to stop auto-updates fast | Hub console can't toggle the host remotely yet (the toggle lives on the host). Use the host's Software Update tab (or remote desktop) to switch auto-update OFF and click **Pull Latest Code** to re-pin. |
| Service won't start after an update | On the host: `net stop Hospital_EMR_Local_Core`, inspect `C:\hms\logs\server_runtime.log`, `git -C C:\hms log --oneline -5`, `git -C C:\hms reset --hard <previous-sha>`, rebuild manually, `net start Hospital_EMR_Local_Core`. |
| Data disaster | Restore the flash `.sbackup` (Section 5). |
| Hospital never phones home in Fleet Monitor | Cloud SaaS creds missing on that host (Section H4), schema not re-run (Section 8.4), or the host predates the report daemon — update it once manually then it appears. |

---

## 10. What is currently missing / honest limitations

- **Automatic flash backup scheduler** — not implemented; manual daily download for now.
- **Remote toggle of a host's auto-update** — the switch is local to each host; there is no cloud flag
  to force-update a machine whose auto-update is OFF (that is a deliberate safety property).
- **Instant code activation** — activation needs a rebuild + restart, so there is a built-in latency
  (release pull in seconds + apply task in ≤10 min). If you need sub-minute activation, keep hospitals
  on small intervals and run the apply task every 2 minutes — still safe because it only restarts when
  a pull actually changed the code.
- **Multi-tenant on one host** — supported for data, but release signals and the update report follow
  the **active tenant** of that host. Keep one hospital per host machine for predictable remote updates.
- **Private Cloud hospitals** are still fully supported but use their own Supabase project per hospital:
  publish from a console whose active tenant is that hospital (the release map is written to that
  project), and Fleet Monitor on that console shows that hospital only. The shared **Fleet Monitor
  across all hospitals requires Cloud SaaS**.
- **Supabase RLS**: keep the cloud project's row-level security exactly as the sync layer already
  relies on it (the app syncs with the anon key). Do not tighten policies without re-testing sync —
  that would silently stop cloud sync and fleet reporting.
- **Internet dependency for remote updates**: covered in Section 1.4.

---

## 11. One-page checklist (hospital)

- [ ] `C:\hms` is a git clone on `master`; `server\dist` and `client\dist` overlayed; `npm install` done in both
- [ ] PostgreSQL `sretan_emr` created; `PG_PASSWORD`/`PORT` env vars set
- [ ] `node dist\server.js` boots (migrations log + "running on port 3000"); `/` returns the web app
- [ ] NSSM service `Hospital_EMR_Local_Core` = auto-start + running
- [ ] Firewall allows TCP 3000 (private); host has a fixed IP; AP isolation off
- [ ] `hospital_git_setup.ps1` run with read-only PAT; **Verify Remote Access** shows green, no embedded secret
- [ ] Hospital tenant exists + is **active** (Enter Hospital)
- [ ] Deployment mode = **Cloud SaaS**; shared Supabase URL + anon key saved in that host's Cloud & Sync
- [ ] Auto-update **ON** (interval 5 min); branch `master`
- [ ] Scheduled task **EMR Apply Updates** (every 10 min, SYSTEM); test run exits instantly
- [ ] All clinic desktops load `http://<host-ip>:3000`
- [ ] Flash backup taken today; `.sbackup` opened safely
- [ ] From the office: hospital visible in **Fleet Monitor**; push + targeted Roll out works; commit advances; badge "Up to date"
