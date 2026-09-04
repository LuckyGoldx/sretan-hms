# Session 2026-09-01/02 — SuperAdmin Module & Platform-Wide Foundation

**Dates:** September 1–2, 2026
**Project:** Sretan HMS / Machoko EMR
**Repository:** https://github.com/LuckyGoldx/sretan-hms.git
**Scope:** Full SuperAdmin console, complete cross-tenant isolation, backup/restore, number patterns, cloud sync (Cloud SaaS + Private Cloud), remote code deployment, theming, module gating.

Planning document: `SUPERADMIN_MODULE_PLAN.md`

---

## 1. SuperAdmin Module (core)

- **Global authentication** — separate `super_admin_users` table (tenant-independent), seeded `lucky` / `lucky` (bcrypt). Distinct superadmin token + `superadminAuth` middleware on all `/api/superadmin/*` routes.
- **Console** at `/superadmin/*` with its own dark sidebar layout:
  - `/superadmin` Overview (platform stats, active hospital, last backup)
  - `/superadmin/hospitals` tenant list → `/superadmin/hospitals/:id` drill-down (Overview / Staff / Backup & Restore / Settings tabs)
  - `/superadmin/staff` cross-hospital staff management (incl. Admins)
  - `/superadmin/setup` comprehensive hospital wizard (details, logo, branding, modules, deployment, subscription, default Admin, auto-seed 12 departments)
  - `/superadmin/backup` full-system backup & restore + schema export
  - `/superadmin/cloud` Deployment / Software Update / Cloud Database Schema tabs
  - `/superadmin/audit` audit log viewer
  - `/superadmin/health` DB/table/migration/backup health
- **Login flow** — works from both `/login` (clinical → insurance → superadmin fallback) and `/superadmin/login`; SuperAdmin redirects to `/superadmin`; "Enter Hospital" activates a tenant and opens the clinical app as Admin; admins get a "Super Admin Console" return link.
- **Delete protection** — 3-step delete (warning → type hospital name → master code), master code default `5788`, changeable in Settings, verified server-side.

## 2. Complete Cross-Tenant Isolation

Every data table is now tenant-scoped (59 tables + 4 system tables by design):

- **Migration 060** — added `tenant_id` (NOT NULL, backfilled) to `payments`, `payment_items`, `insurance_invoice_items`, `record_requests`, `clinical_note_views`.
- **Migration 061** — added `tenant_id` to `patient_documents`, `treatment_doses`, `test_inventory_map`, `lab_test_catalog`, `custom_document_types`, `custom_insurance_types`, `insurance_excluded_services`, `insurance_provider_co_pay_config`.
- **Route fixes** — all queries/inserts for these tables now scope by the active tenant: payments (payments/revenue/pending/all-pending-items), records (documents + custom types), nurseModule (treatment doses), lab (catalog/panels/inventory map), insuranceProviders (GET/PUT/DELETE were leaking), insuranceInvoices (invoice item inserts), insuranceCases (co-pay payment inserts).
- Verified live: switching to an empty hospital returns `[]`; switching back returns only that hospital's data.

## 3. Backup & Restore

- **Full-system backup** (`/api/superadmin/backup`) — `pg_dump` custom format + `clinic_profile.json` + assets + uploads + manifest, bundled as a `.sbackup` zip in `C:/hms/backups/`. List/download/delete + restore (server-side or uploaded file) via `pg_restore --clean --if-exists` + `ensureSchema()`.
- **Per-hospital backup** (`/api/superadmin/tenants/:id/backup|backups|restore`) — exports only the selected tenant's rows from every table with a `tenant_id` column (`.tbk`), auto-adapts to future tables; restore deletes only that tenant's rows (FK enforcement suspended via `session_replication_role`) and re-inserts in FK-safe order; JSONB re-serialized on insert. Other hospitals untouched. Verified round-trip (server-side + upload).
- **Tenant B&R page** has sub-tabs: *Backups & Restore* and *Cloud Schema* (per-tenant labeling).

## 4. Numbering & Patterns

- **Migration 062** — per-tenant pattern columns: hospital, lab, ANC, radiology, receipt, referral, case, auth.
- **Pattern engine** (`server/src/utils/numbering.ts`) — tokens `{prefix} {provider} {year} {yy} {month} {month_name} {day} {seq:5}`; regex-based next-sequence discovery.
- Wired into all generators: patient registration, lab orders, ANC booking, radiology imaging, payment receipts (now sequential), referrals, insurance cases + auth requests.
- Settings tab "Numbering & Patterns" — presets per type, custom pattern input, live preview, reset. Verified: `SRT-2026-00018`, custom `HSP-SRT-26-001`, `LAB-2026-0019`, `RCP-260901-6361`.

## 5. Cloud Sync & Deployment

- **Deployment modes** (mutually exclusive per hospital): Offline Standalone / Cloud SaaS (global creds) / Private Cloud (own Supabase). Selecting a mode auto-derives `cloud_sync_enabled`.
- **Offline-first sync daemon** enabled (was disabled): runs every 15 s, only syncs when `cloud_sync_enabled` is true and valid credentials exist.
- **Cloud SaaS configured globally** on SuperAdmin → Cloud & Sync (stored in `superadmin_settings`); sync resolver (`resolveCloudCredentials`) uses global creds for Cloud SaaS, per-hospital creds for Private Cloud.
- **Migration 063** — made every tenant-scoped table syncable (`is_synced`, `last_synced_at`, `updated_at` + trigger).
- **Sync rewritten** — dynamic table discovery (any table with `tenant_id + is_synced + updated_at`), now tenant-filtered (fixed cross-tenant cloud leak), ordering by `id`.
- **Migration 064** — subscription tier/status moved onto the syncable `tenant_configurations` so they propagate down (remote control of an offline hospital's subscription/modules via the 15 s sync cycle); `migrationListener` now applies the full remote config locally.
- **Schema export** — `GET /api/superadmin/schema-export` (download) and `?inline=1` (JSON), always regenerated from live migration files (65 files, ~110 KB). Embedded in Cloud page, Backup page, tenant B&R tab, and per-tenant Private Cloud setup card.
- **Schema change detection** — `schemaVersion.ts`: on boot, if new migrations exist, resets `is_synced` on all tables (full re-push of old + new data); `schema-status`/`schema-ack` endpoints + `SchemaUpdateBanner` prompt to re-run SQL in Supabase after any schema change.

## 6. Remote Code Deployment (event-driven, no hospital-by-hospital visits)

- **`git-update` endpoint** — `git pull --ff-only` from the configured remote (branch/remote resolved automatically).
- **Auto-update daemon** (`updateDaemon.ts`) — background loop: always runs a cheap `git ls-remote` SHA comparison and caches the result; only pulls when the SHA actually changed; reacts to a cloud **release signal** (`software_version` in `superadmin_settings`) within ~15 s via the sync cycle.
- **Cached status** — the status endpoint reads an in-memory cache (single ~500-byte object) so browser polling spawns no subprocesses; client polls every 30 s and pauses when the tab is hidden.
- **Software Update tab** — auto-update toggle + interval, "Publish Update" (writes the release signal to the cloud), "Pull Latest Code", "Check Now", live status panel (last commit, branch/remote, update available, cloud signal).
- Verified: settings round-trip, git resolution (`master`/`origin`), cached vs live check.

## 7. Themes, Branding & Module Gating

- **10 themes** (index.css): Trust Blue, Emerald Green, Charcoal Clinical, Royal Purple, Ocean Teal, Crimson Red, Sunset Amber, Forest Green, Slate Modern, Blush Rose — each a full palette (`--primary/-dark/-soft`, `--secondary`).
- **Fixed theme bug** — theme class now always wins; stored brand color only overrides when it's not a standard theme color (custom override). Theme selection syncs brand colors; Settings has a live theme preview + quick-pick chips (flex-wrap so they stay inside the card on mobile/tablet).
- **17 module toggles** — Records, Triage, Doctor, Nurses, Consultants, Consultation, Laboratory, Pharmacy, Radiology, Finance/HMO, Maternity, Insurance, Referrals, Appointments, Admissions, Paypoint, Store/Walk-in. Sidebar gating hides disabled modules for the active hospital.
- **Branding in the app** — hospital name/address/phone/logo from `/api/setup/status` used in the sidebar header, login screen, and receipt/report print headers (`clinicInfo` util + dynamic `print.ts`); `/assets` static mount serves the uploaded logo.

## 8. UI/UX Fixes

- Password show/hide (eye) toggles: staff modals (both staff pages), master-code fields, setup admin password.
- Deployment cards with icons (Offline `WifiOff`, Cloud SaaS `Cloud`, Private Cloud `Server`).
- Subscription tier/status + deployment descriptions under selectors.
- Tenant drill-down tabs; Cloud page tabs (Deployment / Software Update / Cloud Database Schema + Setup Guide).
- Bug fixes along the way: Express 5 param types, unscoped `router.use(superadminAuth)` 401-blocking static routes, `payments` INSERT column/placeholder mismatch, node-postgres JSONB array serialization, migration `CREATE TRIGGER IF NOT EXISTS`, `ON CONFLICT DO NOTHING` without unique constraint.

## 9. Files Created / Changed (this session)

**Server:**
- `server/src/routes/superadmin.ts` (new — all superadmin APIs)
- `server/src/middleware/superadminAuth.ts` (new)
- `server/src/utils/numbering.ts`, `schemaVersion.ts`, `updateDaemon.ts` (new)
- `server/src/sync/cloudCredentials.ts`, `upwardSync.ts`, `downwardSync.ts`, `migrationListener.ts`, `syncDaemon.ts` (new/rewritten)
- `server/src/config/reader.ts`, `server.ts`, and many routes (payments, records, lab, maternity, radiologyOrders, consultants, insuranceCases/Invoices/Providers, nurseModule, patients, setup)

**Client:**
- `SuperAdminLogin/Layout/Overview/Tenants/TenantDetail/Staff/Setup/Backup/Cloud/Audit/Health.tsx` (new)
- `SchemaSqlViewer.tsx`, `SchemaUpdateBanner.tsx`, `superadminApi.ts`, `utils/themes.ts`, `utils/clinicInfo.ts` (new)
- `App.tsx`, `Login.tsx`, `SetupConsole.tsx`, `useClinicConfig.ts`, `useTheme.ts`, `print.ts`, `index.css` (modified)
- `SuperAdminPortal.tsx` (removed — superseded)

**Database migrations (this session):**
- `059_super_admin_users.sql`
- `060_tenant_isolation_modules.sql`
- `061_tenant_isolation_remaining.sql`
- `062_number_patterns.sql`
- `063_sync_columns.sql`
- `064_tenant_subscription_config.sql`

**Docs:**
- `SUPERADMIN_MODULE_PLAN.md` (plan)
- This file

## 10. Verification

- Server + client `tsc --noEmit` clean; `npm run build` passes.
- Runtime-verified: superadmin + clinical logins, tenant create/activate/switch/delete (with master code), per-tenant + full-system backup/restore round-trips (server-side and upload), tenant isolation across all endpoints, number generation (default + custom patterns), deployment → cloud-sync derivation, schema export/status/ack, new-table detection (test migration), update daemon + cached status, Cloud SaaS global creds resolver.
- Committed and pushed to `github.com/LuckyGoldx/sretan-hms` (`afbc7ab`, 65 files, +7,886/−971). Subsequent session changes are uncommitted.

## 11. Known Notes / Next Steps

- Auto-update daemon is **disabled by default** on machines; enable per hospital machine.
- Cloud SaaS / Private Cloud sync requires real Supabase credentials + schema run (schema SQL provided live).
- Scheduled/automatic full backups not yet implemented (manual only).
