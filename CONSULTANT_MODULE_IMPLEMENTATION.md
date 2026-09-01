# Consultant & Referral Module — Implementation Record

**Date:** August 26, 2026
**Plan:** `CONSULTANT_MODULE_PLAN.md`
**Scope:** Referral-based specialist consultation layer on top of the existing Doctor module. GPs refer patients to a **department**; only consultants assigned to that department see and consult referred patients. Every consultant consultation is written back to the patient chart with a **consultant tag** and the consultant's **department**.

**Status:** Implemented, tested end-to-end against the live database (PostgreSQL 16), typechecks clean (server `tsc --noEmit` + client `tsc -b`), all new client components transform via Vite.

---

## 1. Final Behaviour (as built)

1. **Departments** are first-class entities: Admin can create/edit/deactivate departments; 12 are seeded (General Medicine, Paediatrics, Gynae & Obstetrics, Surgery, Orthopaedics, ENT, Ophthalmology, Cardiology, Neurology, Dermatology, Psychiatry, Urology). Each department carries a `modules` JSONB allowlist (O&G → `["maternity"]`).
2. **Consultant role** added to staff management. Creating/editing a staff member as **Consultant** requires a **Department** (server + client enforced). Consultants can be added to any department.
3. **Referrals (GP → Department)**: a doctor (or nurse/admin/consultant) opens **Refer / Transfer** from the consultation page or patient chart. The modal shows a **searchable list of departments that have at least one active consultant**, plus **quick-pick chips** (recently used via localStorage). The user picks a department, optionally a specific consultant in it, sets a **reason** and a **priority** (Routine / Urgent / Emergency).
4. **Department-scoped visibility**: only consultants whose `department_id` matches the referral's `to_department_id` see the patient in their **Referred Patients** queue. Verified: a Cardiology referral was visible to the Cardiology consultant and invisible to the O&G consultant.
5. **Referral lifecycle**: `pending → accepted → in_consultation → completed` (plus `rejected` / `cancelled`), each transition server-validated and written to `audit_logs`. The consultant can Accept / Complete / Reject inline from the dashboard; opening a referral auto-accepts it.
6. **Consultant consultation**: opening a referred patient creates/reuses an encounter tagged `is_consultation = true`, `referral_id`, and `department_id`. The patient chart renders a **`CONSULTANT · {Department}`** indigo badge on that encounter and a **Referrals** tab showing the full referral history.
7. **Maternity for O&G**: consultants whose department `modules` include `maternity` get the Maternity sidebar links; other consultants do not.
8. **Default seed**: `consultant` / `consultant@sretan.com` / `consultant`, role Consultant, attached to **Gynae & Obstetrics** (so the Maternity access requirement is immediately demonstrable).

---

## 2. Why the change

GPs needed a specialist hand-off path. Before this module the system had a single doctor queue — everyone could see every patient, and there was no way to scope "these patients are for the Cardiology consultant". This module adds:

- a department model with consultant rostering,
- a referral/transfer record with full lifecycle and audit trail,
- a consultant-only queue strictly filtered by department,
- consultant-tagged encounters so the patient chart shows exactly which specialist and which department produced each consultation,
- department-driven module access (O&G → Maternity).

---

## 3. Database changes — `database/045…049`

All migrations are **idempotent and self-healing** (safe to re-run on every server boot; the migration runner ignores `already exists` / `duplicate column`).

### `045_departments.sql`
| Column | Type | Purpose |
|--------|------|---------|
| `id` | UUID PK | `gen_random_uuid()` |
| `tenant_id` | UUID FK | tenant isolation |
| `name` | VARCHAR(255) | department name (`UNIQUE (tenant_id, name)`) |
| `code` | VARCHAR(20) | short code (e.g. `O&G`) |
| `description` | TEXT | purpose |
| `modules` | JSONB | allowed module keys (e.g. `["maternity"]`) |
| `status` | VARCHAR(20) | `active` / `inactive` |

Seeds 12 departments per tenant via `CROSS JOIN` + `ON CONFLICT DO NOTHING`.

### `046_staff_department.sql`
`ALTER TABLE staff_users ADD COLUMN department_id UUID REFERENCES departments(id) ON DELETE SET NULL;` + index. One consultant → one department (primary); 1:N from department → consultants.

### `047_referrals.sql`
| Column | Type | Purpose |
|--------|------|---------|
| `id` | UUID PK | |
| `tenant_id` | UUID FK | |
| `referral_number` | VARCHAR(50) | `REF-YYYY-XXXXX` |
| `patient_id` | UUID FK | referred patient |
| `referred_by` | UUID FK | referring staff |
| `from_department_id` | UUID FK | referring department (optional) |
| `to_department_id` | UUID FK | target department (required) |
| `to_consultant_id` | UUID FK | optional direct consultant |
| `reason` | TEXT | clinical summary (≤ 2000 chars) |
| `priority` | VARCHAR(20) | `routine` / `urgent` / `emergency` |
| `status` | VARCHAR(30) | `pending` / `accepted` / `in_consultation` / `completed` / `rejected` / `cancelled` |
| `referral_notes` | TEXT | extra instructions / reject reason |
| `accepted_at` / `accepted_by` | TIMESTAMPTZ / UUID FK | accept audit |
| `completed_at` / `completed_by` | TIMESTAMPTZ / UUID FK | completion audit |
| `created_at` / `updated_at` | TIMESTAMPTZ | tracking + trigger |

Indexes on `patient_id`, `to_department_id`, `status`.

### `048_consultant_encounters.sql`
`ALTER TABLE encounters ADD COLUMN is_consultation BOOLEAN DEFAULT false;` + `referral_id UUID REFERENCES referrals(id) ON DELETE SET NULL` + `department_id UUID REFERENCES departments(id) ON DELETE SET NULL` + index on `referral_id`.

### `049_seed_consultant.sql`
Self-healing seed:
1. Deletes duplicate `consultant@sretan.com` accounts (keeps one per tenant, earliest).
2. Inserts a consultant for every tenant (password `consultant`, bcrypt `$2b$10$…W3CAqiV8mzX0mAVl49kSo…`, correct hash verified with `compareSync`).
3. Fixes password + department on any existing row.
4. Guarantees exactly one row keeps the username `consultant` — prefers the first-created (primary, configured) tenant; other tenants get `consultant_N`. This prevents migration `041`'s username dedup from renaming the primary consultant on subsequent boots.

---

## 4. Backend changes

### `server/src/routes/consultants.ts` (new)
All queries parameterized; all writes audited via `audit_logs`.

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/departments` | GET | List departments with active-consultant counts |
| `/api/departments/with-consultants` | GET | Departments having ≥ 1 active consultant + consultant roster — powers the referral modal |
| `/api/departments` | POST | Create department (Admin), duplicate-name 409, audited |
| `/api/departments/:id` | PUT | Update department (name/code/description/modules/status), audited |
| `/api/departments/:id` | DELETE | Soft-deactivate (`status='inactive'`) |
| `/api/referrals` | GET | List referrals (filters: status, patient_id, referred_by, to_department_id, consultant_id) |
| `/api/referrals/:id` | GET | Single referral with patient + department + consultant names |
| `/api/referrals` | POST | Create referral — priority whitelist, reason length cap, **duplicate-active-referral 409**, `to_consultant_id` must belong to target department, `REF-YYYY-XXXXX` numbering, audited |
| `/api/referrals/:id` | PUT | Edit metadata while `pending` only, audited |
| `/api/referrals/:id/accept` | PUT | `pending → accepted`, sets `accepted_by`/`accepted_at`, audited |
| `/api/referrals/:id/complete` | PUT | `pending|accepted|in_consultation → completed`, sets `completed_by`/`completed_at`, audited |
| `/api/referrals/:id/reject` | PUT | `pending|accepted → rejected` with reason, audited |
| `/api/referrals/:id/cancel` | PUT | `pending → cancelled`, audited |
| `/api/consultants/referred-patients` | GET | **Consultant queue** — requires `staff_id`; resolves the consultant's department (403 if none); returns only `pending/accepted/in_consultation` referrals to that department; priority-ordered (emergency → urgent → routine); folder-activated patients only |
| `/api/consultants/stats` | GET | Pending / accepted / in_consultation / completed / total for the consultant's department |
| `/api/consultants/encounters` | GET | Consultant's own `is_consultation=true` encounters with patient + department + referral info |
| `/api/consultants/result-notifications` | GET | Unread completed lab results (via `doctor_read_at`) + completed radiology counts for the consultant's encounters |

**Guards verified live:**
- Duplicate active referral to the same department → `409`.
- Direct consultant not in the target department → `400`.
- Invalid transition (e.g. cancel a completed referral) → `400`.
- Non-consultant / no department → `403` on queue endpoints.

### `server/src/routes/staff.ts`
- `'Consultant'` added to `VALID_ROLES`.
- `GET /api/staff` and `GET /api/staff/:id` now `LEFT JOIN departments` to return `department_id` + `department_name`.
- `POST /api/staff` accepts `department_id`; **required when role is Consultant** (400 otherwise).
- `PUT /api/staff/:id` accepts `department_id` (can clear via explicit `null`); required when role changes to Consultant.

### `server/src/routes/auth.ts`
Login now also returns `department_id`, `department_name`, `department_modules` (for the client's department-gated Maternity links).

### `server/src/routes/encounters.ts`
- `POST /api/encounters` accepts `is_consultation`, `referral_id`, `department_id`.
- `PUT /api/encounters/:id` accepts the same (with a `CASE WHEN … IS NULL THEN … END` so booleans can be set/cleared safely).
- `GET /api/encounters` `LEFT JOIN departments` to return `department_name`.

### `server/src/server.ts`
Registered `consultantsRouter`.

---

## 5. Frontend changes

### New components
| Component | Route | Purpose |
|-----------|-------|---------|
| `ReferralModal.tsx` | — | Searchable departments-with-consultants list, quick-pick chips (localStorage `recent_referral_departments`), priority pills, optional direct consultant dropdown, reason + notes, duplicate-guard error handling |
| `ConsultantDashboard.tsx` | `/consultant/dashboard`, `/consultant/patients` | Stats cards, search + status filter, paginated referred-patient queue with **Accept / Complete / Reject / Consult** actions, priority + status badges, department banner |
| `ConsultantConsultations.tsx` | `/consultant/my-consultations` | Consultant's own tagged encounters history table |
| `ConsultantConsultation.tsx` | `/consultant/consultation/:patientId` | Referral banner (priority-colored), auto-accept on open, wraps `DoctorConsultation`; encounter auto-tagged via URL params |
| `DepartmentsAdmin.tsx` | `/departments` | Admin department CRUD, module toggle pills, consultant-count chips, activate/deactivate |

### Modified components
| File | Changes |
|------|---------|
| `DoctorConsultation.tsx` | **Refer / Transfer** header button → `ReferralModal`; consultant-mode URL params (`consultant=1&referral_id=…&department_id=…`) tag encounters; consultant banner |
| `PatientChart.tsx` | `CONSULTANT · {dept}` badge on `is_consultation` encounters; **Referrals tab** (full history with priority/status badges); "Refer Patient" button; `ReferralModal` wired with refresh on success |
| `StaffManagement.tsx` | `Consultant` role added; **Department** dropdown (required for Consultant) in Add Staff modal; Department column in staff table; dept-aware error display |
| `App.tsx` | New **Consultant** sidebar category (Dashboard, Referred Patients, My Consultations) + **Departments** under Administration; routes; `DashboardRouter` → `ConsultantDashboard`; `Consultant` granted Patients / Patient Chart / Prescriptions / Results / Appointments; **Maternity links gated by `department_modules`** for consultants; consultant result-notification sidebar badge |

---

## 6. RBAC summary

| Capability | Doctor | Consultant | Nurse | Admin |
|------------|:------:|:----------:|:-----:|:-----:|
| See all patients queue | ✓ (all) | only referred to their dept | ✓ | ✓ |
| Refer / transfer patient | ✓ | ✓ | ✓ | ✓ |
| Consult referred patients | – | ✓ | – | ✓ |
| Order lab / radiology / pharmacy | ✓ | ✓ | – | ✓ |
| Full patient chart | ✓ | ✓ | ✓ | ✓ |
| Maternity access (O&G dept consultants) | ✓ | ✓ (dept modules) | ✓ | ✓ |
| Manage departments | – | – | – | ✓ |
| Create / edit consultants (+ department) | – | – | – | ✓ |

---

## 7. Seed data

| Item | Value |
|------|-------|
| Consultant username | `consultant` |
| Consultant email | `consultant@sretan.com` |
| Consultant password | `consultant` |
| Role | Consultant |
| Department | Gynae & Obstetrics (`modules: ["maternity"]`) |

`scripts/seed_users.cjs` / `.mjs` (and the synced `server/seed_users.cjs`) were made **email-idempotent** (update-if-exists instead of blind insert), so re-running them no longer duplicates accounts.

---

## 8. Testing performed

1. **Migrations** 045–049 executed against the live DB with `ON_ERROR_STOP=1`; seeded data verified (12 departments, O&G `modules`, one consultant per tenant).
2. **Login**: `consultant` / `consultant` → returns role Consultant, `department_id`, `department_name`, `department_modules`.
3. **Staff**: `POST /api/staff` creates a Consultant only with a department; duplicate name 409; `GET /api/staff` returns `department_name`.
4. **Departments**: create, duplicate-409, soft-deactivate, `with-consultants` returns only departments with active consultants.
5. **Referral flow**: create → duplicate-409 guard → consultant queue shows it → accept → tagged encounter (`is_consultation`, `referral_id`, `department_id`) → complete → disappears from queue.
6. **Invalid transitions** rejected (400); **consultant-belongs-to-department** guard (400); **audit_logs** rows written for referral INSERT + every transition.
7. **Department scoping**: Cardiology referral visible to Cardiology consultant, invisible to O&G consultant (verified with a temporary second consultant, removed after).
8. **Seed idempotency**: re-running `049` and `seed_users.cjs` updates rather than duplicates (count verified).
9. **Typechecks**: server `npx tsc --noEmit` clean; client `npx tsc -b` clean; all new/modified components return HTTP 200 from the Vite module transformer.
10. **Cleanup**: all test referrals/encounters/consultants removed after verification.

---

## 9. Suggested follow-ups (from the plan, not yet built)

- Referral letter/PDF print slip
- SLA tracking (time to accept / complete)
- Appointments per specific consultant
- Multi-department consultants (`staff_departments` join table)
- Referral reports page
- Insurance billing of consultation fees (`/insurance/bill-to-insurance`)
- Paypoint consultation-fee integration (`service_type='consultation'`)

---

## 10. Session 2026-08-26 (cont.) — Consultation page restructure + referral lifecycle

### 10.1 Consultation page
- **`ConsultantConsultation.tsx`** now wraps `DoctorConsultation` and passes the loaded referral object as a prop (no duplicate banner). On open it **auto-accepts** a pending referral, then transitions it to **`in_consultation`** (new `PUT /api/referrals/:id/start` endpoint: `pending|accepted → in_consultation`).
- **`DoctorConsultation.tsx`** takes an optional `referral` prop. The old generic "Consultant Consultation" banner was removed; instead a **full referral banner** renders when a consultant opens a referred patient:
  - Referral number, priority badge (routine/urgent/emergency), status badge, target department
  - Reason, **Referred by**, **Accepted by (name + date)**, named consultant (if any)
  - **"Complete Consultation"** button (when not completed) → `PUT /api/referrals/:id/complete` → closes the referral and navigates back to the consultant dashboard. When completed it shows a "Referral closed" chip.
- `GET /api/referrals`, `GET /api/referrals/:id`, and `GET /api/consultants/referred-patients` now join `staff_users` for **`accepted_by_name`** and **`completed_by_name`**.

### 10.2 Normal hospital referral flow (as implemented)
```
1. GP refers patient → referral status = pending
2. Consultant opens referral → auto-accepted (accepted_by, accepted_at recorded)
3. Consultation starts → status = in_consultation
4. Consultant sees the patient, orders labs/radiology/Rx (encounter tagged is_consultation + department)
5. Consultant clicks "Complete Consultation" → status = completed (completed_by, completed_at recorded)
6. Patient leaves the consultant queue; the referral history in the patient chart shows the full trail
   (referred by → accepted by → completed by), and the chart tag reflects "completed".
```
- Consultant dashboard queue shows **Accepted by (name + date)** per row and only allows **Consult** once accepted/in_consultation (per the revision plan).

### 10.3 Files changed
- `server/src/routes/consultants.ts` — `start` endpoint + `accepted_by_name`/`completed_by_name` joins
- `client/src/components/ConsultantConsultation.tsx` — prop pass-through + auto-start
- `client/src/components/DoctorConsultation.tsx` — referral banner + Complete Consultation action
- `client/src/components/ConsultantDashboard.tsx` — accepted-by display in queue
- `client/src/components/PatientChart.tsx` — `in_consultation` status badge + accepted/completed-by lines in referral history

---

## 11. Session 2026-08-26 (cont.) — Revision Plan v2 fully implemented

### 11.1 Database — migration `050_referrals_outcome_notifications.sql`
- `referrals.outcome_note TEXT` — consultant's completion summary.
- New `notifications` table (recipient, type, title, message, ref_table/ref_id, patient_id, is_read, created_at) + indexes on `(recipient_id, is_read)` and `(tenant_id, created_at DESC)`.

### 11.2 Server — notifications + referral endpoints
- **`server/src/routes/notifications.ts` (new)**:
  - `GET /api/notifications?recipient_id&unread_only` — list (joins patient name/hospital number).
  - `GET /api/notifications/unread-count?recipient_id`.
  - `PUT /api/notifications/mark-read` (ids + optional recipient) and `PUT /api/notifications/mark-all-read`.
- **`consultants.ts`**:
  - Notification triggers: on referral **created** → notify active consultants in the target department; on **accept / complete / reject / cancel** → notify the referring GP (messages include patient + department + actor name).
  - `PUT /api/referrals/:id/complete` now accepts `outcome_note` and persists it.
  - **`GET /api/referrals/stats`** (per-status counts, filterable by `referred_by`) and **`GET /api/referrals/dashboard`** (referrer's list with search/status) — placed **before** the `:id` route to avoid Express shadowing.
- **`encounters.ts`**: `POST /api/encounters` with a `referral_id` blocks when the referral is `pending` (400 "Accept the referral before consulting").
- Registered `notificationsRouter` in `server.ts`.

### 11.3 Client — new components
- **`CompleteConsultationModal.tsx`** — styled replacement for `window.confirm`: patient + referral summary, department + priority, **order counts** (lab/radiology/Rx from the active consultation), amber warning ("returns patient to referring doctor"), optional **Outcome Summary** textarea (prefilled from SOAP assessment/plan), loading + success → navigate to consultant dashboard. Wired into `DoctorConsultation`.
- **`NotificationBell.tsx`** — sidebar bell with unread badge, dropdown list (type-styled icons), mark-all-read, single-item open → navigates to patient chart, 30s polling + focus refresh. Mounted in the Sidebar user card for all roles.
- **`ReferralManagement.tsx`** (`/referrals`) — the doctor's comprehensive referral page: stats cards, tabs (All/Pending/Accepted/In Consultation/Completed/Rejected/Cancelled), search, table (patient, referral #, department, priority, status, accepted-by, date), View Chart + View Detail, New Referral (opens `ReferralModal` with a **patient picker**), Cancel pending referral.
- **`ReferralDetailModal.tsx`** — full timeline (Referred → Accepted → In Consultation → Completed + rejected/cancelled), reason, **outcome note**, rejection reason, **Print referral slip** (`utils/printReferral.ts`).
- **`ReferredPatients.tsx`** (`/consultant/patients`) — the comprehensive consultant queue, split from the dashboard: tabs (Active / Completed / Rejected-Cancelled), priority filter, search, **status-gated actions** (pending → Accept/Reject only; accepted/in_consultation → Consult; completed → View Outcome), accepted-by/date, referral detail modal.

### 11.4 Client — changes to existing
- **`ConsultantDashboard.tsx`** — refactored into a real dashboard: stats, **emergency-pending alert banner**, quick actions, **recent referred patients**, **referrals I sent** (uses new `/referrals/dashboard`).
- **`DoctorConsultation.tsx`** — Complete Consultation button now opens `CompleteConsultationModal` (removed `window.confirm`).
- **`ReferralModal.tsx`** — supports opening **without** a patientId: shows a patient search picker (`/patients/search`); added **referral reason template chips**.
- **`DoctorDashboard.tsx`** — added **Referrals** quick action.
- **`App.tsx`** — routes `/referrals` (Doctor/Nurse/Consultant/Admin) and `/consultant/patients` → `ReferredPatients`; sidebar **Consultant category sorted first** for Consultant role (fixes "Results first"); **Consult gating** in the queue (Consult only after acceptance).

### 11.5 Verified end-to-end
- Full lifecycle with notifications: referral created → consultant notified ("New referral received") → pending-consult guard 400 → accept → GP notified ("Referral accepted") → start (in_consultation) → encounter created (tagged) → complete with outcome_note → GP notified ("Consultation completed") → queue empties → mark-all-read → unread=0 → detail returns outcome_note. All test data cleaned; server + client typecheck/build pass; all 12 new/modified components return 200 via Vite.

---

## 12. Session 2026-08-27 — Consultation polish (5 fixes)

### 12.1 Complete Consultation modal — order counts corrected
- Counts now filter to **consultant-placed orders only**: `allLabOrders.filter(o => o.is_consultation || o.doctor_role === 'Consultant')` (and same for radiology/prescriptions). Normal doctor orders for the same patient are excluded.

### 12.2 Notification bell popup fixed
- The popup previously opened with `right-0 mt-2` from the sidebar-footer bell → it rendered off-screen/left of the viewport. Now it opens with `left-full bottom-0 ml-2` (to the right of the bell, aligned to its bottom) with `z-[90]`, so it appears in the main content area and is fully visible.

### 12.3 My Consultations page comprehensive
- `GET /api/consultants/encounters` now also returns `sex`, `dob`, `phone`, `staff_role`, `referral_status`, `referral_reason`, `outcome_note`, `referral_created_at`.
- The page now shows **SOAP summary**, diagnosis count, **outcome note**, referral status + priority, and a **detail modal** with full SOAP fields, diagnoses, referral reason, outcome, and **orders placed** (lab/radiology/prescriptions with statuses) loaded per encounter.

### 12.4 Auto-save draft for consultation textboxes
- `DoctorConsultation.tsx` persists every keystroke as a **localStorage draft** keyed by `staff + patient + encounter_type`, restoring the text on revisit and clearing on submit:
  - SOAP fields: `subjective, objective, assessment, plan, notes` (each saved when non-empty) + pending diagnoses.
  - Lab: test name + doctor comment. Radiology: imaging type + doctor comment. Prescription: drug, dosage, instructions.
- Applies to doctor, consultant, and maternity consultations (all use `DoctorConsultation`).

### 12.5 Consultation report for the referring doctor
- New **`GET /api/referrals/:id/consultation-report`**: returns the referral (with patient/referred-by/accepted-by/departments/outcome) + all consultant encounters (full SOAP + diagnoses + staff + department) + all lab orders, radiology orders, and prescriptions linked to those encounters.
- New **`ConsultationReport.tsx`** modal renders the complete picture (SOAP, diagnoses, orders with statuses, outcome). Accessible via **"Consultation Report"** button in `ReferralDetailModal` (both from the doctor's Referral Management page and the consultant's Referred Patients page).
- Notifications deep-link: `referral_created` → consultant's referred-patients; all others → patient chart (referral history shows the full trail).

### 12.6 Files changed (this session)
- `server/src/routes/consultants.ts` — `consultation-report` endpoint; richer `consultants/encounters` query
- `client/src/components/DoctorConsultation.tsx` — filtered order counts; SOAP/order draft auto-save + restore + clear
- `client/src/components/NotificationBell.tsx` — popup positioning + type-aware deep-links
- `client/src/components/ConsultantConsultations.tsx` — rewritten comprehensive page + detail modal
- `client/src/components/ConsultationReport.tsx` (new) — report modal
- `client/src/components/ReferralDetailModal.tsx` — "Consultation Report" button

### 12.7 Bug fix — ICD-11 diagnoses draft auto-save

**Reported:** adding an ICD-11 diagnosis in the consultation did not persist (it was lost after reload/navigation).

**Root cause:** in `DoctorConsultation.tsx`, the diagnoses draft-save effect ran with the initial empty `pendingDiagnoses` **on mount** and called `localStorage.removeItem('…_diagnoses')` — wiping any previously saved diagnosis list — *before* the delayed `loadDraft()` (300 ms) could restore it. SOAP text wasn't affected because no mount effect removed those keys.

**Fix:** introduced `draftLoadedRef`:
- `loadDraft` is invoked after a 300 ms delay on patient load, then `draftLoadedRef.current = true`.
- The diagnoses-save effect now **skips both write and remove until `draftLoadedRef.current` is true**, and returns early while `!draftLoadedRef.current`. This prevents (a) the mount-time empty state from erasing the saved list, and (b) switching patients from writing one patient's diagnoses under another patient's draft key.
- Diagnoses added via the SOAP-tab ICD picker or the ICD-11 confirmation modal both update `pendingDiagnoses`, which persists through the guarded effect; restoring on revisit and clearing on SOAP submit remain unchanged.

---

## 13. Session 2026-08-27 (cont.) — SOAP clear + maternity draft + patient chart Refer/Transfer

### 13.1 Maternity consultation auto-save draft
- `MaternityPatientDetail.tsx` now has the same **auto-save draft** system as `DoctorConsultation`: every keystroke in the SOAP fields (subjective/objective/assessment/plan/notes) + ICD-11 pending diagnoses persists to localStorage (keyed `sretan_maternity_draft_{staff}_{maternityId}`), restores on revisit (guarded by `draftLoadedRef` to avoid mount-time wipe), and **clears after the doctor clicks Save**.

### 13.2 SOAP clear after save (all consultation pages)
- Verified and retained for `DoctorConsultation` (`/consultation/:patientId`, consultant wrapper, maternity via `?type=maternity`): on successful SOAP submit → `clearDraft()` → `setSoap(emptySoap)` → `setPendingDiagnoses([])` → textboxes empty.
- Maternity page: `clearSoapDraft()` → `setSoap(emptySoap)` → `setPendingDiagnoses([])`.
- The draft system restores text on revisit but clears on submit in every consultation flow.

### 13.3 Refer/Transfer on patient charts (doctors & consultants only)
- **`PatientChart.tsx`**: added a **Refer / Transfer** button in the header actions (visible only to `Doctor` / `Consultant`), and tightened the Referrals-tab "Refer Patient" button gating from `(Doctor|Nurse|Admin|Consultant)` to `(Doctor|Consultant)` only.
- **`MaternityPatientDetail.tsx`**: added **Refer / Transfer** button in the header for `Doctor` / `Consultant`, wired to `ReferralModal` with the patient's `patient_id` / `full_name`.
- **`DoctorConsultation.tsx`** already had its header Refer / Transfer button.

### 13.4 Files changed
- `client/src/components/MaternityPatientDetail.tsx` — maternity SOAP draft (save/load/clear) + Refer/Transfer button
- `client/src/components/PatientChart.tsx` — header Refer/Transfer button + tightened Referrals-tab gating

---

## 14. Session 2026-08-27 (cont.) — Option A: multiple SOAP notes per encounter + autosave fixes

### 14.1 The problem solved
Writing a consultation twice in a day **overwrote** the old note because `soap_notes`/`diagnoses` were single JSONB columns on the encounter row and each save did `PUT /encounters/:id`. Orders (lab/radiology/Rx) grouped correctly by `encounter_id`, but notes could not.

### 14.2 Migration `051_encounter_notes.sql`
- New `encounter_notes` table: `encounter_id` (FK), `staff_id`, `chief_complaint`, `soap_notes` JSONB, `diagnoses` JSONB, timestamps + sync columns.
- **Backfill**: existing `encounters.soap_notes`/`diagnoses` copied in as the first note per encounter (idempotent `NOT EXISTS` guard). 16 notes backfilled on the live DB.

### 14.3 Server changes (`encounters.ts`, `patients.ts`, `consultants.ts`)
- **`POST /api/encounters/ensure`** — find-or-create today's encounter:
  - Consultant (has `referral_id`): reuse the encounter for that referral.
  - Maternity (`maternity_patient_id`): reuse by patient + staff + type + maternity patient + day.
  - Normal: reuse by patient + staff + type + same calendar day.
  - Returns `{ id, created }`; only inserts when none exists.
- **`GET /api/encounter-notes`** (by `encounter_id` or `patient_id`) and **`POST /api/encounter-notes`** — append a new note (INSERT, never overwrite) + audit log + keeps the parent `encounters.soap_notes`/`diagnoses`/`chief_complaint` synced to the latest note for backward compatibility.
- **`GET /api/encounters`**, **`GET /api/patients/:id`**, **`GET /api/consultants/encounters`**, **`GET /api/referrals/:id/consultation-report`** now attach a `notes[]` array to each encounter.

### 14.4 Client changes
- **Autosave last-character bug fixed**: `saveDraft(field, value)` now receives the exact typed value (previously `handleSoapChange` called `setSoap` then `saveDraft()` which read stale state from closure → the last keystroke was lost on refresh). Applied in `DoctorConsultation.tsx` and `MaternityPatientDetail.tsx`.
- **`DoctorConsultation.tsx`** (normal + consultant + maternity `?type=`): `ensureEncounter` → `POST /encounters/ensure` (same-day reuse); `handleSoapSubmit` → `POST /encounter-notes` (append). Draft clears on save; textboxes empty.
- **`MaternityPatientDetail.tsx`**: same — `ensureEncounter` → ensure endpoint; `handleSOAPSubmit` → `POST /encounter-notes`.
- **Display all notes** (grouped under each encounter, each with author + timestamp):
  - `PatientChart` encounter details modal.
  - `DoctorConsultation` timeline encounter detail modal.
  - `MaternityPatientDetail` consultation detail modal + summary list.
  - `ConsultantConsultations` detail modal.
  - `ConsultationReport` per-encounter SOAP section.

### 14.5 Verified end-to-end
- Two consultations in one day by the same doctor → **one encounter, two notes preserved** (morning + evening), patient chart shows both, `encounter.soap_notes` synced to latest.
- Consultant: two notes under the referral encounter, report includes `notes[]`.
- Maternity: ensure reuses the maternity encounter; note appended.
- Server `tsc --noEmit` + client `tsc --noEmit`/`tsc -b` pass; all 5 modified components return 200 via Vite; no leftover test data.

---

### 14.6 Notes-only saves + notes-only display everywhere

- **Validation relaxed (all SOAP forms):**
  - `DoctorConsultation.tsx` `handleSoapSubmit` now allows a save when **only `notes`** is filled (`allBlank = !S && !O && !A && !P && !notes`); blocks only when everything is blank.
  - `MaternityPatientDetail.tsx` Save button enabled when `notes` is filled even if S/O/A/P are empty (disabled only when all five + diagnoses are empty).
- **Display filters now include `notes`** so a notes-only consultation appears:
  - `PatientChart` `soapEncounters` + Encounters tab count.
  - `MaternityANCWorklist` encounter cards.
  - `MaternityPatientDetail` encounter cards + encounters list.
  - `ConsultantConsultations` `soapSummary`.
- Verified E2E: notes-only save persists in the `encounter_notes` array and syncs to `encounters.soap_notes` (so all existing chart displays show it); client build + transforms pass; no leftover test data.

## 15. Session 2026-08-27 (cont.) — Doctors in department receive referrals + refined duplicates + search fix

### 15.1 Referral modal now lists departments with doctors too
- `GET /api/departments/with-consultants` now returns departments with ≥1 active **Doctor OR Consultant**; adds `staff_count` and `role` on each staff member.
- `ReferralModal.tsx` labels updated to "doctors / consultants", the specific-staff dropdown includes doctors (prefixed "Dr."), and department cards show combined counts. This also fixes the perceived broken search: previously only 1 department (with a consultant) appeared, so filtering looked broken.

### 15.2 All doctors + consultants in the department see & get notified
- `resolveConsultantDepartment` now accepts **Doctor** and **Consultant** roles, so `/api/consultants/referred-patients` and `/api/consultants/stats` work for any clinical staff member in the department.
- Referral-created notifications now go to **all active Doctors + Consultants** in the target department (not just consultants).
- `Referred Patients` page (`/consultant/patients`) and its sidebar link now include the **Doctor** role.

### 15.3 Refined duplicate-guard (no duplicates while active; completed unlocks)
- **Department-level referral** (no specific staff): blocked with 409 if **any active referral** to that department exists.
- **Direct-to-staff referral** (`to_consultant_id`): blocked with 409 only if the **same staff member** already has an active referral for the patient.
- This allows: referring a *different* doctor/consultant in the same department, or referring to another department — while preventing repeat referrals to the same department or the same person until the consultation is completed.

### 15.4 Verified E2E
- Department referral → both the doctor and the consultant in the department receive a notification and both see the patient in the queue.
- Duplicate department referral → 409. Duplicate same-consultant → 409. Direct referral to a different consultant in the same dept → allowed. Another department → allowed.
- Server + client typecheck/build pass; ReferralModal transforms via Vite.

## 16. Session 2026-08-27 (cont.) — Referral modal staff dedupe, name prefix, auto-expand notes

### 16.1 Staff de-duplication in the referral modal
- `GET /api/departments/with-consultants` now de-duplicates staff by email (`DISTINCT ON (LOWER(email))`), so leftover duplicate seed accounts no longer appear multiple times. Verified: O&G now shows `staff=2` (Dr. Consultant + Dr. Sarah Johnson) instead of 5.

### 16.2 "Dr. Dr." name prefix fixed
- `ReferralModal` added `displayStaffName()` which only prefixes "Dr. " when the stored name doesn't already start with "Dr." — fixes "Dr. Dr. Sarah Johnson".

### 16.3 Additional Notes auto-expands past 3 lines
- The Additional Notes textarea now uses a `useRef` + auto-grow effect (min height ≈ 3 lines, grows with content, `overflow-hidden`, `resize-none`). Applies to every Refer / Transfer Patient modal (single shared component).

## 17. Session 2026-08-28 — self-referral blocked + staff consolidation + modal polish

### 17.1 Root cause: duplicate staff accounts
- The "still seeing myself" bug was caused by **duplicate staff accounts with the same email** (leftover from earlier seed runs): login returned one id while the referral dropdown dedup kept a *different* id for the same person, so `c.id !== currentStaffId` missed it.
- New **migration `052_consolidate_staff_duplicates.sql`**: collapses duplicate `staff_users` rows by email into one canonical account (prefers the plain-username login account), dynamically remaps **every FK column** referencing `staff_users` via `pg_constraint` + dynamic SQL, and deletes the extras. Idempotent.
  - Note: `encounters.staff_id` had **no FK constraint**, so it was manually remapped after the migration (67 rows → canonical doctor id).
  - Result: exactly one `doctor@sretan.com` account remains, and its id matches the login id and the dropdown id.

### 17.2 Self-referral fully prevented
- **Client:** `ReferralModal` now filters the "refer to specific doctor / consultant" dropdown with `notSelf()` — excludes by id **and** by email (belt-and-suspenders for any residual duplicate).
- **Server:** `POST /api/referrals` rejects `to_consultant_id === referred_by` with `400 "You cannot refer a patient to yourself"` (verified).

### 17.3 Modal polish
- Referral reason template chips enlarged from `text-[10px]` to `text-xs` with larger padding.
- The specific-staff dropdown's default option changed to **"Consultant / Any doctor in {Department}"**.

---

## 18. Session 2026-08-28 — referrals pagination, report button, insurance guard, modal counts

### 18.1 `/referrals` pagination 25/page
- `ReferralManagement.tsx` `PER_PAGE` changed from 30 → **25**. Page already resets on tab/search changes.

### 18.2 Patient chart — "View Report" for completed referrals
- In the patient chart's **Referrals tab**, each **completed** referral now shows a **View Report** button that opens `ConsultationReport` for that exact referral (shows the consultant's encounters, full SOAP notes, diagnoses, orders, and outcome).

### 18.3 Insurance access restricted
- New **`InsuranceGuard.tsx`**: the `/insurance/*` portal now only allows **insurance staff** (`user_type === 'insurance_staff'`) or **Admin**; everyone else is redirected to `/insurance/login`.
- In the patient chart's **Insurance tab**, the **"View Full Insurance Details"** link is shown **only to Admin** (insurance staff use their own portal).
- All `/insurance/*` routes wrapped in `InsuranceGuard`.

### 18.4 Referral modal — top 5 departments + proper counts
- `GET /api/departments/with-consultants` now also returns `doctor_count` and `consultant_count` (separately, de-duplicated by email).
- The modal shows the **top 5 departments by total staff** by default; **searching shows all matching departments**.
- The department cards now read like **"1 consultant / 1 doctor"** / **"0 consultants / 3 doctors"** with correct singular/plural (`s` only when the count isn't 1).

### 18.5 Verified E2E
- Completed referral → report endpoint serves encounters + SOAP + outcome; chart status `completed` drives the View Report button.
- Server + client typecheck/build pass; all 5 modified components + `InsuranceGuard` transform via Vite; no leftover test data.

---

## 19. Session 2026-08-28 — Referral modal polish (dropdown icon, quick picks, reason autosave/autoexpand/clear)

### 19.1 "Consultant / Any doctor in X" option
- The custom staff dropdown's default option now shows a **Users icon** and uses the **same slate-700 text colour as the doctor list options**, so it reads as a selectable option — both in the closed button and the open dropdown list.

### 19.2 Quick picks behaviour
- Quick picks section is **hidden entirely when a department is selected** (only rendered on the department-selection screen).
- If there are **no quick picks**, the section doesn't render at all.

### 19.3 Referral Reason box
- **Auto-expands** past 3 lines as the user types (same auto-grow as Additional Notes).
- **Auto-saves per doctor + patient** to localStorage (`sretan_referral_draft_{staff}_{patient}`), restores when the modal reopens for the same patient, and is **cleared on submit**.
- A **Clear** button appears beside the label whenever there is text in the box.

### 19.4 Behaviour review
- Quick picks reset to the selection screen when a dept is chosen; consultant selection resets on dept change; staff dropdown uses the onBlur+onMouseDown pattern; self is excluded from the staff list by id + email.

## 20. Session 2026-08-28 — Collapsible long referral reasons everywhere

### 20.1 Reusable `CollapsibleReason` component
- New shared component clamps free-text to 3 lines (`line-clamp-3`) when longer than 180 characters, with a **"Show full reason / Show less"** toggle. Uses `whitespace-pre-wrap` + `break-words`.

### 20.2 Applied to every free-text referral reason location
- `DoctorConsultation` consultant banner (was inline, now shared).
- `ConsultantConsultations` detail modal (`referral_reason`).
- `ConsultationReport` (referral reason).
- `ReferralDetailModal` (referral reason).
- `PatientChart` referral history card (`r.reason`).

### 20.3 Tables intentionally keep truncate + tooltip
- `ReferralManagement` and `ReferredPatients` list rows keep the single-line `truncate` + `title` tooltip — appropriate for table cells (a toggle per row would clutter the grid); long text is still fully readable on hover.

## 21. Session 2026-08-28 — Completed referrals "View Outcome" opens full report

### 21.1 Change
- In `/consultant/patients` **Completed** tab, the **View Outcome** button now opens the **`ConsultationReport`** modal directly for that referral (previously it opened the referral timeline modal).
- The report shows everything the consultant did: referral summary, collapsible reason, **Consultant Outcome**, every consultant encounter with full SOAP notes + diagnoses, and all orders (lab / radiology / prescriptions) with statuses.
- Clicking the referral number still opens the timeline (`ReferralDetailModal`).

### 21.2 Verified
- For a completed referral, `consultation-report` returns all consultant encounters + notes + orders; the Completed tab maps them and the button opens the comprehensive report.

## 22. Session 2026-08-28 — Larger, readable SOAP notes everywhere

### 22.1 Problem
SOAP note body text was rendered at `text-xs` in several modals/cards and lacked `whitespace-pre-wrap` + `break-words` in others — small and unreadable for long (200–500+ word) notes.

### 22.2 Changes (all SOAP display locations)
Bumped SOAP body text to `text-[15px]` with `leading-relaxed`, `text-slate-800`, `whitespace-pre-wrap`, and `break-words`:
- `ConsultationReport` — consultant encounters SOAP fields.
- `ConsultantConsultations` — detail modal SOAP fields.
- `PatientChart` — encounter details modal SOAP fields + Summary-tab encounter SOAP.
- `DoctorConsultation` — timeline encounter detail modal SOAP fields.
- `MaternityPatientDetail` — consultation detail modal SOAP fields + encounter summary cards (S/O/A/P/N) + encounters list.
- `MaternityANCWorklist` — encounter summary cards (S/O/A/P/N).

Compact timeline/preview rows that intentionally truncate (e.g. `line-clamp-2` subjective previews) were left as-is — they're previews; the full text is available in the detail modals (now larger).

### 22.3 Verified
- Client typecheck + build clean; all 6 modified components transform via Vite; servers healthy.

---

## 23. Session 2026-08-28 — Stylish pagination, sidebar cleanup, in-consultation chart modal

### 23.1 Shared stylish Pagination (25/page, no overflow)
- New **`Pagination.tsx`** shared component: numbered page buttons, Prev/Next, and a "Showing X–Y of N records" count. Compact and overflow-safe.
- **`/referrals`** (`ReferralManagement`) and **`/consultant/patients`** (`ReferredPatients`) both use it; `ReferredPatients` `PER_PAGE` changed **30 → 25**. `/referrals` was already 25.

### 23.2 Sidebar: Consultation link removed
- Removed the **Consultation** sidebar menu item (`/consultation`). Doctors still start consultations via the patient list / doctor dashboard ("Consult" buttons navigate to `/consultation/:patientId`). The `/consultation` routes remain.

### 23.3 Chart button in consultation → wide responsive modal
- Added a **Chart** button in the consultation header (both normal doctor and consultant) that opens **`ChartModal`** — a wide (`max-w-6xl`, ~92vh) responsive modal rendering the **patient chart entirely inside the modal** without leaving the consultation page.
- `PatientChart` and `MaternityPatientDetail` now accept optional `patientId` / `id` props so they can be embedded (route params still work unchanged).
- When the patient has a **maternity record**, the modal shows a **Maternity Chart / Standard Chart** toggle: "Maternity Chart" opens `MaternityPatientDetail`; "Standard Chart" opens the normal `PatientChart`. If no maternity record, it opens the standard chart directly.

### 23.4 Verified
- Client typecheck + build clean; all 8 new/modified components + App transform via Vite; servers healthy; doctors can still reach consultation from patient list/dashboard.

## 24. Session 2026-08-28 — Popup chart polish (maternity tab, consultant-as-doctor, timeline label, action buttons)

### 24.1 Maternity popup chart
- The **Consultation tab is hidden** in the maternity chart when rendered inside the popup (`hideBack` mode).
- **Consultant is treated as a Doctor** for maternity: `isDoctor` (and `canEdit`) now include `role === 'Consultant'`, so consultants can access the maternity consultation tab/actions outside the popup.

### 24.2 Historical Timeline label
- Maternity encounters in the consultation **Historical Timeline** now display as **"CONSULTATION (MATERNITY)"** (was lowercase `maternity`), also reflected in the timeline detail modal's Type field.

### 24.3 Popup chart action buttons hidden
- In **all popup chart modals** (both `ChartModal` views — standard and maternity, for doctors and consultants), the action buttons are hidden: **Record Vitals, Consult, Refer / Transfer, Admit for Labour, Record ANC Vitals**. Popups are read-only views; the close (X) is the only way out. These remain available on the full-page charts.

### 24.4 Verified
- Client typecheck + build clean; 4 modified components transform via Vite; server healthy.

## 25. Session 2026-08-28 — Unviewed-completed badge + type-aware notification routing

### 25.1 Unviewed completed referrals badge
- Migration **`053_referral_views.sql`**: per-user `referral_views (referral_id, user_id)` tracking.
- New endpoints:
  - `GET /api/consultants/completed-unviewed-count?staff_id=X` — completed referrals in the user's department not yet viewed.
  - `PUT /api/referrals/:id/view` — mark one viewed (`user_id`).
  - `PUT /api/referrals/mark-all-viewed` — mark all completed in the department viewed (registered before the `:id` route to avoid shadowing).
- Sidebar **Referred Patients** link (Consultant + Doctor in a department) shows a **green counter badge only when the count is > 1**.
- Badge decreases when the user views a report (mark single) or opens the **Completed tab** (mark-all). Polled with the existing sidebar interval.

### 25.2 Type-aware notification routing
- `NotificationBell.openNotification` now routes by type:
  - `referral_created` → `/consultant/patients` (the queue).
  - `referral_completed` → `/patient/:id?tab=referrals&report=<refId>` (Referrals tab + auto-opens the consultation report).
  - `referral_accepted` / `referral_rejected` / `referral_cancelled` → `/patient/:id?tab=referrals` (referrals tab).
- `PatientChart` reads `?tab=referrals` (opens Referrals tab on load) and `?report=<id>` (auto-opens the ConsultationReport).

### 25.3 Verified E2E
- 3 unviewed → view 1 → 2 (decreased) → mark-all → 0. Badge hidden at 0 and 1, shown at 2+.
- Server + client typecheck/build clean; 4 client components transform via Vite; servers healthy.

## 26. Session 2026-08-28 — Consultant maternity/consult gating + follow-up indicators

### 26.1 Book Pregnancy hidden from consultants
- Removed `Consultant` from the **Book Pregnancy** sidebar link and its route (`/maternity/booking`). Consultants can't book pregnancies.

### 26.2 Consultant "Consult" gated by referral
- **PatientChart**: consultants see the **Consult** button only when the patient has an **active referral to their department** (`isPatientReferredToMe` checks pending/accepted/in_consultation referrals to the consultant's `department_id`).
- **MaternityPatientDetail**: same rule — the **Consult** button shows for consultants only when the patient is actively referred to their department (lightweight referral fetch on load).

### 26.3 Maternity access = O&G consultants only
- Sidebar already gates the Maternity category to consultants whose `department_modules` include `maternity`.
- New **`MaternityGuard`** wraps all Consultant-accessible maternity routes: non-O&G consultants are redirected to `/dashboard`.

### 26.4 My Consultations department column
- `ConsultantConsultations` department column now shows the **plain department name** (indigo chip with Building icon), not the `CONSULTANT · Dept` tag. (The tag remains inside the detail modal.)

### 26.5 Nurse ↔ Doctor follow-up indicators
- `GET /api/patients` now returns per-patient **recent activity**: `last_vitals_at/by`, `last_consultation_at/by` (computed via vitals→encounter joins and latest encounters).
- **DoctorDashboard** queue rows show chips: "Vitals 18 Aug 11:35 by Nurse Michael Chen" and "Consulted 27 Aug 22:14 by Dr. Consultant".
- **TriageStation** (nurse) queue cards show the same **Consulted by …** and **Vitals by …** chips, so nurses instantly see which patients a doctor just consulted and doctors see which patients were triaged/vitals recorded — no searching needed.
- This is the foundation; the same fields flow to MyPatients/patient lists automatically.

## 27. Session 2026-08-29 — Active Patients board

### 27.1 Server: `GET /api/patients/active`
- Returns active patients (checked_in / in_triage / waiting / with_doctor **or** with an active admission), each with:
  - Recent activity: `last_vitals_at/by`, `last_consultation_at/by`, `last_activity_at` (greatest of last vitals/consultation).
  - Admission context: `admission_id`, `ward_name`, `bed_number`, `admitted_at`, `admitted_by_name` (LATERAL join on the active admission).
- Query params: `since` (`1h` / `24h` / `3d`), `segment` (`admitted`, `vitals_today`, `consulted`, `with_doctor`, `waiting`, `in_triage`), `search`, `dept`.
- Sorted by `last_activity_at DESC` (activity-first), respects `folder_activated`.

### 27.2 Client: `ActivePatients` component
- Segment tabs: **All Active · In Bed · With Doctor · Vitals Today · Consulted Today · Waiting · In Triage**.
- **Since** filter (all time / 1h / 24h / 3d) + search + refresh.
- Cards show composite status: **In Bed — ward/bed**, **Consulted {time} by {name}**, **Vitals {time} by {name}**, plus an amber **"Awaiting doctor review"** hint when vitals were recorded after the last consultation.
- Quick actions: **Chart** (always), **Consult** (Doctor/Consultant). Last-activity timestamp per card.

### 27.3 Wired in
- **`/patients`** (MyPatients): new **Active Patients** tab (green) alongside All/My Patients.
- **DoctorDashboard**: new **Active Patients** board below the Patient Queue.
- **TriageStation** (nurse): new **Active Patients** tab.

### 27.4 Verified E2E
- Live vitals entry today → `vitals_today` = 1 and `since=1h` = 1 for that patient; `admitted` segment returns admitted patients with ward/bed; search + since filters work; direct SQL matches API. (Earlier 0s were from a test patient with `folder_activated=false`, correctly excluded.)
- Server + client typecheck/build clean; 4 components transform via Vite; servers healthy.

## 28. Session 2026-08-29 — Active Patients tab first/default + 30-per-page pagination

### 28.1 Active Patients tab is first & default
- In `/patients` (MyPatients), the **Active Patients** tab is now the **first** tab button and the **default** active tab (`useState('active')`).

### 28.2 Sort by newest activity
- `ActivePatients` client-side **sorts by `last_activity_at DESC`** (vitals or consultations), reinforcing the server ordering.

### 28.3 Pagination (30/page, stylish) in all /patients tabs
- Shared `Pagination` component now accepts `perPage` (default 25).
- **Active Patients** tab: 30/page pagination.
- **All Patients** and **My Patients** tabs: 30/page pagination.
- Page resets on search, status filter, and tab changes.

## 29. Session 2026-08-29 — Discharge from Ward on Active Patients

- **ActivePatients** cards now show a red **"Discharge from Ward"** button for **Doctor / Admin** on admitted ("In Bed") patients.
- Uses the existing `PUT /api/admissions/:id/discharge` with the current user's id; on success the patient is removed from the board.
- Verified E2E: admit → appears in the Active "In Bed" segment → discharge → removed.

## 30. Session 2026-08-29 — Nurse vitals fix + Record Vitals on Active Patients

### 30.1 Bug: "Consulted by Nurse …" when a nurse records vitals
- Nurses create `triage`/`vitals` encounters when recording vitals; `last_consultation_at/by` counted **any** encounter, so it showed the nurse as the consultant.
- **Fix:** `last_consultation_at/by` (in both `/api/patients` and `/api/patients/active`) now only counts encounters whose staff role is **Doctor or Consultant**. Verified: after a nurse records vitals, the card shows "Vitals by Nurse Michael Chen" and "Consulted by Dr. Sarah Johnson" (the real doctor); `last_activity_at` still reflects the nurse's recent vitals (correct for the activity sort).

### 30.2 Record Vitals button for nurses
- **ActivePatients** cards now show a teal **"Record Vitals"** button for **Nurse** role, opening a self-contained modal (BP, pulse, temp, RR, weight, SpO₂, height, triage priority, nursing notes) that posts the `vitals` encounter + vitals row, then reloads the board.

### 30.3 My Patients tab (how it works)
- `My Patients` calls `GET /api/patients?doctor_id={currentStaffId}` — the server joins `encounters` and returns only patients who have at least one encounter by that staff member (patients that doctor has seen/consulted). Non-doctors fall back to all patients.

### 30.4 UX review
- Active tab is first/default; All/My tabs keep the stats grid + status filter; the Active tab uses its own segment/search controls (no duplicated search bar).

## 31. Session 2026-08-29 — Active Patients segment fixes + empty-state messages

### 31.1 "Consulted Today" fixed
- The `consulted` segment previously counted **any** encounter today (including nurse triage/vitals encounters), so patients who only had nurse vitals today wrongly appeared as "consulted".
- **Fix:** the segment now only counts encounters whose staff role is **Doctor or Consultant** (consistent with `last_consultation_at/by`). Verified: a nurse-only vitals patient is excluded; a doctor-consulted patient is included.

### 31.2 Empty-state messages per segment
- The "no active patients" empty state is now **segment-aware**:
  - In Bed → "No patients are currently admitted to a ward"
  - Vitals Today → "No vitals recorded for any active patient today"
  - Consulted → "No patients were consulted by a doctor today"
  - With Doctor / Waiting / In Triage → respective messages
  - All → generic message
- Helper line suggests trying a different segment or widening the time filter.

### 31.3 Verified all segments E2E
- `admitted`, `consulted`, `vitals_today`, `with_doctor`, `waiting`, `in_triage`, and all — each returns the expected patients after live data setup; status changes reflected immediately.

## 32. Session 2026-08-29 — Active Patients segment correctness + count badges

### 32.1 Root cause of "Vitals Today / Consulted Today not showing"
- The server filters were **correct** — the DB simply had **zero vitals/consultations recorded on the current day** (latest real records were Aug 27; today is Aug 29), so those segments legitimately returned 0.
- Confirmed via controlled E2E: recording vitals today → appears in `vitals_today` (and "All"); recording a doctor consultation today → appears in `consulted`. Nurse-only vitals do **not** appear in `consulted`.

### 32.2 Fix: activity segments ignore current status
- Previously `vitals_today`/`consulted` were restricted by the base "active status OR admitted" filter, so a **discharged** patient with today's vitals was hidden. Now those segments allow `discharged` too (they report **any patient with today's activity**), while status/admission-based views keep their restriction.

### 32.3 Segment count badges
- The segment tab buttons now show **live count badges** (In Bed, With Doctor, Waiting, In Triage) derived from the board data, so users immediately see what each view contains instead of relying on the empty state.
- Page resets when switching segments.

### 32.4 Verified
- All 7 segments tested with fresh today-data and with an isolated patient: `vitals_today`=1, `consulted`=1, `admitted`, `in_triage`, `with_doctor`, `waiting`, and `all` all correct; nurse-only vitals excluded from `consulted`.

## 33. Session 2026-08-29 — Authoritative segment count badges (never reset)

### 33.1 Problem
- Segment count badges were previously derived from the **currently filtered** patient list, so switching segments changed/distorted the numbers and they didn't represent the true board.

### 33.2 Fix: dedicated counts endpoint
- New **`GET /api/patients/active/counts`** returns authoritative counts for **all** segments (`all_active`, `admitted`, `with_doctor`, `waiting`, `in_triage`, `vitals_today`, `consulted`), independent of the active segment, since, or search filters.
- The client fetches counts **once, independently** of the list (`loadCounts`), so badges never reset or distort when switching tabs.
- Badges now render on **every** segment button (including All Active, Vitals Today, Consulted Today) and are **hidden when the count is < 1**.
- Verified: counts endpoint returns the same values regardless of `?segment=` param; live today-data reflected correctly.

---

*End of Implementation Record — August 29, 2026*
