# Insurance Module & System Compliance — Implementation Record

**Session:** Aug 11, 2026
**Author:** Kilo (AI Software Engineer)

---

## Overview

This session implemented a complete Insurance/HMO module for the Sretan HMS/EMR and addressed cross-module security/compliance issues identified in a comprehensive rules audit. All changes were implemented, tested iteratively with simulated data, and verified to compile clean.

---

## Part 1: Cross-Module Compliance Fixes (from `RULES_COMPLIANCE_AUDIT.md`)

### 1.1 Defensive Validation (Rule 5)
**`server/src/routes/vitals.ts`** — added `validateVitalRanges()` enforcing clinically acceptable ranges:
- Temperature: 32°C–43°C
- SpO2: 0–100%
- Systolic BP: 60–250 mmHg
- Diastolic BP: 30–150 mmHg
- Pulse: 30–250 bpm
- Respiratory rate: 5–60
- Rejects negative values for weight, height, fluid intake/output, FHR, fundal height, hemoglobin, PCV, gestational age
- Applied to both POST and PUT endpoints with human-readable errors

**`server/src/routes/pharmacy.ts`** — rejects `quantity_dispensed <= 0`

**`server/src/routes/payments.ts`** — rejects negative unit_price or zero/negative quantity

### 1.2 Tenant Isolation (Rule 3)
- **`database/038_wards_admissions_tenant.sql`** — added `tenant_id` to `wards`, `admissions`, `beds` with dynamic backfill from the tenants table
- **`server/src/routes/admissions.ts`** — all 9 query handlers now use `getTenantId()` + tenant filters
- **`server/src/routes/maternity.ts`** — admission INSERT now includes `tenant_id`

### 1.3 Audit Logging (Rule 2)
Added `audit_logs` INSERTs to key clinical mutations:
- `encounters.ts`: POST (INSERT) + PUT (UPDATE)
- `vitals.ts`: POST (INSERT) + DELETE
- `admissions.ts`: POST (admit) + PUT (discharge)
- All log `performed_by`, `old_data`, `new_data`

### 1.4 Authorization Fix (Critical)
**`server/src/utils/insuranceAuth.ts`** — `isSuperAdmin()` now returns `false` for `user_type === 'insurance_staff'`. Previously the shared master token made every user pass superadmin checks (security flaw G1–G4).

---

## Part 2: Insurance Module Core (from `INSURANCE_MODULE_PLAN.md`)

### 2.1 Database (migrations)
| File | Purpose |
|------|---------|
| `028_insurance_providers.sql` | Providers + staff_users tables, patient_insurance_id column |
| `032_insurance_seed_providers.sql` | 10 Nigerian HMO providers |
| `033_insurance_seed_staff.sql` | Test user insurance@sretan.com |
| `034_insurance_cases.sql` | Cases, services, policies, auth requests, co-pay config, excluded services, invoices |
| `035_insurance_provider_category.sql` | Provider category column + backfill |
| `036_insurance_case_services_source.sql` | Source tracking columns |
| `037_insurance_service_invoicing.sql` | Service invoicing state (pending/invoiced) |
| `039_insurance_coverage_rules.sql` | Coverage rules table + default_coverage_pct |

### 2.2 Server Routes
| File | Purpose |
|------|---------|
| `insuranceAuth.ts` | Login/logout/me for insurance staff |
| `insuranceProviders.ts` | Provider CRUD, 24h code lock, cascade to patients |
| `insuranceStaff.ts` | Staff CRUD, hard-delete (superadmin), password reset |
| `insuranceCases.ts` | Cases, services, auth requests, policies, co-pay, patient coverage |
| `insuranceInvoices.ts` | Invoice generation, status transitions, cancel/void |
| `insuranceReports.ts` | Utilization, financial, aging reports |
| `insuranceCoverage.ts` | Coverage rules CRUD + inventory endpoint |

### 2.3 Frontend Components
| Component | Route | Purpose |
|-----------|-------|---------|
| `InsuranceLogin.tsx` | `/insurance/login` | Separate insurance staff login |
| `InsuranceLayout.tsx` + `InsuranceSidebar.tsx` | — | Insurance layout with hamburger sidebar |
| `InsuranceDashboard.tsx` | `/insurance/dashboard` | Stats + month billed (WAT) |
| `InsuranceProviders.tsx` | `/insurance/providers` | Provider CRUD + deactivate/activate + delete + coverage rules |
| `InsuranceStaff.tsx` | `/insurance/staff` | Staff CRUD + roles + deactivate + delete |
| `InsuranceCases.tsx` | `/insurance/cases` | Case list |
| `InsuranceCaseDetail.tsx` | `/insurance/cases/:id` | Case detail, services, remove/delete |
| `InsuranceNewCase.tsx` | `/insurance/cases/new` | Create case + prefill from auth |
| `InsurancePatients.tsx` | `/insurance/patients` | Patient list with coverage tags |
| `InsurancePatientDetail.tsx` | `/insurance/patients/:id` | Clinical reference + billing + invoices tabs |
| `InsuranceInvoices.tsx` | `/insurance/invoices` | Invoice list + review workflow |
| `InsuranceReports.tsx` | `/insurance/reports` | Financial/utilization/aging reports |
| `InsuranceAuthRequests.tsx` | `/insurance/auth-requests` | Pre-authorization workflow |

---

## Part 3: Insurance Features Implemented

### 3.1 Insurance Unification
- **`patient_insurance_policies`** is the single source of truth
- Registration and Records edit capture directly into policies (not `patients.insurance_type`)
- Removed free-text insurance entry — only registered providers selectable
- Policy status computed: **active / expired / deactivated**
- **One primary per patient** enforced (adding a primary demotes the old one)
- **Same provider can't be both primary and secondary** (server POST/PUT + UI dropdown filter)
- **Co-pay inheritance**: new policies inherit provider default co-pay unless overridden
- **Auto-promotion**: when primary expires, oldest active secondary is auto-promoted (with `↑ Primary` tag)

### 3.2 Coverage Rules & Billing Routing (NEW)
- **Coverage rules page** (`/insurance/providers` → % icon): set provider default %, category-level %, and individual item overrides from inventory
- Coverage lookup priority: item override → category rule → provider default → assume 100%
- **`GET /api/payments/pending/:patientId`** auto-routes insured patients:
  - 100% covered → auto-billed to insurance case, marked paid, skipped at Paypoint
  - Partial covered → insurance portion auto-billed, patient pays remainder at Paypoint
  - 0% covered → normal Paypoint billing
- Dedup logic prevents re-billing on repeated fetches

### 3.3 Insurance Patient Detail — Two service actions
- **X icon** (session remove): hides service from current billing view; returns on refresh (client-side Set)
- **Trash icon** (permanent delete): 2-step stylish confirmation modal → hard delete from DB

### 3.4 Insurance Badges (primary insurance)
Added `primary_provider` to patients search/list/detail + maternity endpoints.
Badge shown next to patient names in: RecordsPatientList, RecordsPatientDetail, PatientChart, DoctorConsultation, DoctorDashboard, MyPatients, TriageStation, PatientDashboard, MaternityPatientList, MaternityDashboard.

### 3.5 Provider Actions (deactivate/activate/delete)
- **Deactivate/Activate** (Power icon): insurance staff + admin, 2-step confirmation
- **Delete** (Trash icon): superadmin only, 3-step confirmation, cascade deletes
- Server enforces: insurance staff get 403 on delete, clinical admin allowed

---

## Part 4: Bugs Fixed During This Session
1. `setPendingItems` removed from Paypoint (restored)
2. `total_billed` included removed services (added `status != 'removed'`)
3. `getPatientPrimaryInsurance` SQL referenced non-existent `pp.policy_status` column
4. `autoBillToCase` dedup broken for null source_id (deterministic key fix)
5. `isSuperAdmin` always true due to shared master token

---

## Test User
- **Email:** `insurance@sretan.com`
- **Password:** `insurance`
- Login at `/insurance/login` or via main login (auto-detected)

---

## Documentation Files Created
- `INSURANCE_MODULE_PLAN.md` — original design/plan
- `INSURANCE_MODULE_GAP_ANALYSIS.md` — gap analysis of the module
- `RULES_COMPLIANCE_AUDIT.md` — cross-module compliance audit
- `INSURANCE_IMPLEMENTATION.md` — implementation record (this file)
