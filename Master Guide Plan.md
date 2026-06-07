# Sretan EMR — Implementation Plan

> **Based on:** `Master Prompts.md` (7 Phases, 23 Prompts, 23 Testing Intervals)
> **Stack:** Vite + React + TypeScript (frontend) | Express + TypeScript (backend) | PostgreSQL 16 + Supabase (database) | Tauri (desktop)
> **Strategy:** Offline-first, bi-directional cloud-sync, multi-tenant HMS with hybrid-to-standalone decoupling.

---

## Project Structure

```
C:/hms/                          # Server runtime root (config, assets, logs)
  ├── config/
  │   └── clinic_profile.json     # Local config (tenant ID, sync flag, theme, etc.)
  ├── assets/
  │   └── logo.png                # Hospital logo (written by setup console)
  └── logs/
      └── server_runtime.log      # NSSM-managed server log

Sretan EMR/                       # Development workspace root
  ├── server/                     # Node.js/Express backend
  │   ├── src/
  │   │   ├── server.ts           # Entry point
  │   │   ├── db/
  │   │   │   ├── pool.ts         # pg Pool configuration
  │   │   │   ├── init.ts         # Schema init on boot
  │   │   │   └── migrations.ts   # Auto-migration engine (Phase 6)
  │   │   ├── middleware/
  │   │   │   ├── errorHandler.ts  # Global error handler
  │   │   │   ├── cors.ts          # LAN-restricted CORS
  │   │   │   ├── clockGuard.ts    # Anti-clock-tampering (Phase 6)
  │   │   │   └── auth.ts          # Master token/session auth
  │   │   ├── routes/
  │   │   │   ├── health.ts        # GET /api/health
  │   │   │   ├── patients.ts      # CRUD /api/patients
  │   │   │   ├── vitals.ts        # POST /api/vitals
  │   │   │   ├── prescriptions.ts # /api/prescriptions
  │   │   │   ├── lab.ts           # /api/lab-orders, /api/lab-results
  │   │   │   ├── pharmacy.ts      # /api/inventory, /api/dispense
  │   │   │   ├── billing.ts       # /api/invoices
  │   │   │   └── setup.ts         # /api/setup (offline console, Phase 5)
  │   │   ├── config/
  │   │   │   └── reader.ts        # Parses C:/hms/config/clinic_profile.json
  │   │   ├── sync/
  │   │   │   ├── syncDaemon.ts    # 15-sec loop sync (Phase 2, Phase 5)
  │   │   │   ├── upwardSync.ts    # Local → Cloud
  │   │   │   ├── downwardSync.ts  # Cloud → Local
  │   │   │   └── migrationListener.ts # Theme/arch migration handler
  │   │   └── setup/
  │   │       └── setupConsole.ts  # Offline setup web console (Phase 5)
  │   ├── package.json
  │   ├── tsconfig.json
  │   └── install_service.bat      # NSSM Windows service script
  │
  ├── client/                     # Vite + React + TypeScript frontend
  │   ├── src/
  │   │   ├── main.tsx            # Entry point
  │   │   ├── App.tsx             # Root with routing
  │   │   ├── components/
  │   │   │   ├── Login.tsx        # Module 0 - White-label login
  │   │   │   ├── PatientRegistration.tsx  # Module 1
  │   │   │   ├── PatientDashboard.tsx     # Module 1 (queue cards)
  │   │   │   ├── TriageStation.tsx        # Module 2
  │   │   │   ├── DoctorConsultation.tsx   # Module 3
  │   │   │   ├── LaboratoryWorkbench.tsx  # Module 4
  │   │   │   ├── PharmacyDashboard.tsx    # Module 5
  │   │   │   ├── RadiologyModule.tsx      # Module 6
  │   │   │   ├── PaypointCheckout.tsx     # Module 7
  │   │   │   ├── FinanceHMO.tsx           # Module 8
  │   │   │   ├── StaffManagement.tsx      # Module 9
  │   │   │   ├── SuperAdminPortal.tsx     # Phase 5 - Superadmin
  │   │   │   └── SetupConsole.tsx         # Phase 5 - Offline setup
  │   │   ├── hooks/
  │   │   │   ├── useClinicConfig.ts # Reads clinic_profile.json for branding
  │   │   │   └── useAxios.ts        # Axios instance pointing to local API
  │   │   ├── types/
  │   │   │   └── index.ts           # Shared TypeScript interfaces
  │   │   └── styles/
  │   │       └── index.css          # Tailwind + CSS variables for theming
  │   ├── package.json
  │   ├── tsconfig.json
  │   ├── vite.config.ts
  │   ├── tailwind.config.js
  │   ├── postcss.config.js
  │   └── index.html
  │
  ├── database/                    # SQL scripts
  │   ├── 001_multi_tenant_schema.sql   # Phase 1 Prompt 1
  │   ├── 002_supabase_auth_trigger.sql # Phase 2 Prompt 1
  │   ├── 003_tenant_configurations.sql # Phase 5 Prompt 1
  │   └── migrations/                  # Auto-downloaded migration scripts
  │
  ├── desktop/                     # Tauri wrapper
  │   └── src-tauri/
  │       └── tauri.conf.json       # Phase 4 Prompt 1
  │
  └── scripts/
      ├── install_service.bat       # Phase 4 Prompt 2
      └── electron-builder.yml      # Phase 7 Prompt 1 (alternative)
```

---

## PHASE 1: CORE DATA LAYER & LOCAL ARCHITECTURE

### Prompt 1 — Multi-Tenant Schema with Identity Locks

**Goal:** Production-ready PostgreSQL schema for multi-tenant HMS.

**Deliverable:** `database/001_multi_tenant_schema.sql`

**Tables to create:**
- `tenants` — id (UUID PK), hospital_name, subscription_status (active/suspended), subscription_tier, created_at, updated_at, is_synced, last_synced_at
- `staff_users` — tenant_id FK, id UUID PK, email, name, role, metadata, standard tracking columns
- `patients` — tenant_id FK, id UUID PK, full_name, dob, sex, phone, next_of_kin, insurance, blood_type, status (checked_in/in_triage/waiting/with_doctor/discharged), standard tracking
- `encounters` — tenant_id FK, id UUID PK, patient_id FK, staff_id FK, encounter_type, chief_complaint, standard tracking
- `vitals` — tenant_id FK, id UUID PK, encounter_id FK, systolic_bp, diastolic_bp, pulse, temperature, respiration_rate, weight, spo2, triage_priority (red/yellow/green), standard tracking
- `prescriptions` — tenant_id FK, id UUID PK, encounter_id FK, drug_name, dosage, quantity, instructions, status, standard tracking
- `lab_orders` — tenant_id FK, id UUID PK, encounter_id FK, test_name, status (ordered/draft/approved/completed), standard tracking
- `lab_results` — tenant_id FK, id UUID PK, lab_order_id FK, analyte_name, value, reference_range_low, reference_range_high, is_abnormal, standard tracking
- `radiology_orders` — tenant_id FK, id UUID PK, encounter_id FK, imaging_type, status, report_text, standard tracking
- `billing_invoices` — tenant_id FK, id UUID PK, patient_id FK, encounter_id FK, total_amount, amount_paid, balance, status (pending/paid/partial), standard tracking
- `inventory_items` — tenant_id FK, id UUID PK, drug_name, batch_number, stock_count, reorder_level, expiry_date, standard tracking
- `audit_logs` — tenant_id FK, id UUID PK, action, table_name, record_id, performed_by, old_data, new_data, standard tracking

**Key features:**
- Every table has `tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE`
- Every table uses `DEFAULT gen_random_uuid()` for PKs
- Auto-`updated_at` trigger function applied to all tables
- Supabase RLS policies: each user can only access rows matching their `tenant_id`

**RLS policy approach:**
```sql
CREATE POLICY tenant_isolation ON patients
  FOR ALL USING (tenant_id = auth.jwt() ->> 'tenant_id'::text);
```

**Testing Interval 1:**
1. Execute schema in local PostgreSQL 16
2. `SELECT * FROM tenants;` — should return empty set (no error)
3. Insert a row into any table, verify `updated_at` auto-updates on subsequent UPDATE
4. Verify all tables have `tenant_id` column via `SELECT column_name FROM information_schema.columns WHERE table_name = 'patients' AND column_name = 'tenant_id';`

---

### Prompt 2 — Local Subnet API Engine & Environment Bootstrap

**Goal:** Express/TypeScript backend server on port 3000 with LAN-only CORS and PostgreSQL connectivity.

**Deliverables:**
- `server/src/server.ts`
- `server/src/db/pool.ts`
- `server/src/db/init.ts`
- `server/src/config/reader.ts`
- `server/src/middleware/errorHandler.ts`
- `server/src/middleware/cors.ts`
- `server/src/routes/health.ts`
- `server/package.json`
- `server/tsconfig.json`

**Details:**

**`server/src/config/reader.ts`** — Reads `C:/hms/config/clinic_profile.json`:
```json
{
  "GLOBAL_SAAS_TENANT_ID": "uuid-here",
  "hospital_name": "Apex Clinic",
  "address": "123 Health Street",
  "cloud_sync_enabled": false,
  "primary_brand_color": "#2563eb",
  "secondary_brand_color": "#10b981",
  "ui_theme_class": "theme-trust-blue",
  "deployment_mode": "OFFLINE_STANDALONE",
  "private_supabase_url": null,
  "private_supabase_anon_key": null,
  "module_records": true,
  "module_triage": true,
  "module_consultation": true,
  "module_laboratory": false,
  "module_pharmacy": false,
  "module_radiology": false,
  "module_finance_hmo": false
}
```

**`server/src/db/pool.ts`** — PostgreSQL pool config, env-based or defaults (localhost:5432, db: sretan_emr).

**`server/src/db/init.ts`** — On boot, checks for `tenants` table existence. If missing, reads and executes `001_multi_tenant_schema.sql` via `pg` pool query.

**`server/src/middleware/cors.ts`** — Restricts origins to `http://localhost:3000` and `http://192.168.1.*` range.

**`server/src/middleware/errorHandler.ts`** — Catches all errors, returns `{ error: true, message, code }` JSON. Special handling for `ECONNREFUSED` (DB down).

**`server/src/routes/health.ts`** — `GET /api/health` returns `{ status: "ok", timestamp: new Date().toISOString(), uptime: process.uptime() }`.

**Testing Interval 2:**
1. `npm run dev` in `server/`
2. `curl http://localhost:3000/api/health` from same machine → 200 with timestamp
3. Test from another machine on 192.168.1.x subnet → should respond
4. Test from outside subnet → should be blocked by CORS

---

## PHASE 2: BI-DIRECTIONAL CLOUD-SYNC & DECOUPLING PIPELINE

### Prompt 1 — Supabase Authentication Replication Trigger

**Goal:** PostgreSQL trigger on Supabase `auth.users` to replicate new users to `public.staff_users`.

**Deliverable:** `database/002_supabase_auth_trigger.sql`

**Logic:**
```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.staff_users (id, tenant_id, email, name, role, is_synced, last_synced_at)
  VALUES (
    NEW.id,
    (NEW.raw_user_meta_data ->> 'tenant_id')::uuid,
    NEW.email,
    NEW.raw_user_meta_data ->> 'name',
    NEW.raw_user_meta_data ->> 'role',
    true,
    NOW()
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

**Testing Interval 3:**
1. Create a dummy user via Supabase Auth Dashboard (set `tenant_id` in metadata)
2. Query `SELECT * FROM public.staff_users WHERE id = '<new-user-id>';`
3. Confirm row exists with `is_synced = true` and matching email/name/role

---

### Prompt 2 — Toggleable Sync Daemon with Anti-Clock & Expiration Guards

**Goal:** A Node.js background daemon running every 15 seconds that:
1. Checks `cloud_sync_enabled` flag → short-circuits if false
2. Upward sync: queries local DB for `is_synced = false`, batches, pushes to Supabase REST
3. Downward sync: polls cloud for rows with `updated_at > last_synced_at`, saves locally
4. Anti-clock-tampering: before saving, compares incoming timestamps vs local max `created_at`
5. Wrapped in try/catch, never crashes on network loss

**Deliverable:** `server/src/sync/syncDaemon.ts`, `server/src/sync/upwardSync.ts`, `server/src/sync/downwardSync.ts`

**Key design decisions:**
- The daemon is started as a sidecar when the Express server boots (or as a separate Node process via NSSM)
- Each table is sync'd independently with its own `last_synced_at` tracking
- Batch size configurable (default 100 rows)
- Network errors logged to console + file, loop continues via `setTimeout(loop, 15000)` (not `setInterval`)
- Anti-clock check: `if (incoming.created_at < localMaxCreatedAt) throw new ClockTamperError(...)`

**Testing Interval 4:**
- **4A:** Set `cloud_sync_enabled: false`, change a patient record locally. Confirm daemon logs "Sync bypassed: cloud_sync_enabled is false" and makes no outbound HTTP calls.
- **4B:** Set `cloud_sync_enabled: true`, disconnect internet, make a local change. Confirm daemon logs network error gracefully, does not crash. Reconnect, confirm sync resumes.

---

## PHASE 3: COMPREHENSIVE MEDICAL MODULES

**All prompts share:**
- [STYLING & UI INSTRUCTIONS - MASTER TRUST BLUE THEME] appended to each prompt
- React + TailwindCSS + TypeScript
- Uses `lucide-react` for icons
- Components use CSS variables (`var(--primary-color)`) for dynamic theming
- Connects to local Express API via Axios

### Module 0 — Dynamic Branding & White-Label Login Component

**File:** `client/src/components/Login.tsx`

**Key features:**
1. Offline mode: reads `clinic_profile.json` (via `/api/config`) → injects hospital name, logo, brand color into UI before user types
2. Online mode: shows generic login; on email blur, fetches tenant profile by domain → transitions card styling dynamically
3. Form submission: offline mode → POST `/api/auth/login` (local server); online mode → Supabase Auth
4. Components: branded header, email input, password input, login button, "powered by" footer

**Important architectural note for plan:** The "online mode detect" is based on whether `window.location.hostname` matches the cloud domain or a local IP. The tenant resolution on email blur calls `GET /api/tenants/resolve?email=...` which checks Supabase `tenant_configurations`.

**Testing Interval 5:**
1. Set `cloud_sync_enabled: false` in `clinic_profile.json`
2. Load login page → confirms hospital name + logo appear
3. Toggle config values → visual update on reload

---

### Module 1 — Records & Patient Registration

**Files:**
- `client/src/components/PatientRegistration.tsx`
- `client/src/components/PatientDashboard.tsx`
- `server/src/routes/patients.ts`

**PatientRegistration features:**
1. Multi-step form with progress indicator: Step 1 (Name + DOB + Sex), Step 2 (Phone + Next-of-Kin), Step 3 (Insurance + Blood Type)
2. Client-side UUIDv4 generation for patient ID
3. POST `/api/patients` creates patient record

**PatientDashboard features:**
1. Live-updating queue showing patient profile cards
2. Status badges: "Checked In", "In Triage", "Waiting for Dr.", "In Consultation", "Discharged"
3. Search/filter bar by name or EMR ID
4. Responsive grid: single column on mobile, multi-column on desktop
5. Quick-action menu per card (Send to Triage, View Details, etc.)

**Testing Interval 6:**
1. Submit new patient via registration form
2. Verify appears on dashboard as a profile card with UUID visible
3. Verify database row created in `patients` table

---

### Module 2 — Triage & Nursing Station

**Files:**
- `client/src/components/TriageStation.tsx`
- `server/src/routes/vitals.ts`

**Features:**
1. Mobile-optimized touch entry form: Systolic BP, Diastolic BP, Pulse, Temp, RR, Weight, SpO2
2. Color-coded triage priority: Red (Emergency), Yellow (Urgent), Green (Routine)
3. Open-text nursing journal field for shift handovers
4. Fluid intake/output balance tracking section
5. POST `/api/vitals` saves vitals and updates patient status

**Testing Interval 7:**
1. Open triage on smartphone connected to LAN Wi-Fi
2. Submit vitals for a queued patient
3. Verify database stores vitals correctly
4. Verify patient card color updates on dashboard

---

### Module 3 — Doctor Consultation & EMR Core

**Files:**
- `client/src/components/DoctorConsultation.tsx`
- `server/src/routes/prescriptions.ts`

**Features:**
1. **Historical Timeline:** Reverse-chronological feed of past visits, allergies, chronic diseases, lab results as timeline cards
2. **SOAP Engine:** Four-quadrant grid: Subjective / Objective / Assessment / Plan. Each textarea glows blue on focus.
3. **CPOE Order Desks:** Modal to dispatch lab orders and radiology orders with one click
4. **e-Prescribing Form:** Drug search with dynamic stock check from inventory. Allergy warning banners if contraindications found.
5. **ICD-11 Browser:** Searchable dropdown with ICD-11 code hierarchy

**Testing Interval 8:**
1. Login as doctor, select a triage-queued patient
2. Fill SOAP note, add prescription, submit
3. Verify patient removed from waiting queue
4. Verify prescription appears in pharmacy module database

---

### Module 4 — Laboratory Workbench

**Files:**
- `client/src/components/LaboratoryWorkbench.tsx`
- `server/src/routes/lab.ts`

**Features:**
1. **Worklist Queue:** Real-time table of incoming lab test requests, sorted by urgency
2. **Analyte Entry Forms:** Quantitative + qualitative value fields. Auto-red highlight on values outside reference ranges (age/gender-based)
3. **Dual-Sign Supervisor Gate:** Results tagged "Draft" until supervisor approves with credentials. Unapproved results hidden from EMR.

**Testing Interval 9:**
1. Input abnormally high blood glucose → field turns red
2. Verify result hidden from doctor EMR until supervisor approves

---

### Module 5 — Pharmacy & Inventory Tracker

**Files:**
- `client/src/components/PharmacyDashboard.tsx`
- `server/src/routes/pharmacy.ts`

**Features:**
1. **Dispensing Monitor:** Live list of verified prescriptions ready to fill, with pill calculator
2. **Inventory Stock Matrix:** Drug name, batch number, stock count, reorder level, auto-alerts when below threshold
3. **Expiry Monitor:** Red alerts for lots nearing expiry, sortable by supplier

**Testing Interval 10:**
1. Dispense 30 tablets of a drug
2. Query `inventory_items` → stock reduced by exactly 30

---

### Module 6 — Radiology Module

**Files:**
- `client/src/components/RadiologyModule.tsx`

**Features:**
1. **Imaging Worklist Queue:** List of pending X-ray, ultrasound, CT, MRI requests
2. **Report Editor:** Rich-text with template phrase library
3. **File Drop Zone:** Accepts DICOM/images, references stored at `C:/hms/assets/`

**Testing Interval 11:**
1. Open radiology order, write report using template, submit
2. Verify status updates to "Complete"
3. Verify result links to patient EMR timeline

---

### Module 7 — Paypoint & Checkout Module

**File:** `client/src/components/PaypointCheckout.tsx`

**Features:**
1. **Invoice Card:** Aggregated fees (registration, pharmacy, lab), clean divider lines, bold total
2. **Multi-Channel Payment:** Large tiles for Cash / Card / Bank Transfer. Selected tile expands sub-form for reference input.
3. **Wallet Card:** Shows advance deposit balance with gradient accent background

**Testing Interval 12:**
1. Generate invoice for treatment
2. Process split payment (Bank Transfer + Cash)
3. Verify invoice status = "Paid"
4. Verify payment reconciliation lines in `billing_invoices`

---

### Module 8 — Finance & Insurance (HMO) Core

**File:** `client/src/components/FinanceHMO.tsx`

**Features:**
1. **HMO Batch Invoice Tool:** Filter encounters by HMO provider, group into batch export
2. **Operational Expense Ledger:** Material purchases, vendor distributions, budget allocations
3. **Revenue Audit Interface:** Daily view flagging discrepancies between cash collections and treatment records

**Testing Interval 13:**
1. Compile HMO batch with 3 patient encounters under same provider
2. Verify unified claim invoice with line items and authorization codes

---

### Module 9 — HR & Staff Management

**File:** `client/src/components/StaffManagement.tsx`

**Features:**
1. **Personnel Directory:** Staff profiles with emergency contact, contract, salary info
2. **Duty Roster Grid:** Interactive weekly calendar for shift assignment (doctors, nurses, techs)
3. **License Expiry Engine:** Alerts for nearing clinical staff license expirations

**Testing Interval 14:**
1. Assign doctor to night shift on calendar
2. Verify shift persists in DB and updates availability status

---

## PHASE 4: CLIENT PACKAGING & DESKTOP ANCHORING

### Prompt 1 — Tauri Native Windows Desktop Client

**Deliverable:** `desktop/src-tauri/tauri.conf.json`

**Configuration:**
```json
{
  "build": {
    "devUrl": "http://localhost:5173",
    "frontendDist": "../client/dist"
  },
  "app": {
    "windows": [{
      "title": "Sretan EMR",
      "fullscreen": false,
      "width": 1920,
      "height": 1080,
      "decorations": false,
      "resizable": true
    }],
    "security": {
      "devCsp": null,
      "csp": "default-src 'self'; connect-src http://192.168.1.200:3000; style-src 'self' 'unsafe-inline'"
    }
  }
}
```

**Key decisions:**
- Frontend build output at `client/dist/`, served by Tauri webview
- API target: `http://192.168.1.200:3000`
- DevTools disabled in production (`"devtools": false`)

**Testing Interval 15:**
1. `npm run tauri build` in `client/`
2. Launch `.exe` on a separate Windows machine on LAN
3. Verify login renders with correct local hospital branding

---

### Prompt 2 — Windows Background Service Installation

**Deliverable:** `scripts/install_service.bat`

**Using NSSM (recommended for simplicity):**
```bat
nssm install Hospital_EMR_Local_Core "C:\Program Files\nodejs\node.exe" "C:\hms\server\dist\server.js"
nssm set Hospital_EMR_Local_Core AppDirectory "C:\hms\server"
nssm set Hospital_EMR_Local_Core Start SERVICE_AUTO_START
nssm set Hospital_EMR_Local_Core AppStdout "C:\hms\logs\server_runtime.log"
nssm set Hospital_EMR_Local_Core AppStderr "C:\hms\logs\server_runtime.log"
nssm set Hospital_EMR_Local_Core AppRestartDelay 10000
```

**Testing Interval 16:**
1. Run `install_service.bat` as Administrator
2. Reboot machine
3. Open `services.msc` → verify "Hospital_EMR_Local_Core" is Running

---

## PHASE 5: CENTRAL SAAS SUPERADMIN & DEPLOYMENT MANAGEMENT PORTAL

### Prompt 1 — Superadmin Multi-Tier Deployment Schema

**Deliverable:** `database/003_tenant_configurations.sql`

**New table:** `tenant_configurations`
- Columns as specified: id, tenant_id (FK), hospital_name, address, phone_number, logo_url, currency_symbol, primary_brand_color, secondary_brand_color, ui_theme_class, deployment_mode, cloud_sync_enabled, private_supabase_url, private_supabase_anon_key, module_* toggles, license_expiration_date, updated_at
- RLS: only `auth.jwt() ->> 'role' = 'superadmin'` can write; all authenticated can read

**Testing Interval 17:**
1. Execute schema in Supabase SQL editor
2. `INSERT INTO tenant_configurations (...) VALUES (...);` with default values
3. Verify `primary_brand_color` defaults to `#2563eb`, `deployment_mode` defaults to `'CLOUD_SAAS'`
4. Verify `UPDATE` works

---

### Prompt 2 — Superadmin Control Portal

**File:** `client/src/components/SuperAdminPortal.tsx`

**Features:**
1. **Hospital Directory Grid:** Cards showing hospital name, branding, active modules, license timer, deployment badge
2. **Visual Migration Control Deck:** Segmented control:
   - Cloud SaaS → `cloud_sync_enabled: true`
   - Offline Standalone → `cloud_sync_enabled: false`, read-only
   - Private Cloud → input fields for URL + anon key
3. **Dynamic Theme Customizer:** Color picker for `primary_brand_color`, dropdown for theme class
4. **Module Toggle Pills:** On/off switches for each module

**Testing Interval 18:**
1. Open Superadmin panel
2. Select test hospital → switch to Offline Standalone → set brand color to `#7c3aed` → save
3. Query `tenant_configurations` → verify `cloud_sync_enabled = false`, `primary_brand_color = '#7c3aed'`, `deployment_mode = 'OFFLINE_STANDALONE'`

---

### Prompt 3 — Sync Daemon Migration Listener

**Deliverable:** Update `server/src/sync/syncDaemon.ts` and add `server/src/sync/migrationListener.ts`

**New behavior in each sync loop:**
1. Query `tenant_configurations` by `GLOBAL_SAAS_TENANT_ID`
2. If `deployment_mode` changed to `OFFLINE_STANDALONE`:
   - Write new config to `clinic_profile.json`
   - Set runtime `cloud_sync_enabled = false`
   - Log warning and terminate sync threads
3. If `PRIVATE_SUPABASE`:
   - Update `clinic_profile.json` with new URL + anon key
   - Set all local rows `is_synced = false` (force re-sync)
4. Always cache `primary_brand_color`, `secondary_brand_color`, `ui_theme_class` to local config

**Testing Interval 19:**
1. From Superadmin portal: toggle clinic to Offline Standalone, set wine theme `#9d174d`
2. Wait 30s for local server sync poll
3. Verify terminal prints isolation alert
4. Verify `clinic_profile.json` contains `#9d174d` and `cloud_sync_enabled: false`
5. Verify remote login blocked

---

### Prompt 4 — Local Offline Configuration Console

**Files:**
- `server/src/setup/setupConsole.ts` (serves HTML form at `GET /setup`)
- `client/src/components/SetupConsole.tsx` (optional; can be server-rendered HTML)

**Flow:**
1. Server boots without `clinic_profile.json` → serves setup page at `http://localhost:3000/setup`
2. Master token passphrase entered to unlock (hardcoded or cryptographic key)
3. Form fields: hospital name, address, phone, currency, logo upload (PNG → `C:/hms/assets/logo.png`), module checkboxes, theme color picker, deployment mode selector
4. On save: writes `clinic_profile.json`, initializes DB tables, redirects to login

**Testing Interval 20:**
1. Disconnect internet, delete `clinic_profile.json`
2. Browse to `http://localhost:3000/setup`
3. Enter master passphrase
4. Configure "Apex Clinic", Pharmacy=On, Sync=Off, amber theme `#d97706`, upload logo
5. Click Save → verify file written, DB tables created, login shows amber-themed "Apex Clinic"

---

## PHASE 6: PRODUCTION HARDENING & SECURITY

### Prompt 1 — Anti-Clock-Tampering Guard Middleware

**Deliverable:** `server/src/middleware/clockGuard.ts`

**Logic:**
```typescript
async function clockGuard(tableName: string, pool: Pool): Promise<void> {
  const result = await pool.query(
    `SELECT GREATEST(MAX(created_at), MAX(updated_at)) as max_ts FROM ${tableName}`
  );
  const maxTs = result.rows[0]?.max_ts;
  if (maxTs && new Date() < new Date(maxTs)) {
    global.clockTampered = true;
    throw new ClockTamperError('CRITICAL SECURITY EXCEPTION: System Clock Manipulation Detected. Terminal Locked.');
  }
}
```

Applied as middleware on all INSERT/UPDATE routes for patient, encounter, vitals, billing tables.

**Testing Interval 21:**
1. Insert a test encounter dated `2026-06-06`
2. Set Windows clock back to `2025-01-01`
3. Attempt to save a new vitals record
4. Verify server rejects with security error and logs alarm
5. Restore clock

---

### Prompt 2 — Database Migration & Schema Alterations Engine

**Deliverable:** `server/src/db/migrations.ts`

**Logic:**
1. On each successful sync pass, fetch a remote migration manifest from Supabase (or a JSON endpoint)
2. Compare local schema version (stored in a `_schema_version` table or the config) against remote version
3. If mismatch, download raw SQL migration script
4. Execute `ALTER TABLE` commands in a transaction
5. Update local schema version on success

**Testing Interval 22:**
1. Add a migration entry to Supabase that adds `middle_name` column to `patients`
2. Wait for sync pass
3. Verify `patients` table now has `middle_name` column locally

---

## PHASE 7: PRODUCTION COMPILATION & PACKAGING

### Prompt 1 — Electron Desktop Alternative

**Deliverable:** `scripts/electron-builder.yml`

```yaml
appId: com.sretan.emr
productName: Sretan EMR
directories:
  output: dist
  buildResources: build
files:
  - '**/*'
  - '!**/node_modules/*/{CHANGELOG.md,README.md}'
win:
  target:
    - target: nsis
      arch: [x64]
    - target: portable
      arch: [x64]
nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
extraMetadata:
  main: main.js
```

Electron `main.js` would load the client build and set `webPreferences.devtools = false` in production, with `BrowserWindow.loadURL('http://192.168.1.200:3000')` or the local build.

*Note: Phase 4/Tauri is the primary approach. Electron is an alternative.*

### Prompt 2 — Windows Background Service Installation Manifest

**Identical to Phase 4 Prompt 2.** Delivered once as `scripts/install_service.bat`. No duplication needed.

**Testing Interval 23:** Same as Testing Interval 16.

---

## Implementation Order & Dependencies

```
Phase 1 ─┬─ Prompt 1 (SQL schema) ─────────> Test 1
          └─ Prompt 2 (Express server) ────> Test 2
               │
Phase 2 ─┬─ Prompt 1 (Auth trigger SQL) ───> Test 3
          └─ Prompt 2 (Sync daemon) ────────> Test 4
               │
Phase 3 ─┬─ M0 Login ───────────────────────> Test 5
          ├─ M1 Registration ───────────────> Test 6
          ├─ M2 Triage ─────────────────────> Test 7
          ├─ M3 Consultation ───────────────> Test 8
          ├─ M4 Laboratory ─────────────────> Test 9
          ├─ M5 Pharmacy ───────────────────> Test 10
          ├─ M6 Radiology ──────────────────> Test 11
          ├─ M7 Paypoint ───────────────────> Test 12
          ├─ M8 Finance/HMO ────────────────> Test 13
          └─ M9 HR/Staff ───────────────────> Test 14
               │
Phase 4 ─┬─ Prompt 1 (Tauri config) ───────> Test 15
          └─ Prompt 2 (Service install) ────> Test 16
               │
Phase 5 ─┬─ Prompt 1 (Config schema) ──────> Test 17
          ├─ Prompt 2 (Superadmin UI) ──────> Test 18
          ├─ Prompt 3 (Migration listener) ─> Test 19
          └─ Prompt 4 (Offline console) ────> Test 20
               │
Phase 6 ─┬─ Prompt 1 (Clock guard) ────────> Test 21
          └─ Prompt 2 (Migration engine) ───> Test 22
               │
Phase 7 ─┬─ Prompt 1 (Electron config) ────> Test 23
          └─ Prompt 2 (Service install dup)
```

---

## Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| PostgreSQL | 16 | Local database |
| Node.js | 20+ | Backend + frontend runtime |
| npm / pnpm | Latest | Package management |
| Rust + Cargo | Stable | Tauri native compilation |
| Tauri CLI | 2.x | Desktop wrapper build |
| NSSM | Latest | Windows service manager |
| Supabase CLI or Dashboard | - | Cloud DB management |

---

## Per-Phase Implementation Checklist (for copy-paste to LLM)

Each phase in `Master Prompts.md` is designed to be copied verbatim as a prompt to an LLM. The response from the LLM should then be:
1. Saved to the appropriate file path in the project structure
2. Tested per the corresponding **Testing Interval** instructions
3. Iterated on if tests fail

No pre-processing or modification of the prompts is needed — they are self-contained. Just append `[STYLING & UI INSTRUCTIONS - MASTER TRUST BLUE THEME]` context when prompting for UI modules.
