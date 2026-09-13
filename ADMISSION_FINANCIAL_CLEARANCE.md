# Admission Financial Clearance (Discharge Gate) — Phases 1 & 2

**Status:** Implemented, tested, applied to the development database
**Date:** 10 September 2026
**Scope:** Prevent patients from being discharged (absconding) with an unpaid balance; deposits; two-step discharge clearance; finance worklist; final bills.

> **Phase 2 (deposits, request→clear workflow, Finance worklist, clearance badges, final-bill print) is documented in section 14.** Everything in Phases 1–2 is complete. Only Phase 3 items (corporate/credit accounts, insurance co-pay, credit limits) remain.

---

## 1. Problem

Before this work, a patient could be **discharged from an admission with an unsettled bill**. Lab orders were gated until paid and bed assignment required the admission fee, but the discharge action itself (`PUT /api/admissions/:id/discharge`) only required a written summary — it never checked bed-days, drugs, labs, imaging, consultations or the admission fee. This allowed "absconding" with an outstanding balance.

A diagnosis of the existing billing model confirmed:
- Every charge already carries an `is_paid` flag: `admissions.is_paid`, `admission_daily_charges.is_paid`, `lab_orders.is_paid`, `radiology_orders.is_paid`, `prescriptions.is_paid`, `visits.consultation_status`, `referrals.consultant_fee_status`.
- There was **no payer type, no clearance state, no deposit/ledger and no discharge check**.

## 2. What was implemented

1. **A single source of truth for a patient's outstanding items** — the exact list Paypoint already shows — reused by both Paypoint and the discharge gate.
2. **An outstanding-balance service** for a patient / admission.
3. **A discharge clearance gate** that blocks discharge when money is owed, **unless the payer is approved** (active insurance).
4. **An administrator override** with a mandatory reason, fully audited and snapshotted.
5. **UI in the discharge modal** showing the live bill and enforcing/explaining the gate.

---

## 3. Data model

### Migration `database/078_admission_financial_clearance.sql`
Adds to `admissions`:

| Column | Purpose |
|---|---|
| `payer_type` | `self_pay` or `insurance` (recorded at discharge) |
| `clearance_status` | `pending` / `cleared` / `overridden` |
| `cleared_by` | Staff who cleared/overrode |
| `cleared_at` | When clearance happened |
| `balance_at_clearance` | The balance at the moment of discharge |
| `override_reason` | Mandatory reason when overridden |
| `final_bill_total` | Frozen final bill total |
| `final_bill_items` (JSONB) | Frozen final bill line items (immutable snapshot) |

Plus index `idx_admissions_clearance (tenant_id, status, clearance_status)`.

### Migration `database/079_admission_clearance_backfill.sql`
Corrects a subtlety: `ADD COLUMN ... DEFAULT 'pending'` also backfills **existing** rows, so the original `WHERE clearance_status IS NULL` backfill never fired. 079 sets historical **non-active** admissions to `cleared` while leaving currently-active admissions `pending`.

**Result in the dev database:** 7 discharged → `cleared`, 9 active → `pending`, 0 non-active left as `pending`.

---

## 4. Shared outstanding-items builder (refactor)

`server/src/utils/patientPendingItems.ts` (new) — `buildBasePendingItems(patientId, tenantId)`:
- Reads (only) unpaid: folder activation, prescriptions, labs, radiology, admission fee(s), accrued bed-day charges, pending consultations and pending referral fees.
- Prices items from inventory exactly as Paypoint does (`loadInventoryPriceMap`).
- **Read-only, no side effects.** Insurance auto-billing stays in the Paypoint endpoint.

`server/src/routes/payments.ts` was refactored to call this builder for `GET /api/payments/pending/:patientId`. The local `cleanItemDescription` / `loadInventoryPriceMap` helpers moved into the shared module (imported back into payments). This guarantees **Paypoint and the gate can never disagree** on what is owed.

**Parity verified:** for a self-pay patient, the pending endpoint and the balance service return the same item count and the same total (test: `266,600` / 21 items).

---

## 5. Balance service and gate logic

`server/src/utils/patientBalance.ts` (new):
- `getPatientBalance(patientId, tenantId)` → `{ items[], total, item_count, insured, insurance_case_id, insurance_provider }`.
- `getAdmissionBalance(admissionId, tenantId)` → resolves the admission then the patient balance.
- `evaluateClearance(balance)` → decision:

| Condition | Outcome |
|---|---|
| No outstanding items | **Allowed** — `No outstanding balance` |
| Items owed, active insurance policy | **Allowed** — approved payer (`payer_type = insurance`) |
| Items owed, self-pay | **Blocked** — must settle at Paypoint |

An item with a missing price still counts as an outstanding item, so an unpriced order cannot be used to slip through.

---

## 6. API changes

### `GET /api/admissions/:id/balance` (new)
Returns the admission, the line-item bill, totals, insurance info, and the clearance decision (`can_discharge`, `reason`, `payer_type`). Runs the daily bed-charge accrual first so the bill is current.

### `PUT /api/admissions/:id/discharge` (changed)
Now:
1. Verifies the admission is active and accrues the final bed day **before** pricing.
2. Computes the patient's outstanding balance.
3. If blocked:
   - **No override** → `402` with `{ message, balance, payer }`; the admission is **not** discharged.
   - **Override requested** → requires an **Admin** actor and a non-empty reason; otherwise `403` / `400`.
4. On success, sets `status='discharged'`, `clearance_status` (`cleared` or `overridden`), `cleared_by/at`, `balance_at_clearance`, and freezes `final_bill_total` + `final_bill_items`.
5. Writes the existing old/new audit log entry.

---

## 7. UI — `client/src/components/DischargeModal.tsx`

Used by every discharge entry point (Admissions, Active Patients, Assignment Board, Doctor Consultation, My Patients), so the gate applies everywhere with one change.

- On open, fetches `/admissions/:id/balance`.
- Shows a **Financial Clearance** panel:
  - Green **"No outstanding balance"**, or
  - Blue **"Approved payer — discharge allowed"** with the insurer name, or
  - Red **"Outstanding balance — settle before discharge"** with the itemised bill and total.
- **Confirm Discharge is disabled** while blocked.
- Non-admins see: *"Send the patient to Paypoint to settle these items; then re-open discharge."*
- Admins see an **Override** checkbox + mandatory reason; Confirm enables only when a reason is given.
- A `402` response re-fetches and refreshes the bill inline.

---

## 8. Tests (all passing)

| Suite | Checks | Result |
|---|---|---|
| Balance endpoint + Paypoint parity | 8 | ✅ 8/8 |
| Discharge gate + override (self-pay blocked, non-admin 403, admin override, settled clear, insured bypass) | 16 | ✅ 16/16 |
| Multi-admission discharge summaries (regression, with gate) | 9 | ✅ 9/9 |

All synthetic admissions/audits created by tests were deleted; final residue check: **0 test admissions, 0 test audit rows, 16 total admissions unchanged**.

Migration `078` and `079` recorded in `schema_migrations`. Server and client typecheck; client production build succeeds.

---

## 9. How staff operate it

1. Doctor/Nurse open Discharge → the modal shows the **bill**.
2. If a balance is due (self-pay), send the patient to **Paypoint**; items settle through the existing payment flow (`is_paid = true`).
3. Re-open Discharge → balance is now zero → **Confirm Discharge** is enabled.
4. **Insured** patient with an active policy → discharge is allowed; charges are claimed from the insurer.
5. **Exception** (LAMA/emergency/waiver) → an **Administrator** ticks Override and records the reason; the discharge is marked `overridden` and snapshotted.

---

## 10. Behaviour rules & edge cases

- The gate is **patient-wide**, not just this admission: any unpaid item for the patient (old unpaid orders included) blocks, which is correct for debt/absconding prevention.
- Cancelled/completed lab and radiology orders are excluded; cancellations do not create false debt.
- Insurance with an active primary policy bypasses the gate (approved payer). **Co-pay is not yet gated** — see Phase 2.
- Historical (already-discharged) admissions are marked `cleared` and are unaffected.
- **Operational note:** after deploy, existing **active** admissions cannot be discharged until settled or overridden. This is intended.

---

## 11. Limitations / roadmap

**Phase 2 (deposits & running account):** a `patient_deposits` ledger, deposit/part-payment application, an interim bill, and a dedicated Finance "pending clearance" worklist so receipt of payment can clear admissions explicitly.

**Phase 3 (payers & credit):** a `credit_approvals` table (corporate/retainer/waiver with limits), insurance **co-pay** gating, HMO authorization states, and interim/final bill printing.

---

## 12. Files changed

| File | Change |
|---|---|
| `database/078_admission_financial_clearance.sql` | New — clearance columns + index |
| `database/079_admission_clearance_backfill.sql` | New — correct legacy backfill |
| `server/src/utils/patientPendingItems.ts` | New — shared read-only pending-items builder |
| `server/src/utils/patientBalance.ts` | New — balance + clearance decision |
| `server/src/routes/payments.ts` | Refactor — reuse the shared builder |
| `server/src/routes/admissions.ts` | `GET /:id/balance` + gated `PUT /:id/discharge` |
| `client/src/components/DischargeModal.tsx` | Bill panel, block/override UI |

## 13. Verification quick reference

- Balance: `GET /api/admissions/:id/balance` (header `x-master-token: sretan-emr-master-token-2026`).
- Blocked discharge: `PUT /api/admissions/:id/discharge` with a summary → `402` + `balance`.
- Override: same call with `override: true, override_reason: "..."` and an **Admin** `discharged_by` → `200`, `clearance_status = overridden`.

---

# 14. Phase 2 — Deposits, two-step clearance, worklist & final bills

**Status:** Implemented, tested, migrated.

## 14.1 Migration `database/080_admission_deposits_and_clearance_workflow.sql`
- `admissions.discharge_requested_at`, `admissions.discharge_requested_by` (+ partial index for the worklist).
- New `patient_deposits` table: `patient_id`, `admission_id`, `amount`, `method`, `status` (`held`/`applied`/`refunded`), `payment_id`, `notes`, `created_by`, timestamps.

## 14.2 Balance now nets deposits
`getPatientBalance` returns `charges_total`, `deposits_held`, `outstanding = max(0, charges_total − deposits_held)`, plus `insured`/provider. `total` remains an alias of `charges_total` for backward compatibility. `evaluateClearance` allows discharge when there are no items, `outstanding <= 0`, or the payer is insured.

## 14.3 Two-step discharge (block release, not the summary)
- `POST /api/admissions/:id/request-discharge` — saves the summary/instructions, sets `discharge_requested_at/by`, keeps the patient admitted pending clearance.
- `POST /api/admissions/:id/clear` — Finance/Paypoint finalizes: accrues the last bed day, re-prices, and either clears (outstanding ≤ 0 / insured) or is blocked `402` unless an **Admin** override + reason is supplied. On success it sets `status='discharged'`, `clearance_status`, `cleared_by/at`, `balance_at_clearance`, and freezes `final_bill_total` + `final_bill_items`.
- `PUT /api/admissions/:id/discharge` is retained and shares the exact same finalize routine (`finalizeDischarge`), so all callers behave identically.
- **Settlement:** on clear, `settleOutstandingItems` marks the source orders paid and `applyHeldDeposits` consumes held deposits, so Paypoint no longer shows the account as owing.

## 14.4 New/extended endpoints
| Endpoint | Purpose |
|---|---|
| `POST /api/admissions/:id/request-discharge` | Doctor submits for clearance |
| `POST /api/admissions/:id/clear` | Finance/Admin finalizes (override supported) |
| `GET /api/admissions/pending-clearance` | Worklist (active + requested), each with balance + `can_clear` |
| `GET /api/admissions/:id/deposit` | Deposits for an admission |
| `POST /api/admissions/:id/deposit` | Record a held deposit; returns updated balance |

## 14.5 UI
- **`DischargeModal.tsx`** — shows charges, deposits, net outstanding and payer. When blocked: **Settle at Paypoint** (navigates to `/paypoint/dashboard?patient_id=…`), **Submit for Clearance**, and (Admin) **Override & Discharge** with a reason. When clear/insured: **Confirm Discharge**.
- **`PaypointDashboard.tsx`** — reads `?patient_id` from the URL to preselect the patient handed over from discharge.
- **`AdmissionClearance.tsx`** (new) — Finance/Paypoint/Admin worklist with per-row **Bill**, **Deposit**, **Clear**, and **Override**. Status pills: Ready / Funds due / Insured.
- **`AdmissionBillModal.tsx`** (new) — interim bill and final settlement statement with **Print / Save PDF** (hospital letterhead, itemised charges, deposits, outstanding).
- **`AdmissionsPage.tsx`** — history now shows a **clearance badge** (`Cleared` / `Overridden` / `Pending`, with the override reason as a tooltip) and a **Final Bill** button.
- **Routes/nav** — `/admissions/clearance` (roles Paypoint, Finance, Admin) and a "Pending Clearance" sidebar entry.

## 14.6 Touchpoint status (all requested items)
| Touchpoint | Status |
|---|---|
| DischargeModal live bill / outstanding / payer | ✅ |
| DischargeModal deposits | ✅ |
| DischargeModal "Settle at Paypoint" | ✅ (prefills Paypoint) |
| DischargeModal "Submit for Clearance" | ✅ |
| Block release, not the summary | ✅ |
| Finance/Paypoint Pending Clearance worklist | ✅ |
| Admin approve credit/waiver with reason | ✅ (override at clear; credit limits are Phase 3) |
| Clearance badge in admissions history | ✅ |
| View Final Bill | ✅ |
| Print interim bill / final settlement statement | ✅ |

## 14.7 Tests (Phase 2)
| Suite | Checks | Result |
|---|---|---|
| Request → deposit → clear, override clear, worklist | 15 | ✅ 15/15 |
| Phase 1 gate + override (regression) | 16 | ✅ 16/16 |
| Balance/Paypoint parity (regression) | 8 | ✅ 8/8 |

Verified after tests: no residue, `patient_deposits = 0`, 16 admissions, 7 cleared / 9 pending, no active admission left pending clearance. Server & client typecheck; client build passes.

## 14.8 Files added/changed (Phase 2)
| File | Change |
|---|---|
| `database/080_admission_deposits_and_clearance_workflow.sql` | New — request fields + `patient_deposits` |
| `server/src/utils/patientBalance.ts` | Deposits, net outstanding, settle & apply helpers |
| `server/src/routes/admissions.ts` | request/clear/worklist/deposit endpoints; shared finalize |
| `client/src/components/DischargeModal.tsx` | Two-path flow + deposits |
| `client/src/components/PaypointDashboard.tsx` | Preselect patient from URL |
| `client/src/components/AdmissionClearance.tsx` | New — worklist |
| `client/src/components/AdmissionBillModal.tsx` | New — interim/final bill + print |
| `client/src/components/AdmissionsPage.tsx` | Badge + Final Bill |
| `client/src/App.tsx` | Route + sidebar entry |

## 14.9 Phase 2 refinements (follow-up)

- **Clinical actions hidden while pending clearance.** Once `discharge_requested_at` is set, the **Discharge** and **Consult** buttons are hidden and replaced with an "Awaiting clearance" state on the Admissions active list and the Assignment Board — the doctor can no longer re-consult or re-discharge a patient who is with Finance.
- **Sidebar badge for Pending Clearance.** `/api/dashboard/sidebar-counts` now returns `pending_clearance` (active admissions with a submitted discharge). The sidebar "Pending Clearance" link shows a count badge **only when > 0**.
- **Deposit behaviour (how a deposit clears bills).** A deposit is held on account and **reduces the outstanding balance**: `outstanding = charges_total − deposits_held` (never below 0). Example from live data: charges ₦265,000, deposit ₦200,000 → outstanding ₦65,000 (still "Funds due", clear blocked). A further deposit of ₦65,000 brings outstanding to 0 → "Ready" → **Clear** succeeds, at which point the remaining source orders are marked paid and all held deposits are marked `applied`. A deposit larger than the bill simply brings outstanding to 0.

## 14.10 Refinement tests
- Sidebar count + partial deposit → still blocked → remaining deposit → clear → deposits applied → 15/16 (the single "failure" was the user's own live pending clearance, not a defect).

## 14.11 Deposits now settle bills (fix)

**Problem:** a deposit only reduced the internal balance; `/paypoint/patients`, `/paypoint/pending`, the patient card and the pending counts still listed the items at full value, so the deposit "did not reflect".

**Fix (migration `081_patient_deposit_applied_amount.sql`):**
- Deposits are now **applied to outstanding items, oldest/whole items first, as soon as they are received** — `applyHeldDepositsToItems` marks the fully-covered source orders (`is_paid`, consultation/referral status, folder activation) and tracks `applied_amount` on the deposit. Any remainder stays `held` as credit.
- Every reader reconciles first so existing deposits apply immediately: `GET /payments/pending/:patientId`, `GET /payments/pending-summary`, `GET /payments/all-pending-items`, `GET /dashboard/sidebar-counts`, and the balance service.
- The per-patient pending response also nets any leftover credit smaller than one item against the first remaining item and reports `deposit_applied`, so the cashier collects only the net amount.
- **Settlement statement preserved** (`082_deposit_applications.sql`): each item a deposit pays is recorded, and the discharge final bill = deposit-applied items + anything still outstanding, scoped to the admission window.

**Verified:** a ₦20,000 bill (₦5,000 admission + ₦15,000 bed) with a ₦10,000 deposit → the ₦5,000 admission item is marked paid (deposit `applied_amount = 5000`, `held`), and Paypoint shows the net **₦10,000** due. Depositing the remaining ₦10,000 clears the account entirely; the final bill still itemises what was paid. Suites: gate 16/16, deposit reflection 9/9, phase2 15/15, parity 8/8; no residue.

> Data reconciliation: the ₦200,000 deposit for *James Shalom* (the only deposit on file — it was 200k, not 300k) is now recorded as fully applied. A transient bug in an earlier build had marked his items paid without consuming the deposit; this was corrected, leaving the true remaining balance of ₦60,000 (4 bed-days) visible in Paypoint and the clearance worklist. Verified: gate 16/16, phase2 15/15, deposit reflection 9/9, parity 8/8; no test residue.

## 14.12 The clearance worklist shows the gross bill (deposits only reduce outstanding)

The worklist's **Charges** column is now the **gross bill for the admission episode** — admission fee, every bed-day and every service ordered during the stay, **paid or not** — computed independently of `is_paid` and of deposit application. Deposits and payments are credits that reduce **only the Outstanding**:

```
Charges      = gross episode bill
Deposits     = total deposits on the patient's account (applied + held)
Payments     = Paypoint payments matched to the episode's items
Outstanding  = max(0, Charges − Deposits − Payments)
```

- `getAdmissionBalance` was rewritten to build the gross item list (`getAdmissionGrossItems`), so a deposit never shrinks `charges_total`.
- Payments offset only the specific bill items they paid (matched by source order id), so unrelated or pre-admission payments don't reduce the admission bill.
- `evaluateClearance` now keys on `outstanding` (deposits/payments settle it), not on the item count.
- The discharge **final bill** is the gross episode list, so the settlement statement itemises the full bill even when fully prepaid.

**Live check (James Shalom):** Charges **₦260,000**, Deposits **₦216,000**, Outstanding **₦44,000**, status "Funds due" — the ₦216,000 in deposits is shown but does **not** reduce the ₦260,000 charges, only the balance.

## 14.13 Clearance worklist: tabs, history, pagination, search & date filters

`/admissions/clearance` is now a full worklist:

- **Tabs** — **Pending** (discharges awaiting clearance) and **History** (cleared / overridden admissions), each with its own data and a live count on the Pending tab.
- **Pagination** — 25 rows per page on both tabs, with `Page X of Y · N records` and Prev/Next.
- **Search** — patient name or hospital number (debounced), on both tabs.
- **Date filters** — All Time, Today, Yesterday, This Week, This Month, This Year, Custom Day, Custom Range. Pending filters on `discharge_requested_at`; History filters on `discharged_at`.
- **History table** — Patient, Ward/Bed, Admitted, Discharged, Cleared by, Status (Cleared / Overridden with the override reason on hover) and **Final bill**, with a **Final Bill** button that opens the settlement statement modal (same `AdmissionBillModal` used by the admissions history).
- **Pending table** — Patient, Ward/Bed, Requested (and by whom), **Charges**, **Deposits**, **Outstanding**, Status (Ready / Funds due / Insured) and actions **Bill**, **Deposit**, **Clear**, **Override**.

**Server endpoints**
- `GET /api/admissions/pending-clearance?page&limit&search&date_from&date_to` → `{ rows, total, page, limit }` (plain array if no `page`).
- `GET /api/admissions/clearance-history?page&limit&search&date_from&date_to` → `{ rows, total, page, limit }`; rows include the frozen `final_bill_total` / `final_bill_items`, `clearance_status`, `override_reason`, and `cleared_by_name` / `discharged_by_name`.

**Verified:** endpoint shape (7/7) — pagination, search, and date filtering on both tabs. Live history shows **8** cleared admissions; James Shalom's final bill reads **₦260,000** across **18** items, cleared by *Paypoint Clerk Chidi*.

## 14.14 Deposits are receipted payments (Finance visibility)

**Gap:** deposits lived only in `patient_deposits`, while Finance's payment history and revenue read `payments`/`payment_items`. So deposit money was invisible to Finance and there were no receipts for the items a deposit paid.

**Fix:** a deposit is money received, so it is now recorded as a receipted payment:
- `POST /api/admissions/:id/deposit` creates a `payments` row (with a generated **RCP** receipt number) and a `payment_items` row (`service_type = 'deposit'`, `is_converted = true` so it never appears as a pending order), and links `patient_deposits.payment_id` to it.
- **Finance** now sees the deposit in `GET /api/payments` (Payment History) and in revenue stats; the deposit receipt opens like any other payment.
- **Applying** the deposit to items (`applyHeldDepositsToItems`) is allocation only — it marks the covered orders paid and records `deposit_applications`, but creates **no** second payment, so revenue is counted exactly once (at receipt).
- **Receipts in the UI:** after recording a deposit, the Clearance page shows a "Deposit received" panel with the receipt number and a **Print Receipt** button (`printPaymentReceipt`).
- **Backfill:** `backfillDepositPayments()` runs at server start (idempotent) and records a payment for any existing deposit lacking one. Applied: all deposits now have receipts.

**Verified (7/7):** deposit returns a receipt number + payment id, Finance can fetch the payment (with its item), the deposit appears in `GET /api/payments`, and `patient_deposits.payment_id` is linked. Live backfill produced receipts e.g. James Shalom ₦200,000 / ₦44,000 / ₦11,000 / ₦5,000 and Musatapha Andres ₦20,000.

## 14.15 Deposit receipt: labelled "DEPOSIT RECEIPT" and itemises what it covered

- **Labelled a deposit.** The receipt builder takes a title; `printDepositReceipt()` prints a **"DEPOSIT RECEIPT"** (not a plain payment receipt). The on-screen confirmation shows a **DEPOSIT RECEIPT** badge.
- **Itemised coverage.** `applyHeldDepositsToItems` now attributes each settled order to the exact deposit(s) that funded it (`deposit_applications.deposit_id`, split across deposits when a single item spans more than one). `POST /admissions/:id/deposit` returns `covered_items` for that deposit, and the receipt lists them (with the amount each deposit contributed).
- **Unapplied remainder.** If a deposit has not yet settled a bill (held as credit), the receipt prints "Deposit on account" and the UI notes it is held as credit.

**Verified (8/8):** a ₦15,000 deposit covered the ₦5,000 admission fee (₦10,000 left held); a further ₦5,000 deposit completed the ₦15,000 bed-day; each deposit reported its own `covered_items` and the attributions reconcile to the deposited totals.

## 14.16 Receipts: deposit-aware history + a comprehensive Receipts page

**Why it looked missing:** deposit receipts were in `payments`, but the Payment History **detail/print** treated them as ordinary payments (showing only "Deposit on account") and gave no covered items.

**Fixes**
- **`GET /api/payments/:id`** now returns `is_deposit`, the joined `deposit` record and `covered_items` (from `deposit_applications`). The **Payment History** detail modal is deposit-aware: it titles the document **"Deposit Receipt"**, lists the items the deposit settled, and **Print** emits a `DEPOSIT RECEIPT`. The list also shows a **Deposit** badge on deposit receipts.
- **`GET /api/payments`** now supports `page, limit, search, date_from, date_to, method, type` (`type=deposit|service`) and returns `{ rows, total, total_amount, deposit_count, service_count, page, limit }` when paginated (plain array unchanged when no `page`). Each row carries `is_deposit`.

**New page — `/receipts` (roles: Paypoint, Finance, Admin)**
- **Every receipt** in one place: All / Services / Deposits tabs, **search** (receipt no., patient, staff), **method** filter (Cash/Card/Transfer/POS), and **date filters** (All Time, Today, Yesterday, This Week, This Month, This Year, Custom Day, Custom Range).
- **Stats**: receipts count, total collected, deposit receipts, service receipts (for the current filter).
- **Table**: Receipt No., Date, Patient/Customer, Items, Method, Type (Deposit/Service), Amount, with **View / Receipt** actions.
- **Detail modal**: shows the receipt and its lines — for deposits, the items the deposit covered — and prints the correct document (`printDepositReceipt` for deposits, `printPaymentReceipt` otherwise). **Pagination** 25/page.
- Sidebar entry **Finance → Receipts**.

**Verified (11/11):** paginated shape + aggregates, deposit/service filters, method filter, receipt search, date range, backward-compatible array without `page`, and deposit detail returns `is_deposit` + `covered_items`. Client build and both typechecks pass.

## 14.17 Legacy deposit receipts itemised + Paypoint receipt fixed

**Two issues found and fixed:**

1. **"Items covered by this deposit" was empty for existing deposits.** Deposits applied before attribution existed had `applied_amount > 0` but no `deposit_applications` rows, so the receipt had nothing to list. `backfillDepositApplications()` (idempotent, runs at server start) reconstructs attribution for those legacy deposits: it allocates the admission's **gross items** to the patient's deposits, oldest first, up to each deposit's applied amount, and records the per-deposit rows. Deposits that already have attribution are skipped.
   - Verified on live data — all four of James Shalom's deposit receipts now itemise and reconcile exactly: ₦200,000 → 14 items (admission fee + 13 bed-days), ₦44,000 → 3, ₦11,000 → 2, ₦5,000 → 1; the sums equal each receipt total.

2. **`/paypoint/history` receipt ignored deposits.** Its success modal showed "Deposit on account" and printed a plain payment receipt. It is now deposit-aware: it titles the modal **"Deposit Received"**, lists the **covered items**, and prints a **DEPOSIT RECEIPT**. (Finance Payment History was already made deposit-aware in 14.16.)

**Also verified:** `GET /api/payments/:id` for each of James's deposit payments returns `is_deposit: true` with non-empty `covered_items`; client typecheck and build pass.

## 14.18 Scrollable receipt modals across the project

Receipt modals with many lines (e.g. a ₦200,000 deposit covering 14 items) overflowed the viewport. Every receipt modal now uses the same layout as the `/receipts` modal:

```
card      : max-h-[85vh] flex flex-col overflow-hidden
header    : flex-shrink-0
content   : flex-1 overflow-y-auto
footer    : flex-shrink-0
```

Applied to: **PaypointCheckout** (`/paypoint/history`), **BillingPage**, **PaypointDashboard**, **PaypointPending**, **PaypointPatients**. Already compliant (no change needed): **ReceiptsPage**, **FinancePaymentHistory**, **FinancePatientBilling**, **WalkInSales**. Header and footer stay pinned while the item list scrolls. Client typecheck and build pass.
