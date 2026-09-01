# Consultant & Referral Module — Revision Plan (v2)

**Date:** August 26, 2026 (updated 19:35)
**Status:** Plan Only — items marked DONE below are already implemented (SOAP fix, accepted_by_name joins, auto-accept/start lifecycle, referral banner, Complete button). All other items are planned, NOT yet implemented.
**Applies to:** `CONSULTANT_MODULE_PLAN.md` (v1) + `CONSULTANT_MODULE_IMPLEMENTATION.md`

### What is already DONE (prior sessions)
- SOAP-save bug fixed (`$5::boolean`).
- `accepted_by_name` / `completed_by_name` returned by `/api/referrals`, `/api/referrals/:id`, `/api/consultants/referred-patients`.
- Referral lifecycle: auto-accept on open → auto-`in_consultation` (new `PUT /api/referrals/:id/start`) → `complete`.
- Consultant consultation page shows a full referral banner (number, priority, status, department, reason, referred-by, accepted-by) replacing the old "Consultant Consultation" banner; a "Complete Consultation" button exists (currently uses `window.confirm` — to be replaced by the stylish modal in §4.7).
- Consultant dashboard queue rows show "Accepted by {name} · {date}".
- PatientChart referral history shows `in_consultation` status and accepted/completed-by lines.

---

## 1. Bug Fixes (already applied)

### 1.1 SOAP note save fails in consultant consultation — FIXED

**Reported:** `Failed to save SOAP note` when saving from `/consultant/consultation/:patientId?consultant=1&referral_id=…`.

**Root cause:** `server/src/routes/encounters.ts` PUT handler built:

```sql
is_consultation = CASE WHEN $5 IS NULL THEN is_consultation ELSE $5::boolean END
```

When the client does a normal SOAP save it does **not** send `is_consultation`, so `$5` is an **untyped `null`** → PostgreSQL error `could not determine data type of parameter $5` → HTTP 500 → client shows "Failed to save SOAP note".

**Fix:** cast the parameter in the comparison: `CASE WHEN $5::boolean IS NULL THEN is_consultation ELSE $5::boolean END`. Verified: PUT now returns `is_consultation=True, referral_id=…` and persists `soap_notes` correctly.

---

## 2. Requirements (from user, this session)

1. **Stylish "Complete Consultation" modal** — replace the current `window.confirm` with a proper styled modal (summary of the consultation, confirmation, loading state, success feedback).
2. **Referring-doctor notification** — question: "will the referring doctor receive notification?" **Answer: not currently.** The plan adds a notification mechanism so the GP who referred the patient is notified when the consultant completes the consultation.
3. **Consultant Dashboard ≠ Referred Patients** — split the two routes into distinct pages.
4. **Referred Patients page must be comprehensive** — richer rows, filters, accepted-by info, status visibility.
5. **Consult action only after acceptance** — a pending referral must not allow "Consult"; must Accept first.
6. **Show who accepted the patient** — display `accepted_by_name` + `accepted_at`; also when sent to a department (vs a named consultant).
7. **Sidebar order for Consultant** — consultant-specific menu items must come **first** (currently `Results`/Clinical items appear before the Consultant category).
8. **Doctors need a comprehensive Refer / Transfer page** — refer patients, see progress/status/history of all their referrals.
9. **Add other features** to make the module comprehensive.

### 2.1 Referring-doctor notification (answer + design)

**Current state:** No notification is sent to the referring GP. There is no `notifications` table in the schema — the only "in-app notification" pattern is the doctor sidebar badge for unread lab results (computed from `lab_orders.doctor_read_at`). Referrals only show up in the patient chart's Referrals tab.

**Designed solution — `notifications` table (migration `050`):**

```sql
CREATE TABLE IF NOT EXISTS notifications (
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id UUID REFERENCES staff_users(id) ON DELETE CASCADE,  -- the staff member who receives it
  type VARCHAR(30) NOT NULL,            -- referral_created | referral_accepted | referral_completed | referral_rejected
  title VARCHAR(255) NOT NULL,
  message TEXT,
  ref_table VARCHAR(50),                -- referrals
  ref_id UUID,                          -- referral id
  patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  is_synced BOOLEAN DEFAULT false,
  last_synced_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications (recipient_id, is_read);
```

**Trigger points (server):**
- `POST /api/referrals` → notify consultants in the target department (`recipient_id = each active consultant in `to_department_id``) — type `referral_created`.
- `PUT /api/referrals/:id/accept` → notify `referred_by` (the GP) — type `referral_accepted`.
- `PUT /api/referrals/:id/complete` → notify `referred_by` — type `referral_completed` (this answers the user's question: **yes, after this is built, the referring doctor receives a notification when the consultation is completed**).
- `PUT /api/referrals/:id/reject` → notify `referred_by` — type `referral_rejected`.

**Endpoints:**
- `GET /api/notifications?recipient_id={me}&unread_only=true` — list notifications.
- `PUT /api/notifications/mark-read` (batch ids) and `PUT /api/notifications/mark-all-read`.
- `GET /api/notifications/unread-count?recipient_id={me}` — for the sidebar badge.

**Client:**
- Sidebar **notification bell** with unread badge for all roles (Doctor, Consultant, Nurse, Admin).
- Bell dropdown: recent notifications, mark-read on click, link through to the patient chart / referral.
- When a GP clicks a `referral_completed` notification → opens the patient's chart Referrals tab (or a read-only completion summary).
- Poll every 30s (same pattern as doctor result unread count).

---

## 3. Database & Server Changes

### 3.1 `accepted_by_name` / `completed_by_name` (server query joins)

The consultant queue and referrals list currently return `accepted_by` and `completed_by` as **UUIDs only**. Add joins so the UI can render names:

- `GET /api/consultants/referred-patients` → `LEFT JOIN staff_users ab ON ab.id = r.accepted_by` → add `accepted_by_name`, `completed_by_name`, `accepted_at`, `completed_at`.
- `GET /api/referrals` and `GET /api/referrals/:id` → same joins (already has `to_consultant_name`; add `accepted_by_name`, `completed_by_name`).

### 3.2 New endpoint: `GET /api/referrals/stats` (for doctor referral page + dashboard)

Returns per-status counts **filtered by the requesting staff member** (or all for Admin):

```json
{
  "pending": 2, "accepted": 1, "in_consultation": 0,
  "completed": 5, "rejected": 1, "cancelled": 0,
  "total": 9, "emergency_pending": 1
}
```

### 3.3 New endpoint: `GET /api/referrals/dashboard` (doctor's referral progress)

List of referrals **referred by the current staff member** (or all for Admin), latest first, with the full joined fields above — powers the doctor's Referral Management page.

### 3.4 Optional server guard: prevent consulting a pending referral

- `POST /api/encounters` with `referral_id` → if the referral is `pending`, **400** `"Accept the referral before consulting"`.
- (Or client-only gating; server-side is safer for compliance.)

---

## 4. Frontend Changes

### 4.1 Split Consultant Dashboard vs Referred Patients

**`/consultant/dashboard`** — true dashboard:
- Header with department + consultant name.
- Stats cards (pending / accepted / in_consultation / completed / total / emergency-pending).
- **Emergency alert banner** (red) listing emergency-priority pending referrals.
- **Recent referred patients** (last 5, any status) with quick actions.
- Quick action cards: Referred Patients, My Consultations, Patients, Results.
- **My referrals sent** (for consultants who also refer).

**`/consultant/patients`** — comprehensive **Referred Patients** page:
- Tabs: **Active** (pending/accepted/in_consultation), **Completed**, **Rejected/Cancelled**.
- Filters: status, priority (routine/urgent/emergency), search (name, hospital #, phone, referral #), date range.
- Table columns: Patient (name, hospital #, sex), Referral #, Priority badge, Status badge, Reason, **Referred By**, **Accepted By (name) + Accepted At**, Referred At, Actions.
- **Actions by status:**
  - `pending` → **Accept**, **Reject**, **View Chart** (NO "Consult").
  - `accepted` / `in_consultation` → **Consult**, **Complete**, **View Chart**.
  - `completed` → **View Chart**, **View Notes** (read-only).
  - `rejected` / `cancelled` → **View Chart** + reject/cancel reason.
- Pagination (30/page) + row count.
- **Referral detail modal** (click referral #): full timeline — referred_at, accepted_at/by, completed_at/by, reason, notes, priority, department, consultant.

### 4.2 Consult only after acceptance (both pages)

- In the Referred Patients queue, the **Consult** button renders only when `referral_status === 'accepted' || referral_status === 'in_consultation'`.
- `pending` rows show **Accept / Reject** only.
- Server-side guard (3.4) as backstop.
- `ConsultantConsultation.tsx` already auto-accepts on open; keep that, but a user opening a referral directly must go through Accept first — align by removing auto-accept navigation for pending unless explicitly accepted, OR keep auto-accept but surface "Accepted by {you} at {time}" clearly. **Decision: keep auto-accept on open, but the queue no longer offers Consult for pending, so normal flow is Accept → Consult.**

### 4.3 Show who accepted

- `ReferredPatient` interface gains `accepted_by_name`, `completed_by_name`, `accepted_at`, `completed_at`.
- Rendered in:
  - Referred Patients table ("Accepted by {name} · {datetime}").
  - Referral detail modal timeline.
  - Consultant consultation banner ("Accepted by {name} on {date}").
- When sent to a department without a named consultant, show `Department: {name}` and the accepting consultant's name once accepted.

### 4.4 Sidebar ordering for Consultant role

Problem: non-admin sidebar renders `allowedLinks` in flat array order → Clinical items (`Patients`, `Prescriptions`, `Vitals`, **`Results`**, `Appointments`, `Admissions`) appear **before** the Consultant category.

Fix (in `App.tsx` `allowedLinks` / render):
- Reorder the **Consultant** category block to render **first** for the Consultant role (after Dashboard), i.e. before the Clinical category.
- Simplest robust approach: for non-admin roles, sort `allowedLinks` so the **Consultant** category is placed right after **Dashboard**, then Clinical, Laboratory, etc. (mirrors the admin `categoryOrder`).
- Result for Consultant: Dashboard → **Consultant Dashboard, Referred Patients, My Consultations** → Patients → Prescriptions → Results → … → Maternity (if O&G dept).
- Also add **Referred Patients count badge** on the sidebar item (active pending+accepted count).

### 4.5 New Doctor Referral Management page — `/referrals`

**Role access:** Doctor, Nurse, Admin, Consultant.

**Page features (comprehensive):**
1. **Header** — "Referrals & Transfers" + "New Referral" button (opens `ReferralModal`).
2. **Stats cards** — sent, pending, accepted, in_consultation, completed, rejected, cancelled (from `/api/referrals/stats?referred_by={me}`).
3. **Tabs** — All / Pending / Accepted / In Consultation / Completed / Rejected / Cancelled.
4. **Search + filters** — patient name, hospital #, referral #, target department, priority, date range.
5. **Referral table** — patient, referral #, target department (+ named consultant), priority, status, accepted-by + date, created date, actions:
   - **Cancel** (pending only).
   - **View Chart**.
   - **View Referral Detail** (modal with full timeline + reason + notes).
   - **Track Progress** — status stepper (Pending → Accepted → In Consultation → Completed).
6. **Empty states**, pagination, toasts.
7. **Link from Doctor Dashboard** — add a "Referrals" quick-action card + stats.

### 4.6 Integration points for the new page

- Add sidebar link `Referrals` under **Clinical** for `['Doctor', 'Nurse', 'Consultant', 'Admin']` → `/referrals`.
- Add route in `App.tsx` → `ReferralManagement.tsx`.
- Optionally surface "my active referrals" count on Doctor Dashboard.

### 4.7 Stylish "Complete Consultation" modal

Replace the current `window.confirm(...)` in `DoctorConsultation.tsx` (`handleCompleteConsultation`) with a polished, accessible modal component (`CompleteConsultationModal.tsx`).

**Design (matches existing modal patterns: fixed inset-0, backdrop-blur, rounded-2xl, lucide icons):**
- **Header**: `ClipboardCheck` icon + "Complete Consultation" title + close X.
- **Body — consultation summary** (read from the active encounter + referral):
  - Patient name + hospital number.
  - Referral number + department + priority badge.
  - Encounter type (`consultation`), chief complaint (from latest SOAP subjective), created timestamp.
  - Counts of orders placed: lab / radiology / prescriptions (from `allLabOrders/allRadOrders/allPrescriptions`).
  - **Warning note** (amber): "Closing this referral returns the patient to the referring doctor and removes them from your consultation queue."
  - Optional "Outcome summary" textarea (prefills from `soap.assessment || soap.plan`), stored via a new `referrals.outcome_note` column (migration `050`) and shown in the chart + doctor referral page.
- **Footer**:
  - Cancel (ghost button).
  - **Confirm Complete** (emerald, `Loader2` spinner while submitting) → `PUT /api/referrals/:id/complete` with `{ performed_by, outcome_note }` → success toast → navigate to `/consultant/dashboard`.
- **Accessibility**: `role="dialog"`, `aria-modal`, focus trap-ish (backdrop click closes), Escape closes, disabled confirm while submitting.

**Server addition (migration `050`):**
```sql
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS outcome_note TEXT;
```
`PUT /api/referrals/:id/complete` accepts `outcome_note` and persists it; `GET /api/referrals/:id` returns it.

---

## 5. Additional Features (comprehensiveness)

1. **In-app notifications** — `notifications` table + bell dropdown (Section 2.1). The referring GP is notified when a consultant accepts and when the consultation is completed.
2. **Referral print/PDF slip** — print button in detail modal (reuse existing print util pattern) with referral #, patient, department, priority, reason, referred-by, date.
3. **Referral reason templates** — quick-fill chips in `ReferralModal` ("Please evaluate for…", "Needs specialist review of…", "Pre-op assessment").
4. **Outcome note** — consultant records a completion summary in the Complete-consultation modal; stored on the referral and shown in the patient chart + doctor referral page.
5. **SLA tracking** — server computes `accepted_at - created_at` ("time to accept"); shown in detail modal + a dashboard stat (avg).
6. **Duplicate-active guard** — already implemented (409); surface the message in the modal (already done).
7. **Result notifications** — already implemented (sidebar badge + endpoint).
8. **Patient status flag** — set `patients.status = 'referred'` when a referral is active, so GP queues visually distinguish referred patients (optional; requires patients table change + status handling in patient status dropdowns).
9. **Consultant appointment links** — appointments filtered by consultant's department (future).
10. **Multi-department consultants** — `staff_departments` join table (future).

---

## 6. Files to Change (when implementing)

### Server
- `server/src/routes/consultants.ts` — `accepted_by_name`/`completed_by_name` joins (DONE); add `/api/referrals/stats`, `/api/referrals/dashboard`; pending-consult guard on `POST /api/encounters`; accept `outcome_note` on complete; create notifications on referral create/accept/complete/reject.
- `server/src/routes/encounters.ts` — the `$5::boolean` fix (already applied); optional pending-referral guard.
- `server/src/routes/notifications.ts` (new) — notifications list / mark-read / mark-all-read / unread-count.
- `server/src/server.ts` — register notifications router.
- `database/050_referrals_outcome_notifications.sql` (new) — `referrals.outcome_note` column + `notifications` table + indexes.

### Client
- `client/src/components/ConsultantDashboard.tsx` — refactor into a real dashboard (stats, alerts, recent, quick actions).
- `client/src/components/ReferredPatients.tsx` (new) — comprehensive queue page (or refactor existing table out of the dashboard into this).
- `client/src/components/ConsultantConsultation.tsx` — show accepted-by name/date in banner (partially DONE).
- `client/src/components/CompleteConsultationModal.tsx` (new) — stylish completion modal replacing `window.confirm`.
- `client/src/components/DoctorConsultation.tsx` — wire the modal; collect summary data.
- `client/src/components/NotificationBell.tsx` (new) — sidebar bell + dropdown + badge + polling.
- `client/src/components/ReferralManagement.tsx` (new) — doctor referral page.
- `client/src/components/ReferralDetailModal.tsx` (new) — shared timeline modal.
- `client/src/App.tsx` — route `/referrals`; sidebar reorder for Consultant; notification bell in header; badge counts; add `/referrals` to Clinical links.
- `client/src/components/DoctorDashboard.tsx` — add Referrals quick action + active-referral stat + notifications entry.
- `client/src/components/ReferralModal.tsx` — reason templates; show duplicate-error message (already wired).

---

## 7. Acceptance Criteria

1. **Complete Consultation opens a stylish modal** (not `window.confirm`) showing patient, referral, order counts, and an optional outcome note; confirming closes the referral and returns the consultant to the dashboard.
2. **Referring doctor is notified** when the referral is accepted and when it is completed (bell badge + unread list).
3. Consultant Dashboard and Referred Patients are two distinct, comprehensive pages.
4. Pending referrals show **no Consult button**; accepted/in_consultation show Consult.
5. Accepted referrals display **who accepted + when** (name from joined staff).
6. Consultant sidebar lists Consultant items **before** Clinical items (Results no longer first).
7. Doctors (and nurses/admin) get a **Referral Management page** showing sent referrals with status, progress timeline, history, filters, cancel, detail modal.
8. SOAP save works in consultant consultation (fixed).
9. No SQL injection (all parameterized); all changes audited where applicable.
10. Server `tsc --noEmit` and client `tsc -b` pass.

---

*End of Revision Plan — August 26, 2026*
