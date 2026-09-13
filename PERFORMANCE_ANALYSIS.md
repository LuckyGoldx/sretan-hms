# Sretan HMS / EMR — Performance Analysis & Optimization Report

**Scope:** Full codebase review of `server/` (Express + PostgreSQL/pg), `client/` (React 18 + Vite + Tailwind), and `database/` (73 migration files).
**Goal:** Identify why the application "loads slowly sometimes" and give a prioritized, safe remediation plan.
**Method:** Static analysis of every route module, the DB pool/migration layer, middleware, and the client shell/routing/polling. No code was changed. All findings below are grounded in specific `file:line` references and can be verified with `EXPLAIN ANALYZE`.

---

## 1. Executive Summary

The slowness is **not caused by one thing**. It is the compounding effect of (a) a schema with almost no secondary indexes, (b) a handful of extremely expensive endpoints that run on a timer, (c) pervasive N+1 query loops, and (d) a client that polls those expensive endpoints aggressively.

The single most impactful fix is **adding the missing indexes** (Section 5). The second most impactful is **stopping the polling storm and the `all-pending-items` / `pending-summary` endpoints from running every 30 seconds for every logged-in user**.

### Ranked bottlenecks

| # | Issue | Where | Severity | Frequency |
|---|-------|-------|:--------:|-----------|
| 1 | Missing indexes on nearly all foreign-key / filter columns | `database/*` | **Critical** | Every query |
| 2 | `clockGuard` full-table scan on every write | `server/src/middleware/clockGuard.ts:16` | **Critical** | Every INSERT/UPDATE |
| 3 | Sidebar polls 9 endpoints, incl. two of the heaviest in the app, every 30s | `client/src/App.tsx:285-372` | **Critical** | Every 30s / user |
| 4 | `all-pending-items` and `pending-summary`: massive CTEs with per-row correlated subqueries + `ILIKE '%…%'` | `server/src/routes/payments.ts:473`, `:571` | **Critical** | 30s + on Paypoint open |
| 5 | N+1 price/cost lookups per cart line | `server/src/routes/payments.ts:196-253`, `:352-392` | **High** | Every payment |
| 6 | Unbounded list endpoints (no `LIMIT`) returning whole tables | `patients.ts`, `lab.ts`, `prescriptions.ts`, `appointments.ts`, `visits.ts` | **High** | Page loads |
| 7 | `readClinicProfile()` does a synchronous `fs.readFileSync` on every request | `server/src/config/reader.ts:40-47` | **High** | Every request |
| 8 | Bed-charge accrual N+1 loop, called on every pending endpoint and every 10s | `server/src/utils/admissionBilling.ts:97-135` | **High** | 10–30s |
| 9 | No HTTP compression and no long-lived cache headers for static assets | `server/src/server.ts:138` | **Medium** | Every page load |
| 10 | All 73 migrations re-run sequentially before `app.listen` on every boot | `server/src/db/migrate.ts:16`, `server.ts:159-176` | **Medium** | Every restart |
| 11 | `ILIKE '%term%'` everywhere with no `pg_trgm` GIN indexes | throughout | **Medium** | Search |
| 12 | Client: `setInterval(..., 1000)` re-parses localStorage and re-renders the sidebar every second | `client/src/App.tsx:276-283` | **Low–Medium** | Every second |
| 13 | 10s polling in ~15 components even when tab is hidden | various components | **Medium** | Every 10s |
| 14 | Very large monolithic components (PatientChart 4,708 lines) | `client/src/components/PatientChart.tsx` | **Low–Medium** | Interaction |

---

## 2. Architecture Snapshot (what actually runs per request)

1. Browser → Vite proxy (`client/vite.config.ts`) → Express on `:3000`.
2. Express mounts **33 routers globally with no path prefix** (`server/src/server.ts:59-92`); every request walks the full router chain until it matches.
3. Each handler calls `getTenantId()` → `readClinicProfile()` → **synchronous disk read + `JSON.parse`** (`server/src/config/reader.ts:40`).
4. Handlers issue **sequential** `await pool.query(...)` calls (no batching, rarely `Promise.all`, rarely transactions).
5. Write handlers additionally call `clockGuard()` which scans the entire target table.
6. `pg` pool: `max: 20`, `idleTimeoutMillis: 30000`, `connectionTimeoutMillis: 5000` (`server/src/db/pool.ts:7-16`). No `statement_timeout`, no query instrumentation.

Every one of these layers has a scaling problem.

---

## 3. Detailed Findings

### 3.1 Missing indexes — the dominant cost

PostgreSQL does **not** automatically index foreign keys. The schema defines 55 tables with FKs everywhere but only 49 indexes total, and almost none on the columns the application actually filters and joins on.

Verified absent (searched all `database/*.sql` for `CREATE INDEX ... ON <table>`):

- `encounters(patient_id)`, `encounters(tenant_id, patient_id)`, `encounters(staff_id)`, `encounters(created_at)`
- `vitals(encounter_id)`, `vitals(created_at)`, `vitals(recorded_by)`
- `prescriptions(encounter_id)`, `prescriptions(tenant_id, status)`, `prescriptions(is_paid)`
- `lab_orders(encounter_id)`, `lab_orders(tenant_id, status)`, `lab_orders(is_paid)`, `lab_orders(doctor_read_at)`
- `lab_results(lab_order_id)`, `lab_results(tenant_id, status)`
- `radiology_orders(encounter_id)`, `radiology_orders(tenant_id, status)`, `radiology_orders(is_paid)`
- `admissions(tenant_id, status)`, `admissions(patient_id, status)`, `admissions(is_paid)`
- `inventory_items(tenant_id, category, is_active)`, `inventory_items(drug_name)`
- `payments(patient_id, status)`, `payments(status, created_at)`
- `payment_items(payment_id)`, `payment_items(service_type, is_converted)`
- `appointments(doctor_id, appointment_date, status)`, `appointments(patient_id)`
- `patients(hospital_number)`, `patients(tenant_id, created_at)`, `patients(status)`
- `audit_logs(table_name, record_id)`, `audit_logs(tenant_id, created_at)`
- `test_inventory_map(test_name, inventory_item_id)`

**Consequence:** queries like the patient list, lab worklist, paypoint pending, and every `encounters`-join do sequential scans that grow linearly with data. This is exactly the "fast on day 1, slowly over months" pattern the user described. A 1,000-row `encounters` table is invisible; 100,000 rows makes the patient page multi-second.

**Fix:** see the ready-to-run migration in Section 5.

---

### 3.2 `clockGuard` scans an entire table on every write

```ts
// server/src/middleware/clockGuard.ts:16-26
export async function clockGuard(pool: Pool, tableName: string): Promise<void> {
  const result = await pool.query(
    `SELECT GREATEST(MAX(created_at), MAX(updated_at)) as max_ts FROM ${tableName}`
  );
  ...
}
```

There is no `WHERE`, no tenant filter, and `GREATEST(MAX(...), MAX(...))` cannot use an index unless a matching multi-column index exists. It is awaited on writes to `patients`, `encounters`, `encounter_notes`, `visits`, `prescriptions`, `inventory_items`, etc. (`patients.ts:361`, `encounters.ts:98`, `visits.ts:105`, `pharmacy.ts:52`).

**Cost:** every prescription, vitals entry, note, and inventory adjustment pays for a full scan of that table. On a busy ward this is the difference between a 5 ms insert and a 300 ms insert.

**Fix (preferred):** maintain the "last known timestamp" in a tiny dedicated table (or reuse `superadmin_settings`) updated by a trigger, then compare `NOW()` against that single row — O(1). A simpler interim fix is to add `created_at/updated_at` indexes so the `MAX` can use an index-only scan, but that is still two index scans per write.

---

### 3.3 N+1 queries

**a) Paypoint pending items** — `server/src/routes/payments.ts:196-253`
For each unpaid prescription, lab, and radiology row, a **separate** `pool.query` fetches the price:

```ts
for (const r of (prescriptionsRes.rows || [])) {
  var rxInv = await pool.query(
    'SELECT price, cost_price FROM inventory_items WHERE drug_name ILIKE $1 AND category = $2 ...',
    [r.drug_name, 'pharmacy']);
  ...
}
```

A patient with 15 pending items = ~15 extra round-trips, each doing an `ILIKE '%name%'` full scan of `inventory_items`.

**b) Creating a payment** — `server/src/routes/payments.ts:352-392`
Per line item it runs `resolveCostAtPayment` (which itself does 1–3 queries, `:85-145`), then an `INSERT`, then an `UPDATE` of the source order — all sequential. A 20-line cart = 60–80 sequential round-trips. There is no transaction either, so a mid-cart failure leaves partial state.

**c) Lab specimen replace** — `server/src/routes/lab.ts:26-32`: a loop of `INSERT`s for each specimen.

**d) Dispense stock reduction** — `pharmacy.ts:250-258` and `prescriptions.ts:133-142`: a loop of `UPDATE`s over every matching stock batch.

**e) Notifications fan-out** — `visits.ts:323-329`: one `INSERT` per recipient in a loop.

**f) Bed-charge accrual** — `server/src/utils/admissionBilling.ts:116-133`: for each active admission it resolves the ward rate (1–2 queries), then loops day-by-day issuing one `INSERT` per billable day. A patient admitted 30 days ago triggers ~31 statements *every time any pending endpoint runs* (and those run every 10–30s).

**Fix pattern:** preload the needed lookup maps in a single query (e.g. `SELECT drug_name, price, cost_price FROM inventory_items WHERE tenant_id=$1 AND category=ANY($2)`), build an in-memory map, then do your loop in memory. For writes, use `unnest()` batch inserts and wrap the whole payment in a transaction.

---

### 3.4 Unbounded list endpoints (no pagination)

These endpoints return every matching row with no `LIMIT`; the client then slices for display, so the DB and network pay for the full table:

- `GET /api/patients` (`patients.ts:73-134`) — `SELECT DISTINCT p.*` plus **11 correlated subqueries per row**, unbounded.
- `GET /api/patients/active` (`patients.ts:137-235`) — more correlated subqueries + inline `sinceFilter` subqueries, unbounded.
- `GET /api/prescriptions` (`prescriptions.ts:13-53`)
- `GET /api/lab-orders` (`lab.ts:36-73`) — 5 correlated subqueries per row, unbounded.
- `GET /api/lab-results` (`lab.ts:470-504`)
- `GET /api/appointments` (`appointments.ts:32-75`) — two `EXISTS` subqueries per row.
- `GET /api/visits` (`visits.ts:73-99`)
- `GET /api/payments` — this one *is* capped at 100 (`payments.ts:466`), good.
- `GET /api/inventory` (`pharmacy.ts:13-48`) — unbounded but the table is usually small.

The sidebar even calls `GET /api/prescriptions?status=pending`, `GET /api/lab-orders?...`, `GET /api/lab-results?status=completed`, and `GET /api/lab-results?status=draft` **just to count rows** (`App.tsx:289-299`) — downloading entire result sets to call `.length`.

**Fix:** add `LIMIT/OFFSET` (or keyset pagination) + a `?count=true` mode, and add dedicated lightweight count endpoints for badges (e.g. `SELECT COUNT(*)` per status).

---

### 3.5 Leading-wildcard `ILIKE` with no `pg_trgm`

`ILIKE '%term%'` cannot use a normal B-tree index. It appears in the hottest paths:

- `inventory_items.drug_name ILIKE '%name%'` — paypoint pricing, cost resolution, consultation fee lookup, coverage lookup.
- `patients.full_name / hospital_number / phone ILIKE '%q%'`.
- `lab_test_catalog.name ILIKE '%search%'`.
- `inventory_items.drug_name ILIKE '%' || ww.name || '%'` — inside the admission-fee subquery (a correlated `ILIKE` with another table!).

Only `uuid-ossp` is installed (confirmed: no `pg_trgm`, no `gin_trgm_ops`). So every search is a seq scan.

**Fix:** `CREATE EXTENSION IF NOT EXISTS pg_trgm;` and add GIN trigram indexes on the searched columns (Section 5). For exact-name lookups used internally (cost resolution), prefer joining on a normalized `service_key` / exact `drug_name` rather than fuzzy `ILIKE`.

---

### 3.6 The polling storm multiplies everything

The client re-runs expensive queries continuously:

- **Sidebar** (`App.tsx:285-372`): every 30s it fires up to **9 requests**, including `GET /api/payments/all-pending-items` and `GET /api/payments/pending-summary` — two of the most expensive queries in the entire codebase (Section 3.4 / below).
- Every 10s: `AssignmentBoard.tsx:173`, `Dispensing.tsx:66`, `DoctorConsultation.tsx:470`, `FinanceDashboard.tsx:17`, `FinancePaymentHistory.tsx:49`, `LabWorklist.tsx:322`, `LabResults.tsx:120`, `LabOrders.tsx:19`, `PharmacyDashboard.tsx:70`, `PaypointPending.tsx:36`, `PaypointPatients.tsx:34`.
- Every 30s: `NotificationBell.tsx:53`.
- These timers keep running **even when the browser tab is hidden** (no `document.visibilityState` guard).

So a single logged-in user generates a near-constant stream of the heaviest queries. Ten concurrent users multiplies that by ten.

**Fix:**
1. Replace badge counts with cheap `COUNT(*)` endpoints.
2. Pause polling when `document.hidden`.
3. Increase intervals (30–60s) and/or move to SSE/WebSocket for notifications.
4. Only poll the endpoints relevant to the current page, not a global sidebar fan-out.

#### The two worst queries

**`GET /api/payments/all-pending-items`** (`payments.ts:571-706`) builds an 8-branch `UNION ALL` over `patients`, `prescriptions`, `lab_orders`, `radiology_orders`, `admissions`, `admission_daily_charges`, `visits`, `referrals`, and for each row runs a correlated subquery against `inventory_items` with `ILIKE` — **twice** (once for `unit_price`, once for `needs_price`, `:599-600`, `:609-610`, `:619-620`, etc.). It then adds another per-row subquery for the insurance provider (`:692-696`). With no indexes, this is dozens of scans of several tables.

**`GET /api/payments/pending-summary`** (`payments.ts:473-568`) runs the same shape with `MAX()/COUNT()` aggregates over 8 tables, then a per-patient insurance-provider subquery.

**Fix:** compute `needs_price` once in SQL (`unit_price <= 0`) instead of a duplicate subquery; replace fuzzy `ILIKE` joins with exact `service_key`/normalized-name joins; add the indexes; and cache the result for a few seconds (this data does not need to be sub-second fresh).

---

### 3.7 `readClinicProfile()` reads and parses a file on every request

```ts
// server/src/config/reader.ts:40-47
export function readClinicProfile(): ClinicProfile {
  if (fs.existsSync(CONFIG_PATH)) {          // stat syscall
    const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');  // read syscall
    return JSON.parse(raw) as ClinicProfile;  // parse
  }
  ...
}
```

`getTenantId()` calls this at the top of essentially every handler (it is defined in ~every route module). This is blocking I/O on the single Node event-loop thread. Under load it adds up and blocks other requests.

**Fix:** load once into a module-level cache; expose `reloadClinicProfile()` called after writes; optionally watch the file with `fs.watch`. This turns per-request disk I/O into a memory read.

---

### 3.8 Startup re-runs all 73 migrations before accepting connections

`runMigrations()` (`server/src/db/migrate.ts:16-41`) reads and executes **every** `.sql` file in `database/` on every boot, sequentially, swallowing errors. `start()` awaits `ensureSchema()` **and** `detectSchemaChanges()` before `app.listen` (`server/src/server.ts:159-176`).

**Consequence:** after any restart (including `tsx watch` reloads in dev, or an auto-update pull from `startUpdateDaemon`), the server does heavy startup work before it listens. Requests during that window are slow or refused — a prime "it loads slowly *sometimes*" candidate.

`detectSchemaChanges` can also issue `UPDATE "<table>" SET is_synced = false` across all sync tables when the schema version changed (`schemaVersion.ts:57-64`), which is a full-table write on every syncable table.

**Fix:**
- Track applied migrations in a `schema_migrations` table and only run new files.
- Move `detectSchemaChanges` and daemons to run **after** `app.listen` (fire-and-forget) so the server is available immediately.
- Guard the dev watcher so file saves during work don't trigger the full migration pass repeatedly.

---

### 3.9 No HTTP compression, no long-lived static caching

`server/src/server.ts` mounts `express.static` with default options and has **no `compression` middleware**:

```ts
app.use(express.static(distDir));   // server.ts:138
```

Vite's build is ~2.4 MB total, with `index-*.js` at 282 KB and `index-*.css` at 72 KB (raw, uncompressed). Every cold load transfers these over the network un-gzipped, and hashed assets are not served with `immutable` far-future cache headers, so repeat visits re-validate.

**Fix:**
```ts
import compression from 'compression';
app.use(compression());
app.use('/assets', express.static(path.join(distDir, 'assets'), { maxAge: '1y', immutable: true }));
app.use(express.static(distDir));
```
This alone meaningfully improves first and repeat load times on LAN/Wi-Fi.

---

### 3.10 Client: a 1-second interval re-renders the sidebar

```ts
// client/src/App.tsx:276-283
const interval = setInterval(() => {
  const stored = localStorage.getItem('sretan_user');
  if (stored) { try { setUser(JSON.parse(stored)) } catch {} }
}, 1000);
```

`JSON.parse` creates a **new object every second**, so `setUser` triggers a sidebar re-render (and re-evaluation of all the derived `allowedLinks` / grouped nav) **every second**, forever, even when nothing changed. This is pure wasted CPU on every screen.

**Fix:** remove the interval; read localStorage once on mount and update on a `storage` event, or compare before setting state.

---

### 3.11 Large monolithic components and frequent full-list re-renders

- `PatientChart.tsx` is **4,708 lines** in a single component; `DoctorConsultation.tsx` is 1,908 lines. Large component trees with many `useState` hooks re-render the whole tab when any state changes.
- Long lists (patient lists, lab worklist, paypoint pending) render every row with no virtualization. Server sends the full array, client maps it all, so DOM node count grows with data.
- No `React.memo`, `useMemo`, or `useCallback` on the heavy list rows in the components inspected.

**Fix:** split the giant components into per-tab subcomponents (which also improves code-splitting), memoize list rows and derived data, and virtualize long lists (e.g. `react-window`) once row counts pass a few hundred. This is secondary to the server/index fixes but noticeable on older clinic machines.

---

### 3.12 Correctness-adjacent issues that also hurt performance

- **No transactions** around multi-step writes (`POST /api/payments`, dispense, bed assignment). Beyond data integrity, it forces many sequential round-trips that a single transaction + batch statements would collapse.
- **Duplicate search predicate** in `GET /api/patients`: the `search` filter is appended twice (`patients.ts:113-117` and again `:121-125`), adding two identical `ILIKE` parameters and doubling the match work.
- **`SELECT DISTINCT p.*`** on the patient list forces a sort/hash of the whole result to dedupe rows that are already unique, on top of the per-row subqueries.
- **`GET /api/lab-results`** and `lab-orders` use `json_agg` subqueries per row instead of a grouped join.

---

### 3.13 Connection pool and server config

- `max: 20` is fine for a single hospital, but with no `statement_timeout`, one runaway query (e.g. the all-pending CTE) can occupy a pool slot and back up the queue.
- `connectionTimeoutMillis: 5000` surfaces as slowness under temporary DB pressure.
- No `pg_stat_statements`, no slow-query logging, so the team is flying blind.

**Fix:** set `statement_timeout` (e.g. 15s) at the pool/role level, enable `pg_stat_statements`, and log queries over a threshold. Consider PgBouncer only if concurrent terminals exceed the pool.

---

## 4. Prioritized Remediation Plan

### P0 — Do first (highest impact, low risk)

1. **Add the performance indexes** in Section 5 (one migration, no app changes).
2. **Replace `clockGuard` full scans** with an O(1) heartbeat check (Section 3.2).
3. **Cache `readClinicProfile()`** in memory (Section 3.7).
4. **Stop the sidebar fan-out**: add count endpoints and only fetch what the current role/page needs (Section 3.6).
5. **Add `compression` + static cache headers** (Section 3.9).

### P1 — Next (structural, moderate change)

6. Fix the two heavy paypoint queries: dedupe the `needs_price` subquery, replace fuzzy `ILIKE` with exact joins, and add a short server-side cache (Section 3.6).
7. Batch the N+1 loops: preload inventory maps; use `unnest()`; wrap payment in a transaction (Section 3.3).
8. Add `LIMIT`/pagination to all unbounded list endpoints and `COUNT`-only badge endpoints (Section 3.4).
9. Make bed-charge accrual incremental (only compute days not yet present) instead of re-inserting all days on every call (Section 3.3f).
10. Add visibility-aware polling with longer intervals (Section 3.6).

### P2 — Hardening and longer-term

11. Incremental migrations + start listening before daemons/migration detection (Section 3.8).
12. Memoize/split the giant React components and virtualize long lists (Section 3.11).
13. Remove the 1-second sidebar interval (Section 3.10).
14. Enable `statement_timeout` + `pg_stat_statements` and set up slow-query logging (Section 3.13).
15. Consider SSE/WebSocket for notifications to eliminate polling entirely.

---

## 5. Ready-to-Apply Index Migration

Create `database/073_performance_indexes.sql`. Every statement is idempotent and safe to run on a live system (use `CREATE INDEX CONCURRENTLY` in a production window if the tables are large — run those outside a transaction, one at a time).

```sql
-- 073_performance_indexes.sql
-- Performance indexes for Sretan HMS. Idempotent.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Patients
CREATE INDEX IF NOT EXISTS idx_patients_tenant_created   ON patients (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_patients_tenant_status    ON patients (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_patients_tenant_folder    ON patients (tenant_id, folder_activated);
CREATE INDEX IF NOT EXISTS idx_patients_hospital_number  ON patients (hospital_number);
CREATE INDEX IF NOT EXISTS idx_patients_trgm_name        ON patients USING gin (full_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_patients_trgm_phone       ON patients USING gin (phone gin_trgm_ops);

-- Encounters (the most-joined table)
CREATE INDEX IF NOT EXISTS idx_encounters_tenant_patient ON encounters (tenant_id, patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_encounters_patient        ON encounters (patient_id);
CREATE INDEX IF NOT EXISTS idx_encounters_staff          ON encounters (staff_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_encounters_tenant_created ON encounters (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_encounters_department     ON encounters (department_id);

-- Vitals
CREATE INDEX IF NOT EXISTS idx_vitals_encounter          ON vitals (encounter_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vitals_created            ON vitals (created_at);
CREATE INDEX IF NOT EXISTS idx_vitals_recorded_by        ON vitals (recorded_by);

-- Prescriptions
CREATE INDEX IF NOT EXISTS idx_prescriptions_encounter   ON prescriptions (encounter_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_tenant_stat ON prescriptions (tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prescriptions_tenant_paid ON prescriptions (tenant_id, is_paid);

-- Lab orders / results
CREATE INDEX IF NOT EXISTS idx_lab_orders_encounter      ON lab_orders (encounter_id);
CREATE INDEX IF NOT EXISTS idx_lab_orders_tenant_status  ON lab_orders (tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lab_orders_tenant_paid    ON lab_orders (tenant_id, is_paid);
CREATE INDEX IF NOT EXISTS idx_lab_orders_read           ON lab_orders (doctor_read_at);
CREATE INDEX IF NOT EXISTS idx_lab_results_order         ON lab_results (lab_order_id);
CREATE INDEX IF NOT EXISTS idx_lab_results_tenant_status ON lab_results (tenant_id, status);

-- Radiology
CREATE INDEX IF NOT EXISTS idx_radiology_orders_enc      ON radiology_orders (encounter_id);
CREATE INDEX IF NOT EXISTS idx_radiology_orders_tenant   ON radiology_orders (tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_radiology_orders_paid     ON radiology_orders (tenant_id, is_paid);

-- Admissions / bed charges
CREATE INDEX IF NOT EXISTS idx_admissions_tenant_status  ON admissions (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_admissions_patient_status ON admissions (patient_id, status);
CREATE INDEX IF NOT EXISTS idx_admissions_paid           ON admissions (tenant_id, is_paid);

-- Inventory (hot fuzzy lookups + exact service keys)
CREATE INDEX IF NOT EXISTS idx_inventory_tenant_cat      ON inventory_items (tenant_id, category, is_active);
CREATE INDEX IF NOT EXISTS idx_inventory_drug_name       ON inventory_items (drug_name);
CREATE INDEX IF NOT EXISTS idx_inventory_trgm_name       ON inventory_items USING gin (drug_name gin_trgm_ops);

-- Payments
CREATE INDEX IF NOT EXISTS idx_payments_patient          ON payments (patient_id, status);
CREATE INDEX IF NOT EXISTS idx_payments_status_created   ON payments (tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_items_payment     ON payment_items (payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_items_convert     ON payment_items (service_type, is_converted);

-- Appointments / visits
CREATE INDEX IF NOT EXISTS idx_appointments_doctor_date  ON appointments (tenant_id, doctor_id, appointment_date, status);
CREATE INDEX IF NOT EXISTS idx_appointments_patient      ON appointments (patient_id);
CREATE INDEX IF NOT EXISTS idx_visits_tenant_patient     ON visits (tenant_id, patient_id, status, created_at DESC);

-- Nurse module
CREATE INDEX IF NOT EXISTS idx_nurse_notes_patient       ON nurse_notes (patient_id, note_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_treatments_patient        ON treatments (patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_treatment_doses_treatment ON treatment_doses (treatment_id);
CREATE INDEX IF NOT EXISTS idx_treatment_doses_session   ON treatment_doses (session_id);
CREATE INDEX IF NOT EXISTS idx_fluid_balance_patient     ON fluid_balance (patient_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_fluid_balance_session     ON fluid_balance (session_id);

-- Audit + lab inventory map
CREATE INDEX IF NOT EXISTS idx_audit_logs_record         ON audit_logs (table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_created ON audit_logs (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_test_inventory_map_test   ON test_inventory_map (test_name, inventory_item_id);
```

> Note on `CREATE INDEX CONCURRENTLY`: on large production tables, run each of these as `CREATE INDEX CONCURRENTLY IF NOT EXISTS ...` in autocommit mode (not inside a transaction) to avoid long write locks. On a fresh/small database the plain form above is fine.

---

## 6. Top Code Fixes (illustrative snippets)

### 6.1 Cache the clinic profile

```ts
// server/src/config/reader.ts
let cached: ClinicProfile | null = null;

export function readClinicProfile(): ClinicProfile {
  if (cached) return cached;
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      cached = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8')) as ClinicProfile;
      return cached;
    }
  } catch {}
  cached = { /* ...defaults... */ };
  return cached;
}

export function invalidateClinicProfile(): void { cached = null; }
```

Call `invalidateClinicProfile()` wherever the profile is written.

### 6.2 O(1) clock guard

Replace the table scan with a single heartbeat row maintained on write, or at minimum compare against a value stored once per request cycle:

```ts
// Conceptual: store the highest seen timestamp in superadmin_settings
// ('clock_guard_max_ts') via a trigger, and read that one row here.
const { rows } = await pool.query(
  `SELECT setting_value FROM superadmin_settings WHERE setting_key = 'clock_guard_max_ts'`
);
if (rows[0] && new Date() < new Date(rows[0].setting_value)) { /* tamper */ }
```

### 6.3 Batch the paypoint price lookup

```ts
// Instead of one query per pending row:
const names = [...new Set([...rxRows.map(r => r.drug_name), ...labRows.map(r => r.test_name)])];
const prices = await pool.query(
  `SELECT DISTINCT ON (LOWER(drug_name)) drug_name, price, cost_price, category
   FROM inventory_items
   WHERE tenant_id = $1 AND is_active = true
     AND EXISTS (SELECT 1 FROM unnest($2::text[]) n WHERE drug_name ILIKE '%' || n || '%')
   ORDER BY LOWER(drug_name), created_at DESC`,
  [tenantId, names]
);
// build a Map and look up in memory inside the loop
```

Better still, replace the `ILIKE` with an exact normalized-name / `service_key` join so it becomes an index lookup.

### 6.4 Paginate list endpoints

```ts
const limit = Math.min(parseInt(String(req.query.limit ?? '50'), 10), 200);
const offset = parseInt(String(req.query.offset ?? '0'), 10);
query += ` LIMIT $${idx++} OFFSET $${idx++}`;
params.push(limit, offset);
```

### 6.5 Count endpoint for badges

```ts
router.get('/api/prescriptions/pending-count', async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS count FROM prescriptions
     WHERE tenant_id = $1 AND status = 'pending'`,
    [getTenantId()]
  );
  res.json(rows[0]);
});
```

Then point the sidebar at these instead of fetching full arrays.

---

## 7. Expected Impact

| Fix | Expected effect |
|-----|-----------------|
| Performance indexes | Largest single win; turns seq scans into index lookups on the hottest paths. Grows more valuable as data grows. |
| O(1) clock guard | Removes a full table scan from every write; directly speeds up all clinical entry. |
| Cached clinic profile | Removes blocking disk I/O from every request; reduces event-loop stalls. |
| De-polled sidebar + count endpoints | Cuts background query volume by an order of magnitude per user. |
| Compression + asset caching | Faster first load and near-instant repeat loads of the SPA. |
| Batched N+1 writes | Payment/checkout latency drops from N round-trips to a handful. |
| Pagination | Keeps response time flat as patients/orders accumulate. |

No single fix eliminates the problem alone; the combination of P0 items should remove the most visible slowness.

---

## 8. How to Measure and Verify

1. **Enable `pg_stat_statements`** and query the top statements by `total_exec_time` before and after:
   ```sql
   SELECT calls, mean_exec_time, total_exec_time, query
   FROM pg_stat_statements ORDER BY total_exec_time DESC LIMIT 20;
   ```
2. **Run `EXPLAIN (ANALYZE, BUFFERS)`** on `GET /api/patients`, `GET /api/lab-orders`, and `GET /api/payments/all-pending-items` before/after indexes. Look for `Seq Scan` → `Index Scan` and a drop in `actual time`.
3. **Add request timing middleware** (log method, path, duration, status) and watch the p95 for the sidebar's 9 requests.
4. **Load-test** the sidebar endpoints with `autocannon -c 20 -d 30 http://localhost:3000/api/payments/all-pending-items`.
5. **Set `statement_timeout`** and log anything exceeding ~500 ms to catch regressions early.

---

## 9. Reference Index (file:line)

| Concern | Location |
|--------|----------|
| Global router mount (33 routers, no prefix) | `server/src/server.ts:59-92` |
| Static serving / no compression or cache headers | `server/src/server.ts:109-149` (esp. `:138`) |
| Migrations awaited before listen | `server/src/server.ts:159-176`; `server/src/db/migrate.ts:16-41` |
| Sync profile read per request | `server/src/config/reader.ts:40-47` |
| Clock guard full scan on every write | `server/src/middleware/clockGuard.ts:16-32` |
| Pool config | `server/src/db/pool.ts:7-16` |
| Unbounded patients list + 11 subqueries | `server/src/routes/patients.ts:73-134` |
| Active patients heavy query | `server/src/routes/patients.ts:137-235` |
| Paypoint N+1 price lookups | `server/src/routes/payments.ts:196-253` |
| Payment creation N+1 + no transaction | `server/src/routes/payments.ts:352-392` |
| `resolveCostAtPayment` multi-query | `server/src/routes/payments.ts:85-145` |
| `pending-summary` CTE | `server/src/routes/payments.ts:473-568` |
| `all-pending-items` double subquery | `server/src/routes/payments.ts:571-706` |
| Lab specimen insert loop | `server/src/routes/lab.ts:26-32` |
| Lab orders list with subqueries | `server/src/routes/lab.ts:36-73` |
| Lab results list | `server/src/routes/lab.ts:470-504` |
| Consultation-fee lookup loop | `server/src/routes/visits.ts:34-49` |
| Notification fan-out loop | `server/src/routes/visits.ts:323-329` |
| Bed-charge accrual N+1 | `server/src/utils/admissionBilling.ts:97-135` |
| Dispense stock loop | `server/src/routes/pharmacy.ts:250-258`; `server/src/routes/prescriptions.ts:133-142` |
| Appointment optional/EXISTS subqueries | `server/src/routes/appointments.ts:37-59` |
| Sidebar 9-endpoint poll every 30s | `client/src/App.tsx:285-372` |
| Sidebar 1s re-render interval | `client/src/App.tsx:276-283` |
| 10s component polling | `client/src/components/*.tsx` (see Section 3.6 list) |
| Giant component | `client/src/components/PatientChart.tsx` (4,708 lines) |

---

*End of report.*
