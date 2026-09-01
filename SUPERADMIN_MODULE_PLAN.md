# SuperAdmin Module Plan

**Date:** September 1, 2026
**Project:** Sretan EMR (Machoko HMS)
**Status:** Approved — ready to implement

---

## Overview

Add a true `SuperAdmin` module: a global (tenant-independent) superadmin account with
all Admin privileges **plus** cross-hospital management, comprehensive setup, staff
management (including Admins), full database backup/restore, audit viewing, and system
health. Backups use `pg_dump`/`pg_restore` so **future tables are included automatically**.

---

## 1. Authentication (separate global table)

- **Migration `059_super_admin_users.sql`**
  - New global table `super_admin_users` — independent of any tenant:
    `id`, `username`, `email`, `name`, `password` (bcrypt), `status`, `created_at`,
    `updated_at`, `last_login_at`.
  - Seeds `lucky` / password `lucky` via an idempotent DO-block using a precomputed
    bcrypt literal (pattern: `049_seed_consultant.sql`).
- **Login endpoint** `POST /api/superadmin/login` — bcrypt check against
  `super_admin_users`; returns a **distinct superadmin token** (own constant, e.g.
  `sretan-emr-superadmin-token-2026`) so ordinary Admin sessions cannot call
  superadmin routes.
- **Middleware** `server/src/middleware/superadminAuth.ts` — enforces the superadmin
  token on all `/api/superadmin/*` routes.
- **Client** — new `SuperAdminLogin.tsx` at `/superadmin/login`; stores `sretan_user`
  with `role: 'SuperAdmin'`. Dedicated routing + layout under `/superadmin/*`
  (self-contained, separate from the clinical sidebar).

## 2. Tenant viewing & hospital switching

- **View all tenants**: after login, the Overview and Hospitals tabs list every tenant
  from the `tenants` table (no mocks). Superadmin can create, edit, configure, and
  delete tenants.
- **Enter Hospital (tenant switcher)**: selecting a hospital writes that tenant's ID
  into `GLOBAL_SAAS_TENANT_ID` in `C:/hms/config/clinic_profile.json` (plus the
  hospital's branding/config fields), then opens the clinical app as Admin for that
  hospital. Consistent with the current single-active-tenant runtime (all clinical
  routes read `GLOBAL_SAAS_TENANT_ID`).
- Superadmin can switch back to the SuperAdmin console at any time.

## 3. SuperAdmin API (`server/src/routes/superadmin.ts`)

- `GET  /api/superadmin/overview` — tenants, staff, patient counts, last backup, DB status.
- `GET/POST/PUT/DELETE /api/superadmin/tenants` — full tenant + tenant_configurations CRUD.
- `GET/POST/PUT/DELETE /api/superadmin/staff` — cross-hospital staff management
  **including creating/editing/deleting Admins** (extends `staff.ts` logic to any tenant).
- `GET /api/superadmin/audit-logs` — read `audit_logs` with filters (action, table, user, date).
- `GET /api/superadmin/health` — DB latency, table inventory + row counts, migrations
  applied vs available, backup storage usage.

## 4. Backup & Restore (pg_dump / pg_restore)

- **Create backup** `POST /api/superadmin/backup`
  - Spawn `pg_dump --format=custom` — full database snapshot; **auto-includes every
    current and future table**.
  - Bundle with `clinic_profile.json`, `C:/hms/assets`, server `uploads/`, and a
    `manifest.json` (schema version, table list, migration files, timestamp, size)
    into a `.sbackup` archive stored in `C:/hms/backups/`.
- **Manage backups**
  - `GET  /api/superadmin/backups` — list bundles (date, size, table count, version).
  - `GET  /api/superadmin/backups/:file/download` — download to browser.
  - `DELETE /api/superadmin/backups/:file` — remove a bundle.
- **Restore** `POST /api/superadmin/restore`
  - Accepts an uploaded `.sbackup` or a server-side bundle name.
  - Validates manifest → drops & recreates DB (`pg_restore --clean --if-exists`) →
    restores config + assets → re-runs `ensureSchema()`.
- **Tool discovery**: pg_dump/pg_restore resolved from `PG*` env vars (same as
  `pool.ts`) with PATH + common Windows install-dir fallbacks.

## 5. Client module (`/superadmin/*`)

| Route | Component | Purpose |
|---|---|---|
| `/superadmin/login` | `SuperAdminLogin.tsx` | Superadmin sign-in |
| `/superadmin` | `SuperAdminOverview.tsx` | Stats, tenant list, last backup, quick actions |
| `/superadmin/hospitals` | `SuperAdminTenants.tsx` | Tenant list (cards → drill into each hospital) |
| `/superadmin/hospitals/:id` | `SuperAdminTenantDetail.tsx` | Hospital drill-down: Overview (modules/config), Staff (incl. Admin accounts), Backup & Restore, Settings |
| `/superadmin/staff` | `SuperAdminStaff.tsx` | Cross-hospital staff incl. Admin accounts |
| `/superadmin/setup` | `SuperAdminSetup.tsx` | Comprehensive hospital setup wizard |
| `/superadmin/backup` | `SuperAdminBackup.tsx` | Full-system backup create/list/download/delete/restore |
| `/superadmin/audit` | `SuperAdminAudit.tsx` | Audit log viewer |
| `/superadmin/health` | `SuperAdminHealth.tsx` | DB health, tables, migrations, storage |

- `SuperAdminLayout.tsx` — own sidebar (Overview, Hospitals, Staff, Setup, Backup &
  Restore, Audit Logs, System Health).

### Tenant drill-down (the superadmin concept)
- Choose a hospital from `/superadmin/hospitals` → open `/superadmin/hospitals/:id`.
- **Overview**: enabled modules, deployment/branding, subscription, counts, active flag.
- **Staff**: that hospital's staff only, Admin accounts highlighted, add/edit/delete.
- **Settings**: per-hospital config editor (details, deployment, branding, modules).
- **Backup & Restore**: hospital-level backup/restore (see below).
- **Enter Hospital**: activates the tenant (writes `GLOBAL_SAAS_TENANT_ID`) and opens
  the clinical app as Admin; switching to another hospital works the same way.

### Per-hospital (tenant-level) Backup & Restore
- `POST /api/superadmin/tenants/:id/backup` — exports every table with a `tenant_id`
  column (auto-adapts to future tables) for that hospital only → `.tbk` bundle.
- `GET /api/superadmin/tenants/:id/backups` / download / delete — manage `.tbk` files.
- `POST /api/superadmin/tenants/:id/restore` — deletes only that tenant's rows (FK
  enforcement suspended via `session_replication_role` since child tables may not
  carry `tenant_id`) then re-inserts the backup rows in FK-safe order. Other hospitals
  are untouched. JSONB values are re-serialized on insert.
- Restore is transactional: any failure rolls back completely.

### Comprehensive Setup wizard (`SuperAdminSetup.tsx`)
- Create a hospital end-to-end:
  - Hospital details (name, address, phone, currency, hospital-number prefix / include-year)
  - Logo upload
  - Branding (primary/secondary colors, theme class)
  - Module toggles (Records, Triage, Consultation, Laboratory, Pharmacy, Radiology, Finance/HMO)
  - Deployment mode (OFFLINE_STANDALONE / CLOUD_SAAS / PRIVATE_SUPABASE + Supabase creds)
  - Subscription status/tier
  - Default departments (reuse the `045` seed list)
  - Default Admin user for the tenant (name, username, email, password)
  - "Set as active tenant" option
- Editable for the active hospital as well.
- Existing `/setup` (SetupConsole) remains for the first-boot standalone flow.

## 6. Files touched

- `database/059_super_admin_users.sql`
- `server/src/routes/superadmin.ts`
- `server/src/middleware/superadminAuth.ts`
- `server/src/server.ts` (mount superadmin router)
- `client/src/App.tsx` (add `/superadmin/*` routes; clinical sidebar stays Admin-gated)
- New client components under `client/src/components/`
- Existing `staff.ts` / `tenants.ts` / `setup.ts` stay unchanged — superadmin routes
  extend, not replace.

## 7. Implementation notes / open items

- Precompute bcrypt hash for `lucky` at implementation time and embed as a literal.
- Decide `.sbackup` packaging approach (zip library vs manual archive).
- Ensure `Admin` cannot access `/superadmin/*` — only `SuperAdmin` role + superadmin token.
- Every superadmin destructive action (tenant delete, restore, staff changes) writes an
  `audit_logs` entry with the superadmin user ID.

## 9. Cross-tenant isolation & hospital identity (added)

- **Tenant isolation (migration 060)**: `payments`, `payment_items`,
  `insurance_invoice_items`, `record_requests`, `clinical_note_views` gained a NOT NULL
  `tenant_id` (backfilled) so switching hospitals never shows another hospital's data.
  All payment/revenue/pending endpoints now filter by the active tenant.
- **Master code**: `superadmin_settings.master_code` (default `5788`), changeable via
  the Settings tab. Deleting a hospital requires the master code after a 3-step
  confirmation (warning → type hospital name → enter code).
- **Expanded modules**: per-tenant module flags now include Maternity, Insurance,
  Referrals, Appointments, Admissions, Paypoint, Store in addition to the original 7.
  The clinical sidebar hides any module that is disabled for the active hospital.
- **Hospital identity in the app**: editing the active hospital's name/address/phone
  now updates the live profile; receipts, invoices and report headers print the
  hospital name, address and phone; the sidebar header and login screen show the
  active hospital's name and logo.
- **Logo**: uploaded via the Settings tab, served from `/assets/logo.png`.
- **Theme preview** in Settings shows a live mock-up of the selected brand color/theme.

## 8. Out of scope (not in this module)

- Changing the existing clinical auth/middleware model (still hardcoded master token).
- Runtime multi-tenant isolation in clinical routes (still single-active-tenant via
  `GLOBAL_SAAS_TENANT_ID`).
- Scheduled/automatic backups (manual + on-demand only unless requested later).
