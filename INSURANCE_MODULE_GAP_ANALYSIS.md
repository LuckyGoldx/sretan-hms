# Insurance Module — Gap Analysis & Standard EMR/HMS Insurance Feature Set

**Date:** August 5, 2026
**Status:** Analysis only — no implementation

---

## 1. Executive Summary

The insurance module currently covers: provider management, separate insurance-staff auth & roles, patient insurance capture, case management, auto-sync of clinical services into billing, service-level invoicing (pending → invoiced, preventing double-billing), invoice lifecycle (draft → sent → paid, cancel, void), patient policies (multiple insurance), pre-authorization requests, co-pay calculation/collection, and Paypoint/Pharmacy "bill to insurance".

The module is functionally solid as a **billing-first** insurance system, but it is missing the **operational half** of a mature insurance module: claim management, coverage/formulary enforcement, auth-code enforcement, reports/analytics, notifications, audit trail, PDF/E-claim exports, and several workflow automations. There are also **critical security gaps** (authorization is client-supplied and effectively bypassable) and a **multi-tenancy bug** (tenant_id hardcoded).

---

## 2. Current Module Inventory (what exists today)

### 2.1 Data model (tables)
| Table | Purpose | Notes |
|-------|---------|-------|
| `insurance_providers` | HMO/insurer registry | category, code, contacts, is_active; 24h code lock |
| `insurance_staff_users` | Separate staff accounts | roles admin/editor/viewer, access_scope own/all |
| `insurance_cases` | Per-patient coverage episode | status, auth_code, totals, co-pay fields, void fields |
| `insurance_case_services` | Parallel billing line items | status pending/invoiced, source tracking, invoice linkage |
| `patient_insurance_policies` | Multiple policies per patient | primary/secondary/tertiary, validity, co-pay % |
| `insurance_auth_requests` | Pre-authorization workflow | requested→approved/denied/partial/expired |
| `insurance_provider_co_pay_config` | Per-provider co-pay method | percentage/fixed/none |
| `insurance_excluded_services` | Services excluded from cover | **table exists, not enforced/UI'd** |
| `insurance_invoices` | HMO invoices/claims | status, totals, claim fields |
| `insurance_invoice_items` | Invoice line items | linked back to services |

### 2.2 Server routes
- `insuranceAuth.ts` — login/logout/me
- `insuranceProviders.ts` — provider CRUD, 24h code lock, name/category cascade to patients
- `insuranceStaff.ts` — staff CRUD, hard-delete (super admin), password reset
- `insuranceCases.ts` — cases CRUD, services CRUD, auth requests, policies, co-pay, patient coverage, patient list, patient summary (clinical reference)
- `insuranceInvoices.ts` — invoice list/detail, per-case + per-period generation, billable summary, status transitions, cancel (reopens services), void (credit-note style)
- `autoSyncServices.ts` — auto-pull completed clinical services into case services
- `insuranceAuth.ts` (utils) — role/scope helpers, provider-scope filtering

### 2.3 Frontend pages
- Insurance Login (plus unified login auto-detection)
- InsuranceLayout + InsuranceSidebar (insurance staff)
- Insurance Dashboard (stats, quick actions, provider list)
- InsuranceProviders, InsuranceStaff, InsuranceCases, InsuranceCaseDetail, InsuranceNewCase
- InsurancePatients (list), InsurancePatientDetail (Main / Clinical Reference / Insurance Services pending+invoiced / Invoices tabs)
- InsuranceInvoices (list + detail modal with confirmation popups)
- Admin insurance pages under `/admin/insurance/*` (clinical Admin/Finance)
- Paypoint + Dispensing "Bill to Insurance" toggles

### 2.4 Key behaviors
- Provider scope isolation (own vs all) enforced server-side
- Auto-creation of provider + active case from patient registration/edit
- Auto-sync of completed clinical services (lab/radiology/pharmacy/admissions/encounters/treatments/fluids-intake/maternity)
- Service-level invoicing state machine preventing double billing
- Invoice cancel reopens services; paid invoices cannot be cancelled
- Co-pay calculation (percentage/fixed) and collection endpoint

---

## 3. Gap Analysis

### 3.1 🔴 Critical — Security & Authorization

| # | Gap | Detail |
|---|-----|--------|
| G1 | **Master token used as auth on every request** | The axios interceptor sends `x-master-token: sretan-emr-master-token-2026` on ALL requests. `isSuperAdmin()` checks this header, so **every logged-in user passes the super-admin check**. The 24h provider-code lock, staff hard-delete, and staff management all gate on `isSuperAdmin` → effectively bypassable by any authenticated client. |
| G2 | **Role/scope are client-supplied headers** | `x-user-role`, `x-user-type`, `x-user-provider-id` are read from request headers set by the browser. A user can forge these headers (curl/Postman) to claim `admin` role or another provider's id. There is **no server-side JWT validation** for insurance staff, and the DB role is not re-fetched per request. |
| G3 | **No per-endpoint permission matrix** | Editor/viewer can POST/PUT/DELETE services and cases if they forge headers. There is no enforcement that editors cannot void cases, that viewers cannot create invoices, etc. |
| G4 | **Provider scope relies on headers, not the session** | `getInsuranceUser()` reads `x-user-provider-id`. A staff user can send another provider's id and see their data. |

### 3.2 🔴 Critical — Multi-tenancy

| # | Gap | Detail |
|---|-----|--------|
| G5 | **tenant_id hardcoded** | Insurance routes hardcode `'00000000-0000-0000-0000-000000000000'` (e.g., case/service/policy/invoice INSERTs) instead of using `getTenantId()` like clinical routes. In a multi-tenant SaaS deployment this corrupts tenancy. |

### 3.3 🟠 Claims Management (major missing feature)

| # | Gap | Detail |
|---|-----|--------|
| G6 | **No dedicated claim workflow** | Invoice doubles as claim, but there is no claim lifecycle: submitted → acknowledged → **rejected (with reason)** → re-submitted → **partially paid**. The invoice table has `claim_submitted_at` / `claim_reference` but no UI or state machine around rejection/re-submission. |
| G7 | **No claim documents** | No attachment of supporting documents (lab results, prescriptions, discharge summaries, radiology reports) to a claim/invoice. |
| G8 | **No E-claim / NHIS claim format** | No export to NHIA/HMO claim formats or CSV/XML, no claim batch file. |
| G9 | **No per-claim rejection handling** | If the HMO rejects line items, there is no way to flag disputed lines, mark them denied, or rebuild the invoice excluding them. |

### 3.4 🟠 Pre-authorization (partially built, not operational)

| # | Gap | Detail |
|---|-----|--------|
| G10 | **No auth-requests UI page** | Backend routes exist (`GET/POST/PUT /api/insurance/auth-requests`) but there is **no `/insurance/auth-requests` page**. Staff cannot create, approve, or review auth requests in the UI. |
| G11 | **No auth → case creation link** | No "create case from approved auth" flow; approved auth codes are not auto-attached to new cases. |
| G12 | **No auth expiry enforcement** | `validity_end_date` is stored but nothing expires codes, flags expired cases, or warns before billing with an expired code. |
| G13 | **No billing-vs-auth validation** | Invoice generation does not check that services billed are within the authorized amount or the auth code is valid. |
| G14 | **No auth required for high-cost services** | No gate requiring authorization before admissions, surgeries, or expensive procedures. |

### 3.5 🟠 Coverage, Formulary & Pricing

| # | Gap | Detail |
|---|-----|--------|
| G15 | **No per-provider negotiated pricing** | Each provider's negotiated rates for services/drugs are not stored. Auto-synced services are added at price **₦0** and staff manually price every item. |
| G16 | **No drug formulary / coverage rules** | Which drugs/tests/procedures each provider covers (or covers with restrictions) is not modeled. |
| G17 | **Excluded services not enforced** | `insurance_excluded_services` table exists but: no management UI per provider, not excluded from auto-sync, not excluded from co-pay/billing. |
| G18 | **No service catalog linkage** | Auto-sync does not pull standard prices from the clinical catalogs (lab price list, pharmacy selling price, radiology price list, admission fee). |
| G19 | **No capitation vs fee-for-service** | Retainership/capitation models (fixed periodic payment regardless of usage) are not supported — everything is fee-for-service billing. |

### 3.6 🟠 Co-pay & Patient Billing

| # | Gap | Detail |
|---|-----|--------|
| G20 | **Paypoint insurance toggle does not collect co-pay** | The "Bill to Insurance" flow sends everything to insurance; the patient's co-pay is not simultaneously calculated/collected. The separate `POST /api/insurance/co-pay/pay` endpoint has **no UI** wired to it. |
| G21 | **Co-pay not service-aware** | Co-pay is computed from `total_billed` using a single % or fixed amount; it does not exclude non-covered/excluded services, nor apply per-service rules (e.g., drugs 5%, labs 10%). `co_pay_collected` exists only as a case-level BOOLEAN column on services (unused) and a case-level amount. |
| G22 | **No co-pay receipt** | Co-pay payment creates a payments row but there is no receipt/UI flow; no co-pay outstanding vs collected report. |
| G23 | **No coverage check before billing** | Paypoint/Pharmacy do not verify the policy is active (end date) or that the service is covered before offering "Bill to Insurance". |

### 3.7 🟡 Case Lifecycle & Workflow Automation

| # | Gap | Detail |
|---|-----|--------|
| G24 | **No case close/reopen workflow** | Cases have a `status` field but no UI/logic to close a case when treatment ends, or reopen on new encounters. Cases accumulate services forever. |
| G25 | **No auto-auth expiry flagging** | Expiring/expired auth codes are not flagged on cases. |
| G26 | **No notifications** | No in-app/email alerts for: pending auth, approved/denied auth, invoice sent/paid/overdue, claim rejected, case auto-created. |
| G27 | **No insurance-specific audit trail** | Price/quantity changes on services, case edits, invoice transitions are not logged. The plan called for an audit log; it is absent. |

### 3.8 🟡 Reporting & Analytics

| # | Gap | Detail |
|---|-----|--------|
| G28 | **No reports page** | `/insurance/reports` is referenced in the sidebar but **no component exists**. No utilization, financial, or patient reports. |
| G29 | **No outstanding / aging report** | No per-provider outstanding balance, no 30/60/90-day aging of sent-but-unpaid invoices. |
| G30 | **No billed vs paid vs outstanding summaries** | Dashboard shows a month-billed figure only; no provider breakdown, no claim rejection rate, no top services, no utilization by service type. |

### 3.9 🟡 Invoice / Document Gaps

| # | Gap | Detail |
|---|-----|--------|
| G31 | **No PDF export / download** | Only a `window.print()` button. No proper PDF generation or branded invoice document. |
| G32 | **No draft-invoice editing** | Draft invoices cannot have items added/removed/adjusted — only cancel-and-regenerate. |
| G33 | **No formal credit-note record** | Void just sets status; no credit-note table with reason/approval/created-by. |

### 3.10 🟡 Clinical Integration

| # | Gap | Detail |
|---|-----|--------|
| G34 | **Doctor consultation banner not wired** | `GET /api/insurance/patient-coverage/:patientId` exists but is not used in DoctorConsultation. Doctors cannot see a patient's active coverage/auth/co-pay during consultation. |
| G35 | **No Patient Chart insurance tab** | The plan called for an Insurance tab in the clinical Patient Chart; it exists only inside the insurance module. |
| G36 | **Triage/registration insurance awareness** | No insured badge in triage queue; auto-case creation exists but no insurance visibility for nurses/records. |

### 3.11 🟡 Misc

| # | Gap | Detail |
|---|-----|--------|
| G37 | **No walk-in insured patient flow** | WalkInSales has no insurance option. |
| G38 | **No dependent/member verification** | Policy holder relationship exists but no member/dependent lookup or verification that a billed patient is a covered member. |
| G39 | **No bulk service import/review** | Auto-sync adds everything silently; no "review before sync" or batch import with pricing. |
| G40 | **No provider agreement/credit terms** | No fee schedule, payment terms, or credit limit per provider. |
| G41 | **No reconciliation with main payments** | HMO payments received (e.g., bank transfer) are not linked to the main `payments` table or reconciled against invoices. |

---

## 4. What a Standard Insurance Module Should Have (EMR/HMS Reference)

### 4.1 Core Registry & Setup
1. **Provider/HMO registry** — name, code, category, contacts, agreement, fee schedule, payment terms, active flag. ✅ partial
2. **Provider fee schedules / negotiated rates** per service type and drug. ❌
3. **Drug formulary + coverage rules** (covered / not covered / prior-auth required / quantity limits). ❌
4. **Excluded services management** per provider with UI. ⚠️ table only
5. **Insurance staff & roles** (super admin, provider admin, editor, viewer) with real server-side auth. ⚠️ exists but auth is weak (G1–G4)

### 4.2 Patient / Member Management
6. **Multiple policies per patient** (primary/secondary/tertiary, dependents). ✅
7. **Member verification** — validate policy number, active status, end date before billing. ❌
8. **Dependent/relationship handling**. ⚠️ field only
9. **Insurance info on registration & edit** with searchable provider. ✅
10. **Patient coverage summary** visible in clinical workflows (registration, triage, doctor consultation, patient chart). ⚠️ API only

### 4.3 Coverage Episode (Case)
11. **Case per visit/admission/episode** with provider, policy, auth code, coverage period. ✅
12. **Case status lifecycle** — active → closed / reopened / voided. ⚠️ field only
13. **Auto-create case** on registration/encounter/admission. ✅ registration only
14. **Case financial summary** — billed, invoiced, uninvoiced, co-pay collected/outstanding. ✅

### 4.4 Pre-Authorization
15. **Auth request creation** with requested services, estimate, clinical justification. ⚠️ API only
16. **Auth approval/denial/partial/expiry workflow** with codes and validity. ⚠️ API only
17. **Create case from approved auth**. ❌
18. **Enforce auth at billing** — block/flag services exceeding authorized amount or using expired codes. ❌
19. **Auth required for high-cost services** (admissions, procedures). ❌

### 4.5 Service Capture & Billing
20. **Auto-import of clinical services** (completed lab/radiology/pharmacy dispensed/admissions/encounters/treatments/fluids/maternity). ✅
21. **Standard pricing from catalogs** with staff override. ❌ (prices default 0)
22. **Manual add/edit/remove services** for billing only (parallel layer). ✅
23. **Prevent double-billing** at service level. ✅
24. **Coverage validation** per service (covered, excluded, formulary). ❌

### 4.6 Invoicing & Claims
25. **Invoice generation** per case and per period. ✅
26. **Invoice lifecycle** draft → sent → paid (+ partial payments). ✅
27. **Cancellation that reopens services**. ✅
28. **Void / credit-note with formal record**. ⚠️ no credit-note record
29. **Claim submission tracking** — submitted, acknowledged, rejected, re-submitted, partial. ❌
30. **Supporting documents attached to claims**. ❌
31. **E-claims / NHIS formats / CSV export**. ❌
32. **PDF invoice/claim documents**. ❌
33. **Outstanding balance & aging** per provider. ❌

### 4.7 Co-Pay & Patient Payments
34. **Co-pay calculation** by provider method, excluding non-covered services. ⚠️ basic only
35. **Co-pay collection at Paypoint** with receipt, integrated with the normal payment flow. ❌
36. **Co-pay outstanding tracking** per case/patient. ⚠️ case-level only
37. **Reconciliation** of co-pay collected with payments. ⚠️ history API only

### 4.8 Financial & Operational Reporting
38. **Utilization reports** (services by type, provider, period; top services). ❌
39. **Financial reports** (billed, invoiced, collected, outstanding, aging, write-offs). ❌
40. **Per-provider P&L / statement**. ❌
41. **Auth metrics** (pending, approval rate, turnaround). ❌
42. **Claim performance** (submission, rejection rate, average days to payment). ❌
43. **Dashboard KPIs** (monthly billed, outstanding, pending auth, expiring auth, active cases). ⚠️ minimal

### 4.9 Workflow Automation & Integration
44. **Notifications** (in-app + email): auth, invoice, claim, expiry alerts. ❌
45. **Audit trail** for all insurance actions. ❌
46. **Insurance visibility in clinical modules** (doctor banner, patient chart tab, triage badge). ❌
47. **Bill-to-insurance from Paypoint/Pharmacy** with co-pay split. ✅ (co-pay split ❌)
48. **Payment reconciliation** between HMO payments and invoices. ❌
49. **Batch/bulk service import with review**. ❌

### 4.10 Security & Tenancy
50. **Real auth** — JWT/session validation server-side; roles enforced from DB, not headers. ❌
51. **Granular permissions** per action (create/void/price/invoice/pay). ❌
52. **Multi-tenant correctness** — tenant_id from session everywhere. ❌
53. **Provider data isolation** enforced server-side from session. ⚠️ header-based

---

## 5. Prioritized Roadmap

### Phase A — Correctness & Security (do first)
1. **G1–G4**: Replace header-based authorization with a real insurance-staff session/JWT. Verify role + provider_id server-side from the DB on each request (a `requireInsuranceRole` middleware). Keep the master token ONLY as super-admin, and stop sending it on all insurance calls (or scope it).
2. **G5**: Replace hardcoded tenant_id with `getTenantId()` in all insurance routes.
3. **G14/G19**: Add basic billing validation middleware (auth validity check, excluded-service check) before service invoice generation.
4. **G17**: Add excluded-services management UI + enforce exclusions in auto-sync and co-pay.

### Phase B — Operational completeness
5. **G10/G11/G12**: Build the auth-requests UI page; add "create case from approved auth"; add expiry flagging.
6. **G20/G21/G22**: Wire co-pay into Paypoint "Bill to Insurance" (split checkout: insurance portion + co-pay), service-aware co-pay, receipts.
7. **G6/G7/G9**: Add claim lifecycle (submitted/acknowledged/rejected/partial/re-submitted), claim documents, disputed-line handling.
8. **G28–G30**: Build reports page — utilization, financial, aging, provider statements.
9. **G34/G35/G36**: Wire doctor consultation coverage banner; add Patient Chart insurance tab; triage insured badge.

### Phase C — Advanced
10. **G15/G16/G18**: Provider fee schedules, formulary, catalog pricing linkage (auto-price synced services from catalogs).
11. **G31/G32/G33**: PDF invoice export, draft-invoice editing, formal credit-note records.
12. **G26/G27**: Notifications (in-app + email), insurance audit log.
13. **G19**: Capitation/retainership model support.
14. **G8**: E-claims / NHIS claim file export.

---

## 6. Detailed Notes on Highest-Risk Gaps

### 6.1 Security (G1–G4) — must fix before production
Because `x-master-token` is attached to every request by the interceptor, `isSuperAdmin(req)` returns true for any user. Every "super admin only" branch is therefore open. Combined with client-supplied `x-user-role`/`x-user-provider-id`, a user can:
- Deactivate/hard-delete any insurance staff
- Change any provider code after 24h
- Read/edit another provider's cases, patients, invoices

**Recommended fix:** a dedicated `insuranceAuthGuard` that loads the staff row from `insurance_staff_users` by an authenticated session (JWT from login), then uses `role` + `provider_id` + `access_scope` from that row for every check. `isSuperAdmin` should only pass for an actual super-admin credential, not a shared static header.

### 6.2 Co-pay split checkout (G20/G21)
The "Bill to Insurance" flow currently sends 100% of the charge to the HMO. In practice, insured patients owe a co-pay. The correct flow:
1. Paypoint computes covered amount (from case services) and co-pay (provider method, excluding non-covered).
2. Staff collects co-pay as a normal payment (reuse `POST /api/insurance/co-pay/pay`).
3. Remaining amount is billed to insurance via `bill-to-insurance`.
Both happen in one checkout session, producing two receipts/records.

### 6.3 Claim vs Invoice (G6–G9)
A clean model separates them:
- **Invoice** = hospital's bill to HMO (internal financial record).
- **Claim** = the submission/reimbursement record (can reference one or more invoices), with its own status lifecycle and rejection handling.
The current design merges them. If adding a separate claim table is too heavy, at minimum add claim status + rejection reason + re-submission state to the invoice and expose it in UI.

---

## 7. Conclusion

The insurance module has a strong billing backbone and the correct core principle (parallel billing layer that never mutates clinical records, service-level invoicing that prevents double billing). To reach a production-grade standard it needs:

1. **Hard security fix** (real session auth + DB-backed roles + scoped master token) — critical.
2. **Tenancy fix** — critical for SaaS.
3. **Operational features**: auth-request UI, claim lifecycle, co-pay split checkout, reports, exclusions enforcement.
4. **Integration**: doctor coverage banner, Patient Chart tab, notifications, audit trail.
5. **Advanced**: fee schedules, formulary, catalog pricing, PDF/E-claims, capitation.

Priority order: **Phase A (security/tenancy) → Phase B (operations) → Phase C (advanced)**.
