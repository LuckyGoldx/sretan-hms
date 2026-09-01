# Patient Flow & Payment — Current State, Gaps, and Recommended Design

**Date:** August 31, 2026
**Status:** Analysis & recommendation only — no implementation
**Applies to:** the whole Sretan HMS/EMR, based on a full read of `SESSIONS_SUMMARY.md`, `SETUP.md`, the database schema (migrations 001–053), and the server/client code.

---

## 1. What the system actually does today

### 1.1 Registration → folder activation (payment gate)
- **Records** registers a patient via `POST /api/patients` → `patients.status = 'checked_in'`, a `hospital_number` is auto-generated (`SRT-2026-000XX`).
- A patient is **not "visible" in most clinical lists** until the **Folder Activation / Registration Fee** is paid:
  - `folder_activated = false` initially.
  - Paypoint (`/paypoint`) builds a pending summary of unpaid items, including **Folder Activation (₦5,000)** when `folder_activated = false` (`payments.ts` `pending-summary`).
  - When paid, `folder_activated = true`; almost every list (`patients`, `admissions`, `appointments`, `maternity`, consultant queue, active board) filters on `folder_activated IS DISTINCT FROM false`.
- **So: the system already gates "visible to clinicians" behind payment.** It does **not** gate a specific doctor or an encounter.

### 1.2 Payment model (today)
- `payments` + `payment_items` (service_type, service_id, description, quantity, unit_price, total_price, `is_converted`).
- Service types observed: `folder_activation`, `prescription`, `lab`, `radiology`, `admission`, `insurance_co_pay`, pharmacy, general services.
- Paypoint can "bill to insurance" (`bill_to_insurance`) which routes charges to the active `insurance_cases` case and can collect a co-pay.
- `billing_invoices` exists (invoice/pay/partial/paid) but is a **separate, lightly-used** path.

### 1.3 Insurance model (today)
- `patient_insurance_policies` (provider, policy number, coverage_type primary/secondary, co-pay %, active, start/end).
- `insurance_cases` (provider, patient, **encounter_id**, **admission_id**, auth_code, status, total_billed/paid, co_pay_amount/collected, `auto_created`).
- A case is **auto-created** on registration when insurance is selected (`ensureInsuranceProviderAndCase`) and also on **encounter creation** for insured patients.
- Insurance staff log into their own portal (`/insurance/*`, role `insurance_staff`). Main-app Admin can view.
- **`primary_provider` shown everywhere is the insurance provider name (HMO), NOT a doctor.** It is computed by a join, never written to `patients`.

### 1.4 Doctor assignment (today) — **this is the gap**
- There is **no doctor-assignment field on the patient**, and no `assigned_doctor_id`.
- `patients.primary_provider` is the **insurance provider**, not a clinician.
- "My Patients" in the doctor dashboard is computed ad hoc as "patients with at least one encounter by this staff member" (`GET /patients?doctor_id=`), i.e. **whoever has seen them before**.
- A doctor "picks up" a patient by opening `/consultation/:patientId` (patient status stays whatever it was; nothing sets `with_doctor` automatically).
- `appointments.doctor_id` is the only explicit doctor-patient link, and it's optional/manual.

### 1.5 The status/queue model
- Patient `status`: `checked_in → in_triage → waiting → with_doctor → discharged` (plus `in_consultation` label in some UIs).
- Transitions are **mostly manual**:
  - Vitals recording sets `in_triage` (`vitals.ts`).
  - TriageStation has "Move to Waiting".
  - PatientDashboard / MyPatients have a manual status dropdown.
  - **Opening or completing a doctor consultation does NOT move the patient to `with_doctor` or out of the queue.**
- There is no "multiple visits/encounters in one day" lifecycle concept from the payment/queue side — the consultant/referral work added `encounter_notes` (many notes per encounter) and same-day encounter reuse, but that is **clinical continuity**, not billing/assignment.

### 1.6 "Doctor needs to see a patient multiple times" (today)
- Clinically supported: same-day encounter reuse (`encounters/ensure`) + multiple `encounter_notes`.
- **Not supported:** multiple billed consultations (one encounter, one "consultation" service), or tracking "follow-up visit 2" vs "new visit".
- Nothing records whether a consultation was a first visit, review, or follow-up, and there's no `service_type = 'consultation'` in payment_items by default.

---

## 2. The normal hospital flow (reference)

A typical Nigerian/West African private hospital or polyclinic flow (matching what this system appears to target):

```
1. Records registers patient (demographics, contact, insurance info) → folder created
2. Paypoint collects Folder/Registration fee (+ any insurance pre-auth) → folder activated
3. Nurse triages (vitals, chief complaint) → patient moves to consultation queue
4. Patient is ASSIGNED to a doctor (queue-based or explicit)
5. Doctor consults:
     - first visit (initial consultation fee)
     - follow-up/review visits (may be same-day or later, possibly cheaper fee)
6. Doctor orders (lab/radiology/Rx/admit) → Paypoint collects payment (or bills insurance)
7. Results flow back → doctor reviews → plan adjusted
8. Discharge (outpatient done) or Admit to ward
9. If admitted: ward care, daily reviews, discharge summary
```

The two missing/weak links in the current system are **step 4 (assignment)** and **step 5 (billed consultations / repeat visits)**.

---

## 3. Key questions answered

### 3.1 "Is a patient meant to be assigned to a doctor after payment or insurance?"
**Yes — that is the correct design, and it's currently missing.**

- Payment activates the **folder** (you did this).
- Assignment should then put the patient into a **doctor's queue** (explicit `assigned_doctor_id`) or a **department queue** from which a doctor claims them.
- Insurance should not bypass assignment — it should change **who pays**, not **who sees**.

### 3.2 "Who does the assignment?"
In a real hospital, **one of these roles** does it (pick a model, see §5):

| Role | Typical model |
|------|---------------|
| **Records / front desk** | On check-in, choose a department and (optionally) a specific doctor. Best for small clinics. |
| **Nurse at triage** | After vitals, assigns the patient to the next available doctor / a named doctor. Common. |
| **Doctor claims from queue** | No pre-assignment — doctors pick from a shared queue ("claim"). Best for large/general practice. |
| **Paypoint/insurance coordinator** | Assigns based on insurer network / chosen provider. Less common at the clinical step. |
| **Appointment desk** | For scheduled visits: the appointment already has `doctor_id`. |

**Recommendation:** support **both** a lightweight assignment (records/nurse picks department + optional doctor at check-in/triage) **and** queue claiming (doctors claim unassigned patients). This matches real clinics that have both walk-ins and scheduled patients.

### 3.3 "Can a doctor assign paid and insurance patients to themselves?"
**Doctors should be able to *claim* patients (self-assign) from their department queue, whether the patient is private-pay or insured.** Claiming is clinical, not financial. Two rules to enforce:
- A doctor can only claim patients in their department (or unassigned).
- A patient should have **one active clinician at a time** per visit (or per active encounter/referral), though consultants already handle referral hand-off separately.

---

## 4. Repeat visits & payment — what should happen

### 4.1 Visit lifecycle (recommended)
Introduce a **Visit / Episode** concept (or reuse encounter + a `visit_type`), and bill a **Consultation service**:

- `patients.assigned_doctor_id` (current assignment, cleared on discharge).
- `patients.primary_doctor_id` (their regular doctor, optional).
- `visits` table (optional but cleanest): `id, tenant_id, patient_id, assigned_doctor_id, visit_type (new|follow_up|review|consultation), visit_date, status (waiting|with_doctor|completed|discharged), created_at, closed_at`.
- Each visit creates/links an `encounter`; orders attach to the encounter (already the pattern).
- **Consultation fee** becomes a `payment_items.service_type = 'consultation'` item:
  - First visit: full consultation fee.
  - Follow-up/review: a (usually lower) follow-up fee, or free if within a warranty window (e.g., same complaint within N days) — configurable.
- On payment (or insurance billing) of the consultation item, the patient is cleared to be seen (`visit.status = 'with_doctor'` or already assigned and the doctor opens it).

### 4.2 Flow for repeat visits
```
Day 0:  Records registers → Paypoint activates folder → Nurse triages → assigned to Dr X → Dr X consults (new, billed) → orders → done
Day 3:  Patient returns for review → Records checks them in (same patient, new visit) → folder already active (no re-pay) →
        Nurse triages → assigned to Dr X (or next available) → Dr X consults (follow-up, billed as follow-up or free if in window) → done
```

### 4.3 What gates the doctor?
- **Folder activation** gates visibility (already built).
- **Consultation payment/insurance authorization** should gate "doctor can start the consultation" — i.e., the consultation fee must be paid or authorized by the insurer before the doctor sees the patient (except emergencies).
- This prevents the common problem: a doctor sees a patient, orders work, but the consultation itself was never billed.

---

## 5. Recommended design (concrete)

### 5.1 Data model additions (migration 054+)
```sql
-- Patients: explicit clinical assignment
ALTER TABLE patients ADD COLUMN IF NOT EXISTS assigned_doctor_id UUID REFERENCES staff_users(id);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS primary_doctor_id  UUID REFERENCES staff_users(id);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS department_id      UUID REFERENCES departments(id); -- preferred dept

-- Visit / episode per check-in (cleanest way to support repeat visits + per-visit billing)
CREATE TABLE IF NOT EXISTS visits (
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  assigned_doctor_id UUID REFERENCES staff_users(id),
  department_id UUID REFERENCES departments(id),
  visit_type VARCHAR(30) NOT NULL DEFAULT 'new',       -- new | follow_up | review
  status VARCHAR(30) NOT NULL DEFAULT 'waiting',        -- waiting | with_doctor | completed | discharged
  consultation_fee DECIMAL(12,2) DEFAULT 0,
  consultation_status VARCHAR(30) DEFAULT 'pending',    -- pending | paid | insurance_authorized | waived | unpaid
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  is_synced BOOLEAN DEFAULT false,
  last_synced_at TIMESTAMPTZ
);
CREATE INDEX idx_visits_patient ON visits(patient_id, created_at DESC);
CREATE INDEX idx_visits_doctor ON visits(assigned_doctor_id, status);
```

### 5.2 Assignment rules
- **Records/Nurse** can assign: set `patients.assigned_doctor_id` + `department_id`, create a `visit` (type new/follow-up computed from past visits), and leave `consultation_status = pending`.
- **Doctor claim**: an unassigned patient in the doctor's department queue can be claimed → sets `assigned_doctor_id` to self (allowed for private + insured).
- **Admin/Head of dept** can reassign.
- On **discharge**, clear `assigned_doctor_id` (or mark visit `completed`).

### 5.3 Consultation billing integration
- When a doctor starts a consultation:
  - Create/link `visit`; add a `payment_items` item `service_type='consultation'` with the fee:
    - `new` → full fee
    - `follow_up`/`review` → follow-up fee (or free if in warranty window).
  - Private pay: paypoint collects; **or** doctor saves a pending consultation charge that Paypoint sees in `pending-summary`.
  - Insured: bill the consultation to the active `insurance_cases` (via `bill-to-insurance`), collect co-pay if any.
- `consultation_status` gates the consultation UI: pending → doctor sees a banner "Consultation fee unpaid / not authorized" but can still record (or block, per hospital policy — make it configurable; emergencies always allowed).

### 5.4 Doctor dashboard / queue upgrade
- Doctor queue becomes: **My assigned patients** + **Unassigned in my department (claimable)** + **Referred to me** (already built).
- Badge counts per queue.
- "My Patients" becomes real: `assigned_doctor_id = me` OR `primary_doctor_id = me`, instead of the ad-hoc "has an encounter" hack.

### 5.5 Paypoint integration
- Paypoint "New" flow already lists pending items per patient; add `consultation` to it (a doctor-created pending consultation charge).
- Show visit type + doctor assigned on the checkout screen.
- On paying the consultation, mark `visits.consultation_status = 'paid'` and allow the doctor to proceed (if blocking is enabled).

---

## 6. Rules of thumb to avoid over-building

1. **Keep folder-activation as-is** — it already works as the "registration paid" gate.
2. **Don't conflate insurance provider with doctor** — rename/disambiguate UI: the green pill should say "HMO: Xyz" not look like a clinician.
3. **One visit per check-in**, many encounters across visits is fine (already have encounter_notes).
4. **Assignment is a queue handoff, not ownership forever** — clear on discharge; referrals already hand off to departments/consultants.
5. **Blocking the doctor on unpaid consultation is optional** — default to **warn, don't block** (safety), except for follow-up-fee logic which is purely informational.
6. **Emergencies bypass all payment gates** — triage priority `red` skips the consultation-payment check.

---

## 7. Suggested implementation order (if approved)

1. **Phase A — Assignment foundation**: migration (assigned/primary doctor + dept), `visits` table; records/nurse assign + doctor claim UI; doctor queue rewrite.
2. **Phase B — Consultation billing**: add `service_type='consultation'` to payment_items; pending-summary includes doctor-created consultation charges; visit_type (new/follow-up) computed; Paypoint checkout shows visit info; insurance billing path.
3. **Phase C — Lifecycle polish**: status automation (with_doctor on consult start, completed/discharged on finish); warranty-window follow-up fee logic; dashboard badges; reports (consultations per doctor, unpaid consultations, repeat-visit counts).
4. **Phase D — Audit + compliance**: all assignment/visit/billing changes to `audit_logs` with `performed_by`.

---

## 8. Summary

| Question | Today | Should be |
|----------|-------|-----------|
| Payment gate before doctors see the patient? | Only **folder activation** | Folder activation **+ consultation fee/authorization** |
| Who assigns the patient to a doctor? | Nobody (ad hoc "has encounter") | Records/Nurse at check-in/triage **or** doctor claims from queue |
| Can a doctor self-assign paid + insured patients? | N/A (no assignment) | Yes — claim from their department queue (clinical, not financial) |
| Doctor sees patient multiple times? | Clinical notes yes; **no visit/billing model** | `visits` per check-in, `visit_type` new/follow-up, per-visit consultation billing |
| Insurance role? | Pays/authorizes (cases + co-pay) | Same, **plus** authorization of the consultation fee |
| Emergency bypass? | Not formalized | Triage priority red bypasses payment gates |

The core gap is the **absence of a formal doctor-assignment + per-visit consultation-billing model**. Everything else (folder activation, insurance cases, orders payment, referral hand-off) already exists and can be wired around it.

---

## 9. Insurance billing at Paypoint — per-item coverage & co-pay calculation

**Question:** When "Bill to Insurance" is clicked at Paypoint, and the provider does not cover 100% of a group service (lab, radiology, pharmacy, etc.) or an individual service (admission, X-ray, etc.), the system should calculate and show the amount the patient pays, based on the **percentage coverage for each individual item in the cart**.

### 9.1 What the system does today (verified in code)

- The provider-level co-pay config is **one flat row per provider** (`insurance_provider_co_pay_config`): `calculation_method` (`percentage` | `fixed`), `percentage_value`, `fixed_amount`.
- `GET /api/insurance/co-pay/:patientId` (insuranceCases.ts) returns a **single** `co_pay_amount` computed against the **active case's `total_billed`** — not per cart item, and not per service type.
- In `PaypointCheckout.tsx`, when "Bill to Insurance" is toggled:
  ```
  const totalBill = cart.reduce((s, c) => s + c.unit_price * c.quantity, 0)
  const patientCoPay = Math.min(coPayAmount, totalBill)   // ONE number for the whole cart
  const insuranceBilled = totalBill - patientCoPay
  ```
- So today the co-pay is **a single flat amount (or one global percentage) applied to the whole cart total** — there is **no per-service coverage percentage**, and no per-item split.

### 9.2 What the user wants

Per-item coverage: each cart line should have its own coverage % (or co-pay %) by **service type** (lab, radiology, pharmacy, admission, x-ray, consultation, etc.), and the Paypoint screen should show, per line and in total:

```
Lab CBC          ₦5,000   coverage 80%   insurer ₦4,000   patient ₦1,000
X-Ray Chest      ₦10,000  coverage 70%   insurer ₦7,000   patient ₦3,000
Admission        ₦20,000  coverage 60%   insurer ₦12,000  patient ₦8,000
─────────────────────────────────────────────────────────────
Total                        patient co-pay ₦12,000        insurer ₦23,000
```

### 9.3 Data model needed (new, small)

Because the current config is provider-wide, we need **coverage per provider × service type**. Recommended:

```sql
-- Service-level coverage per provider (what % the insurer pays; patient pays the rest)
CREATE TABLE IF NOT EXISTS insurance_service_coverage (
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID REFERENCES insurance_providers(id) ON DELETE CASCADE,
  service_type VARCHAR(50) NOT NULL,           -- lab | radiology | pharmacy | admission | consultation | general | ...
  coverage_percentage DECIMAL(5,2) NOT NULL,   -- e.g. 80.00 means insurer pays 80%, patient pays 20%
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  is_synced BOOLEAN DEFAULT false,
  last_synced_at TIMESTAMPTZ,
  UNIQUE (tenant_id, provider_id, service_type)
);
```

- Falls back to the existing provider-level co-pay config when no per-service row exists.
- Seed defaults from current provider config (so nothing breaks).
- Admin/Insurance staff manage these in the insurance portal (a "Service Coverage" tab per provider).

### 9.4 Calculation rules (per item)

For each cart item `c` with `service_type`:
1. Look up coverage for `(provider_id, service_type)` → `coverage_pct` (fallback: provider's global `percentage_value`, or `fixed_amount` logic).
2. `line_total = unit_price × quantity`.
3. If percentage:
   - `insurer_line = round(line_total × coverage_pct / 100, 2)`
   - `patient_line = line_total − insurer_line`
4. If fixed amount (per service, e.g. "₦2,000 co-pay per admission"):
   - `patient_line = min(fixed_amount, line_total)`
   - `insurer_line = line_total − patient_line`
5. Totals: `total_patient = Σ patient_line`, `total_insurer = Σ insurer_line`.
6. Only items with a matching active case/service rule are split; anything not covered stays fully patient-pay.

### 9.5 Server changes (needed)

- New endpoint: **`GET /api/insurance/coverage-quote`** `?patientId=&items=[{service_type, unit_price, quantity}]` → returns per-item and total split:
  ```json
  {
    "patient": { "co_pay": 12000 },
    "insurer": { "covered": 23000 },
    "items": [
      { "service_type": "lab", "description": "Lab CBC", "line_total": 5000,
        "coverage": 80, "insurer_amount": 4000, "patient_amount": 1000 },
      ...
    ]
  }
  ```
- Extend `POST /api/insurance/bill-to-insurance` to accept the **per-item split** (each item with `patient_amount` + `insurer_amount`) instead of only a single total co-pay, so the case records accurate per-service billing.
- Keep `POST /api/insurance/co-pay/pay` for collecting the computed patient total.

### 9.6 Client changes (needed — PaypointCheckout)

- When `billToInsurance` is toggled **and the cart changes**, call `coverage-quote` and show a **per-line breakdown** in the cart/summary area:
  - Each line: item, line total, coverage %, insurer amount, patient amount.
  - Footer: **Patient pays ₦X** (with the payment method) + **Insurer billed ₦Y** + provider name.
- Disable the submit/checkout button until the quote loads (avoid wrong amounts).
- Pass the per-item split to `bill-to-insurance`.

### 9.7 Edge cases & safety

- **No active case / not insured**: hide "Bill to Insurance"; keep full patient-pay (current behavior).
- **Emergency / triage red**: still allowed to proceed without gating (safety).
- **Fixed vs percentage**: respect `calculation_method` per service row.
- **Co-pay cap / annual limits**: optional later (coverage end-date already exists on cases).
- **Rounding**: round each line to 2 decimals, then sum (never sum then round) to keep the per-line display consistent with the total.

---

*End of analysis — no code was changed.*
