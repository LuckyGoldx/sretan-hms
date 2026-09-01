# Sretan HMS — Consultant & Referral Module Implementation Plan

**Date:** August 26, 2026
**Status:** Design / Plan Only — not yet implemented
**Module Type:** Clinical

---

## Table of Contents

1. [Overview](#1-overview)
2. [Core Requirements (from user)](#2-core-requirements-from-user)
3. [Database Schema](#3-database-schema)
4. [Server API Endpoints](#4-server-api-endpoints)
5. [Client Pages & Components](#5-client-pages--components)
6. [Role-Based Access Control](#6-role-based-access-control)
7. [Workflows](#7-workflows)
8. [Department ↔ Consultant Model](#8-department--consultant-model)
9. [Seed Data & Default Consultant](#9-seed-data--default-consultant)
10. [Suggested Enhancements (comprehensiveness)](#10-suggested-enhancements-comprehensiveness)
11. [Integration Points](#11-integration-points)
12. [Build Order](#12-build-order)
13. [Access Matrix](#13-access-matrix)
14. [Files to Create / Modify](#14-files-to-create--modify)

---

## 1. Overview

The Consultant module adds a **referral-based specialist consultation layer** on top of the existing Doctor module. GPs (general practitioners, role `Doctor`) refer patients to a **department** (e.g. Cardiology, Gynae & Obstetrics). Only **consultants assigned to that department** can see and consult those referred patients. Every consultant consultation is written back to the patient chart with a **consultant tag** and the consultant's **department** for full traceability.

This mirrors the existing Doctor module's look and feel (consultation, lab/radiology/pharmacy ordering, patient chart access) but scopes the patient queue by department referral instead of global doctor queue.

---

## 2. Core Requirements (from user)

1. **Consultant module** behaves like the doctor module, but is used when GPs **refer** a patient to a department/consultant.
2. **Only referred patients** (to the consultant's department) are visible for consultation.
3. Consultant can order **lab, radiology, pharmacy, etc.** (full CPOE).
4. Consultations are added to the **patient chart with a consultant tag** and the consultant's **department**.
5. During **staff creation**, an admin can add a consultant and assign them to a **department**.
6. When a patient is referred to a department, **every consultant in that department** can see the patient.
7. Consultant can see the **full patient chart**, including **Maternity** (for Gynae / O&G consultants).
8. **Normal doctors** can transfer/refer a patient to a department; only consultants in that department see the patient.
9. Transfer modal shows a **searchable list of departments that have at least one registered consultant**, with **quick picks/actions**.
10. A default consultant is seeded: **email `consultant@sretan.com`**, **username `consultant`**, **password `consultant`**, attached to a department.

---

## 3. Database Schema

New migrations are numbered sequentially after the latest (`044_lab_order_specimens.sql`).

### 3.1 `045_departments.sql` — Departments table

```sql
-- ============================================================
-- DEPARTMENTS: referral targets / consultant home
-- ============================================================
CREATE TABLE IF NOT EXISTS departments (
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  code VARCHAR(20),
  description TEXT,
  status VARCHAR(20) DEFAULT 'active',          -- active | inactive
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  is_synced BOOLEAN DEFAULT false,
  last_synced_at TIMESTAMPTZ,
  UNIQUE (tenant_id, name)
);
```

Seed departments (one-time, idempotent `ON CONFLICT DO NOTHING`):
- General Medicine
- Paediatrics
- Gynae & Obstetrics (O&G)
- Surgery
- Orthopaedics
- ENT
- Ophthalmology
- Cardiology
- Neurology
- Dermatology
- Psychiatry
- Urology

### 3.2 `046_staff_department.sql` — Link consultants to departments

```sql
ALTER TABLE staff_users ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES departments(id) ON DELETE SET NULL;
```

- Only meaningful for role `Consultant` (but harmless to populate for other roles).
- The department governs **referral visibility** and **module access** (e.g. O&G → Maternity).

### 3.3 `047_referrals.sql` — Referral/transfer records

```sql
CREATE TABLE IF NOT EXISTS referrals (
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_number VARCHAR(50),                        -- e.g. REF-2026-XXXXX
  patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
  referred_by UUID REFERENCES staff_users(id),        -- referring GP / staff
  from_department_id UUID REFERENCES departments(id),
  to_department_id UUID REFERENCES departments(id),
  to_consultant_id UUID REFERENCES staff_users(id),   -- OPTIONAL: direct consultant
  reason TEXT,                                        -- referral reason / clinical summary
  priority VARCHAR(20) DEFAULT 'routine',             -- routine | urgent | emergency
  status VARCHAR(30) DEFAULT 'pending',               -- pending | accepted | in_consultation | completed | rejected | cancelled
  referral_notes TEXT,
  accepted_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  completed_by UUID REFERENCES staff_users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  is_synced BOOLEAN DEFAULT false,
  last_synced_at TIMESTAMPTZ
);
```

Design notes:
- **Department-level referral** is the primary model (matches requirement: refer to a department; all consultants in it see the patient).
- `to_consultant_id` is optional for the "direct to a named consultant" use case.
- Status flow: `pending → accepted → in_consultation → completed` (or `rejected` / `cancelled`).
- A referral is **audit-worthy** (clinical modification): log into `audit_logs` with `performed_by`.

### 3.4 `048_consultant_encounters.sql` — Consultant tag on encounters

```sql
ALTER TABLE encounters ADD COLUMN IF NOT EXISTS is_consultation BOOLEAN DEFAULT false;
ALTER TABLE encounters ADD COLUMN IF NOT EXISTS referral_id UUID REFERENCES referrals(id) ON DELETE SET NULL;
ALTER TABLE encounters ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES departments(id) ON DELETE SET NULL;
```

- `is_consultation = true` + `department_id` + `referral_id` marks an encounter as a consultant consultation.
- The patient chart reads these columns to render the **consultant tag + department badge**.
- `encounters.staff_id` already holds the consultant's staff id (existing pattern).

### 3.5 `audit_logs` additions

Referral creation / status changes / encounter tagging must write to `audit_logs`:
```
performed_by = req.body.staff_id (or authenticated user)
action = 'INSERT' | 'UPDATE'
table_name = 'referrals' | 'encounters'
record_id = <id>
old_data / new_data JSONB
```

---

## 4. Server API Endpoints

New route file: `server/src/routes/consultants.ts` (plus small additions to `staff.ts`).

### 4.1 Departments

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/departments` | GET | List departments (with consultant counts) |
| `/api/departments` | POST | Create department (Admin) |
| `/api/departments/:id` | PUT | Update department (Admin) |
| `/api/departments/:id` | DELETE | Deactivate department (Admin; soft via status) |
| `/api/departments/with-consultants` | GET | **Searchable list** of departments having ≥1 active consultant — powers the referral modal quick picks |

`with-consultants` response shape:
```json
{
  "id": "…",
  "name": "Cardiology",
  "consultant_count": 2,
  "consultants": [
    { "id": "…", "name": "Dr. A", "email": "…", "department_id": "…" }
  ]
}
```

### 4.2 Referrals

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/referrals` | GET | List referrals (filters: status, patient_id, from_staff, to_department, consultant_id) |
| `/api/referrals` | POST | Create referral (GP transfers patient to department) |
| `/api/referrals/:id` | GET | Referral detail (with patient + department names) |
| `/api/referrals/:id` | PUT | Update referral metadata (reason, priority, department) while `pending` |
| `/api/referrals/:id/accept` | PUT | Consultant accepts referral → `accepted` |
| `/api/referrals/:id/complete` | PUT | Consultant completes → `completed` + `completed_by` + `completed_at` |
| `/api/referrals/:id/reject` | PUT | Consultant rejects → `rejected` + reason |
| `/api/referrals/:id/cancel` | PUT | Referring GP cancels → `cancelled` |

### 4.3 Consultant Queue / Dashboard

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/consultants/referred-patients` | GET | Patients referred to the logged-in consultant's `department_id`, with referral + latest status. **This is the consultant's patient queue.** |
| `/api/consultants/stats` | GET | Counts: pending, accepted, in consultation, completed, total (for dashboard cards) |
| `/api/consultants/encounters` | GET | Consultant's own encounters (for "My Consultations" history) |

`referred-patients` should LEFT JOIN patients + referrals and return:
```json
{
  "patient_id": "…",
  "hospital_number": "…",
  "full_name": "…",
  "phone": "…",
  "sex": "…",
  "age": "…",
  "referral_id": "…",
  "referral_number": "…",
  "priority": "urgent",
  "status": "accepted",
  "reason": "…",
  "referred_by_name": "Dr. Sarah Johnson",
  "referred_at": "…"
}
```

### 4.4 Staff (`staff.ts` additions)

- `GET /api/staff` → include `department_id`, `department_name`.
- `POST /api/staff` → accept `department_id`; when `role === 'Consultant'`, **require** `department_id` (400 otherwise).
- `PUT /api/staff/:id` → accept `department_id`.
- Add `'Consultant'` to `VALID_ROLES`.

### 4.5 Encounters (`encounters.ts` additions)

- `POST /api/encounters` accepts `is_consultation`, `referral_id`, `department_id`.
- `GET /api/encounters` returns joined `department_name` and `is_consultation` for the patient chart consultant tag.
- `PUT /api/encounters/:id` accepts the same fields.

### 4.6 Security / Compliance notes

- All queries use **parameterized bindings** (existing `pool.query($n)` pattern).
- Every referral/encounter write logs `staff_id` + `audit_logs`.
- Referral reason length capped (e.g. 2000 chars). Priority must be one of `routine|urgent|emergency`.
- Status transitions validated server-side (no invalid jumps, e.g. `completed → pending`).
- Consultant queue query must always filter by `department_id` of the authenticated consultant — **never** return all patients.

---

## 5. Client Pages & Components

New route file: `client/src/components/ConsultantDashboard.tsx`, `ConsultantConsultation.tsx` (or reuse), `ReferralModal.tsx`, `DepartmentsAdmin.tsx`.

### 5.1 `ConsultantDashboard` (`/consultant/dashboard`)

- Stats cards: **Pending Referrals, Accepted, In Consultation, Completed** (from `/api/consultants/stats`).
- **Referred Patients queue** — the core list:
  - Shows only patients referred to the logged-in consultant's department.
  - Each row: patient (name + hospital #), referral number, priority badge (routine/urgent/emergency with colors), referral reason, referring doctor, status badge.
  - Action buttons: **Consult** (navigates to consultation page), **View Chart**, **Accept / Complete / Reject** actions inline.
  - Search + status filter + pagination (30/page, same pattern as other modules).
- Quick actions: Patients, Appointments, Lab Results, Prescriptions (mirror doctor dashboard).

### 5.2 `ConsultantConsultation` (`/consultant/consultation/:patientId`)

- Can **reuse `DoctorConsultation`** with a mode prop, or a thin wrapper:
  - On mount, POST/GET the encounter with `is_consultation=true`, `department_id=<consultant's dept>`, `referral_id=<from query>`.
  - Full SOAP, ICD-11, lab order, radiology order, prescription, timeline — identical to doctor.
- Shows a **"Consultant Consultation" banner** with department + referring doctor + referral reason at top.
- On opening, marks referral `accepted` (if still pending).

### 5.3 `ReferralModal` — GP Transfer Modal

Opened from Doctor consultation page (and optionally patient list/chart) via a **"Refer / Transfer"** button.

Features (per requirement):
- **Searchable list of departments that have a registered consultant** (`/api/departments/with-consultants`).
- **Quick picks row**: frequently used / recently used departments (from localStorage or server "recent referrals"), e.g. chips for "O&G", "Cardiology".
- Department card layout: name, consultant count, first consultant names, and a **"Refer" quick action button** per department.
- Selecting a department expands a small form:
  - Reason / clinical summary (textarea, required).
  - Priority selector (Routine / Urgent / Emergency pills).
  - Optional "refer to specific consultant" dropdown (consultants in that department).
  - Optional note.
- Submit → `POST /api/referrals` → success toast, patient marked referred, appears in consultant queue.
- Accessible to `Doctor`, `Nurse`, `Admin`, `Consultant` (consultant-to-consultant handoff).

### 5.4 `DepartmentsAdmin` (`/departments`)

- Admin-only CRUD for departments (name, code, description, status).
- Shows each department with its **consultant roster** (staff with role Consultant + that department).
- Add Consultant shortcut: "+ Add Consultant to this department" links to Staff Management pre-filled.

### 5.5 Patient Chart integration

- **Consultant badge** on encounters where `is_consultation = true`: a distinct purple/indigo pill "CONSULTANT · Cardiology" next to the encounter card (alongside existing staff name + timestamp).
- **Referrals section/tab** in the chart:
  - Timeline of all referrals: status badges, reason, referring doctor, accepting consultant, completion.
  - "Refer Patient" button (for Doctor/Admin roles) → opens `ReferralModal`.
- Timeline modal (existing encounter modal) shows referral info when `referral_id` present.

### 5.6 Staff Management integration

- Role dropdown gains **Consultant**.
- When role = Consultant, a **Department** dropdown (required) appears, populated from `/api/departments` (active only).
- Edit staff modal allows changing department.
- Staff table shows a department column for consultants.

### 5.7 Sidebar & Routing (`App.tsx`)

New `Consultant` category/links:

| Link | Route | Roles |
|------|-------|-------|
| Consultant Dashboard | `/consultant/dashboard` | Consultant, Admin |
| Referred Patients | `/consultant/patients` | Consultant, Admin |
| My Consultations | `/consultant/my-consultations` | Consultant, Admin |
| Departments (Admin) | `/departments` | Admin |

Doctor gets a "Refer Patient" action on the consultation page (no new sidebar item needed, but optionally a "Referrals" item under Clinical).

---

## 6. Role-Based Access Control

### 6.1 New role: `Consultant`

- Added to `VALID_ROLES` in `server/src/routes/staff.ts`.
- Login works identically (`auth.ts` — no changes needed; role is returned to client).
- DashboardRouter: `if (role === 'Consultant') return <ConsultantDashboard />`.
- **Queue scoping**: consultants see only patients with an active referral to their `department_id`.

### 6.2 Department-driven module access (Maternity for O&G)

Rule: a consultant's `department_id` gates **module access**.
- Implement a server-side helper: `getDepartmentModules(departmentId)` returning allowed module keys.
- O&G department → grants **Maternity** access to its consultants (matches requirement).
- Client: sidebar for Consultant renders Maternity links only when the consultant's department is O&G (or has a `modules` allowlist).
- Simplest robust approach: add `modules JSONB` to `departments` (e.g. `["maternity"]`); server returns it on login/`me`, client filters sidebar.

Recommended: add to `045_departments.sql`:
```sql
ALTER TABLE departments ADD COLUMN IF NOT EXISTS modules JSONB DEFAULT '[]';
```
O&G row seeded with `["maternity"]`.

### 6.3 RBAC matrix summary

| Capability | Doctor (GP) | Consultant | Nurse | Admin |
|------------|:-----------:|:----------:|:-----:|:-----:|
| See all patients queue | ✓ (all) | only referred to their dept | ✓ | ✓ |
| Refer/transfer patient | ✓ | ✓ | ✓ | ✓ |
| Consult referred patients | – | ✓ | – | ✓ |
| Order lab/radiology/pharmacy | ✓ | ✓ | – | ✓ |
| Full patient chart | ✓ | ✓ | ✓ | ✓ |
| Maternity access (O&G consultant) | ✓ | ✓ (O&G dept) | ✓ | ✓ |
| Manage departments | – | – | – | ✓ |
| Create/edit consultants | – | – | – | ✓ |

---

## 7. Workflows

### 7.1 Referral lifecycle

```
1. GP opens patient in consultation
2. Clicks "Refer / Transfer" → ReferralModal
3. Searches/quick-picks a department with consultants
4. Enters reason + priority (optional: specific consultant)
5. POST /api/referrals → status = pending
   → audit_logs: INSERT referrals
6. Consultant in that department sees patient in their queue
7. Consultant opens consultation → referral auto-accepted (or explicit Accept button)
   → encounter created with is_consultation=true, department_id, referral_id
8. Consultant orders labs/radiology/Rx as needed
9. Consultant completes → referral status = completed, completed_by, completed_at
   → audit_logs: UPDATE referrals
10. Patient chart shows consultant-tagged encounter + referral history
```

### 7.2 Quick pick persistence

- Client stores last N departments used in referrals (`localStorage: recent_referral_departments`).
- ReferralModal shows them as chip quick picks above the searchable list.

### 7.3 Referral cancellation / rejection

- GP can cancel while pending/cancelled.
- Consultant can reject with a reason (returns patient to GP queue, referral visible as rejected).

---

## 8. Department ↔ Consultant Model

- One department → **many** consultants (1:N via `staff_users.department_id`).
- One consultant → **one** department (primary). (Optional future: a `staff_departments` join table for multi-department consultants.)
- Referral is **department-scoped** by default; optional direct consultant override.
- Only **active** consultants (staff `status='active'`) count in `with-consultants` and can be referral targets.

---

## 9. Seed Data & Default Consultant

### 9.1 Default consultant

Add to `scripts/seed_users.cjs` (and/or a migration `049_seed_consultant.sql`):

```js
{ username: 'consultant', email: 'consultant@sretan.com',
  name: 'Dr. Consultant', role: 'Consultant',
  department: 'General Medicine', password: 'consultant' }
```

- Password: `consultant` (as requested).
- Attached to a seeded department (e.g. **General Medicine**).
- For the Maternity demo, seed a second O&G consultant OR set the default consultant's department to **Gynae & Obstetrics** so the Maternity access requirement is immediately demonstrable. Recommend seeding the default consultant into **Gynae & Obstetrics (O&G)** for that reason, and document it.

### 9.2 Seeds summary

| Item | Value |
|------|-------|
| Consultant username | `consultant` |
| Consultant email | `consultant@sretan.com` |
| Consultant password | `consultant` |
| Departments | 12+ seeded (General Medicine, O&G, Cardiology, …) |
| O&G modules | `["maternity"]` |

---

## 10. Suggested Enhancements (comprehensiveness)

To make the module enterprise-complete, add (phase 2+):

1. **Referral letter/PDF print** — printable referral slip (like receipts) with reason, priority, department, GP name.
2. **Referral SLA tracking** — time from referral → accepted → completed; dashboard metric "avg time to review".
3. **Consultant result notifications** — when lab/radiology results for their referred patient are completed, sidebar badge (mirrors doctor unread tracking via `doctor_read_at`).
4. **Appointments per consultant** — allow scheduling appointments with a specific consultant; show in their dashboard.
5. **Multiple departments per consultant** — `staff_departments` join table + queue unions across departments.
6. **Department transfer history report** — audit report of all referrals (by dept, doctor, consultant, time window) for the Admin/Reports page.
7. **Emergency referral priority** — auto-alert (red banner) for emergency-priority referrals on consultant dashboard.
8. **Referral reason templates** — quick phrases (e.g. "Please evaluate for…", "Requires specialist review of…") to speed GP entry.
9. **Consultant handoff notes** — after completion, optional structured outcome note (diagnosis made, plan, follow-up) visible in chart.
10. **Block duplicate active referrals** — server rejects creating a new pending referral for a patient already pending/active in the same department.
11. **Insurance integration** — referral consultation billed to insurance case when the patient is insured (reuse `/insurance/bill-to-insurance`).
12. **Department-wide dashboard for admin** — which departments have consultants, referral volume, bottlenecks.
13. **Patient status flag** — e.g. `status='referred'` on patients with an active referral, so GP queue distinguishes referred patients.
14. **Billing** — consultation fee for referred encounters auto-queued at Paypoint (`service_type='consultation'`) unless insured.

---

## 11. Integration Points

| Existing module | Integration |
|-----------------|-------------|
| **Doctor module** | "Refer / Transfer" button; GP queue sees referred patients flagged |
| **Patient Chart** | Consultant badge on encounters; Referrals section; referral history |
| **Staff Management** | Consultant role + department field; roster view per department |
| **Auth / Login** | No change; role flows through existing payload |
| **Maternity** | O&G consultants granted Maternity module access via department `modules` |
| **Lab / Radiology / Pharmacy** | Consultant uses existing order endpoints (unchanged) |
| **Paypoint / Insurance** | Consultation fee + insurance billing (enhancement #11/#14) |
| **Audit** | `audit_logs` for referrals + consultant encounters |

---

## 12. Build Order

### Phase A — Foundation (Data + API)
1. `045_departments.sql` + seed departments (+ `modules` column).
2. `046_staff_department.sql`.
3. `047_referrals.sql`.
4. `048_consultant_encounters.sql`.
5. `staff.ts`: `Consultant` role + `department_id` (required for Consultant) + joined dept name.
6. New `server/src/routes/consultants.ts` (departments CRUD, referrals, consultant queue/stats).
7. Register router in `server.ts`; wire `audit_logs`.

### Phase B — GP Referral Flow
8. `ReferralModal.tsx` (searchable departments w/ consultants, quick picks, priority, optional consultant).
9. Wire "Refer / Transfer" button into `DoctorConsultation.tsx` (+ patient chart).
10. `GET /api/departments/with-consultants` + `POST /api/referrals`.

### Phase C — Consultant Experience
11. `ConsultantDashboard.tsx` (+ stats, queue, accept/complete/reject actions).
12. `ConsultantConsultation` (reuse DoctorConsultation with consultant banner + encounter tagging).
13. DashboardRouter for Consultant role.
14. Sidebar links + routes in `App.tsx`.

### Phase D — Chart & Admin polish
15. Patient chart: consultant badge + Referrals section.
16. `DepartmentsAdmin.tsx` (`/departments`).
17. StaffManagement consultant department field.
18. Seed default consultant (`consultant` / `consultant` / `consultant@sretan.com`).
19. Update `SESSIONS_SUMMARY.md`, `SETUP.md` (login table).

### Phase E — Enhancements
20. Suggested enhancements (Section 10) in priority order.

---

## 13. Access Matrix

| Page / Feature | Doctor | Consultant | Nurse | Admin | Records | Paypoint |
|----------------|:------:|:----------:|:-----:|:-----:|:-------:|:--------:|
| Consultant Dashboard (`/consultant/dashboard`) | – | ✓ | – | ✓ | – | – |
| Referred Patients queue | – | ✓ | – | ✓ | – | – |
| My Consultations | – | ✓ | – | ✓ | – | – |
| Refer / Transfer modal | ✓ | ✓ | ✓ | ✓ | ✓ | – |
| Departments Admin | – | – | – | ✓ | – | – |
| Patient Chart (consultant badge + referrals) | ✓ | ✓ | ✓ | ✓ | ✓ | – |
| Maternity (O&G dept consultants) | ✓ | ✓ | ✓ | ✓ | – | – |
| Staff Management (consultant + dept) | – | – | – | ✓ | – | – |

---

## 14. Files to Create / Modify

### New files
```
database/045_departments.sql
database/046_staff_department.sql
database/047_referrals.sql
database/048_consultant_encounters.sql
database/049_seed_consultant.sql            (or update scripts/seed_users.cjs)
server/src/routes/consultants.ts
client/src/components/ConsultantDashboard.tsx
client/src/components/ConsultantConsultation.tsx
client/src/components/ReferralModal.tsx
client/src/components/DepartmentsAdmin.tsx
```

### Modified files
```
server/src/routes/staff.ts                  (Consultant role, department_id)
server/src/routes/encounters.ts             (is_consultation, referral_id, department_id)
server/src/routes/auth.ts                   (no change expected)
server/src/server.ts                        (register consultants router)
client/src/App.tsx                          (routes, sidebar, DashboardRouter)
client/src/components/DoctorConsultation.tsx (Refer/Transfer button)
client/src/components/PatientChart.tsx      (consultant badge, referrals section)
client/src/components/StaffManagement.tsx   (Consultant role + department dropdown)
scripts/seed_users.cjs                      (default consultant)
SETUP.md                                    (login table)
SESSIONS_SUMMARY.md                         (session record)
```

---

*End of Plan — August 26, 2026*
