# Sretan HMS — Comprehensive Session Summary

**Date:** August 12, 2026
**Project:** Hospital Management System — Sretan HMS
**Repository:** https://github.com/LuckyGoldx/sretan-hms.git

---

## Table of Contents
1. [Project Structure](#1-project-structure)
2. [Core Modules Completed](#2-core-modules-completed)
3. [Current Session: Paypoint & Inventory System](#3-current-session-paypoint--inventory-system)
4. [Database Schema Changes](#4-database-schema-changes)
5. [Server API Endpoints](#5-server-api-endpoints)
6. [Frontend Components](#6-frontend-components)
7. [Payment Flow & Integration](#7-payment-flow--integration)
8. [Inventory System](#8-inventory-system)
9. [Role-Based Access Control](#9-role-based-access-control)
10. [Known Issues & TODOs](#10-known-issues--todos)
11. [How to Continue](#11-how-to-continue)
12. [Session 2026-08-12 — Insurance Module](#session-2026-08-12--insurancehmo-module-full-implementation--cross-module-compliance-fixes)

---

## 1. Project Structure

```
C:\Users\LuckyGold\Desktop\Sretan EMR\
├── client/
│   ├── src/
│   │   ├── components/        # React components
│   │   ├── hooks/             # Custom hooks (useAxios, useClinicConfig)
│   │   ├── types/             # TypeScript type definitions
│   │   ├── utils/             # Utility functions (compressImage, validatePhone)
│   │   ├── data/              # Static data (countries, occupations, formData)
│   │   ├── App.tsx            # Routing & sidebar configuration
│   │   └── main.tsx           # Entry point
│   ├── index.html
│   ├── package.json
│   └── vite.config.ts
├── server/
│   ├── src/
│   │   ├── routes/            # Express API routes
│   │   ├── middleware/        # Auth, CORS, errorHandler, clockGuard
│   │   ├── db/                # Database pool configuration
│   │   ├── config/            # Clinic profile reader
│   │   ├── setup/             # Setup console
│   │   └── server.ts          # Express server entry point
│   └── package.json
├── database/                   # SQL migration files
│   ├── 001_multi_tenant_schema.sql
│   ├── ...
│   └── 009_nurse_modules.sql
├── SESSIONS_SUMMARY.md
├── Master Guide Plan.md
└── SETUP.md
```

---

## 2. Core Modules Completed (Full History)

### 2.1 Pharmacy Module

#### Walk-in Sales (`/walk-in-sales`)
- Dedicated page for OTC/non-patient sales with cart system
- Searchable inventory, add/remove items, quantity controls, editable unit prices
- Multi-item checkout processing all cart items sequentially with inventory reduction
- Payment method selector (Cash/Card/Transfer) with receipt modal
- Responsive: desktop shows cart side-by-side, mobile shows floating cart button
- Cart badge on sidebar link, auto-refreshes pending count every 30s

#### Pharmacy Inventory (`/inventory`)
- Sortable, searchable inventory table with low stock alerts
- Add Item button restricted to Admin role only
- Category field (`pharmacy` / `lab`) separates pharmacy from lab inventory

#### Dispensing (`/dispensing`)
- Shows prescribing doctor name (fetched from encounter's staff_id)
- Dispense modal shows prescribed by doctor
- Payment check: server returns 402 if prescription is unpaid
- Paid/Unpaid badges on each prescription

### 2.2 Laboratory Module (Comprehensive Rewrite)

#### Lab Test Catalog
- 25+ predefined lab tests seeded (CBC, Malaria, LFT, RFT, Lipid Profile, etc.)
- Searchable dropdown in walk-in lab form
- API: `GET/POST /api/lab-test-catalog`

#### Lab Inventory (`/lab-inventory`)
- Dedicated page for lab supplies (category=`lab`)
- Sortable columns, low stock alerts, Admin-only add
- Price and cost price tracking

#### Lab Low Stock (`/lab-low-stock`)
- Shows only items below reorder level in lab category

#### Lab Workbench (`/lab`) — Major Rewrite
**Tabs:** Worklist | Results | History | Walk-in Lab | Orders
- **Worklist**: Full order lifecycle (ordered → collected → processing → completed)
  - Search by patient, test, or lab number. Filter by status. Pagination (15/page)
  - Collect Sample / Enter Results / View buttons — payment-gated
  - Only paid orders shown (is_paid === true)
- **Orders tab**: Two sections — Paypoint payments awaiting conversion (with Create Lab Order button) and unpaid lab orders (read-only with Awaiting Payment badge)
- **Results**: Pending Approval (approve/reject) and Completed sub-tabs
  - Approve sets status=completed, updates lab_order status, reduces inventory
- **History**: All approved/rejected results with details
- **Walk-in Lab**: Direct lab requests for non-patients with patient name, phone, test search, specimen type

#### Lab Numbering
- `lab_number`: unique per lab order (LAB-2026-XXXXX)
- `request_number`: groups multiple tests from same walk-in submission (REQ-XXXXX)
- `order_number`: sequential per test within a request (ORD-001)

#### Lab Notifications
- Sidebar badges: Lab Scientist sees pending order count, Doctor sees completed results count

### 2.3 Nurse Module

#### Dashboard (`/dashboard` for Nurse)
- Quick-action cards: Triage, Register Patient, Patients, Appointments, Admissions, Vitals History

#### Triage Station (`/triage`) — Rewritten
- **Queue tab**: Patient queue board (checked-in patients), searchable, "Triage" button
  - Filtered by folder_activated !== false (must pay registration fee first)
- **Vitals Entry tab**: Patient selection → vitals grid (BP, Pulse, Temp, RR, Weight, SpO₂)
  - Triage priority pills (Red = Emergency, Yellow = Urgent, Green = Routine)
  - Nursing notes textarea
  - Submit creates encounter + vitals + updates patient status
- **Triaged tab**: Patients in triage, "Move to Waiting" button → status=waiting

#### Patients List (`/patients` for Nurse)
- "Consult" replaced with "Vitals" button (opens inline vitals modal)
- "Chart" button remains
- Vitals modal: 7 fields + triage priority + nursing notes
- Payment badge (Unpaid) for non-admitted patients with folder_activated = false

#### Vitals Page (`/vitals`) — Enhanced
- Patient search, select → vitals history
- Record Vitals button for both Nurses and Doctors
- Nurse name and timestamp displayed on each vitals card

#### Clinical Notes (Nurse)
- Nurses Clinical Notes tab in Patient Chart
- Note types: General, Observation, Handover, Incident, Care Plan Update
- Doctor notes stored with `note_type='doctor'` in same `nurse_notes` table

#### Nurse-Specific Tabs in Patient Chart
- **Treatments (Treatment Sheet)**: Medication administration record
  - Add Treatment modal: drug name, dosage, route, frequency, administration times (12-hour checkboxes)
  - Dose grid: time slots (6AM, 8AM, 10AM, 12PM, etc.) — click to administer or skip
  - Confirmation modal for administer/skip with reason capture
  - "End Treatment" button with confirmation modal
  - Started/Expired timestamps with nurse attribution
  - `treatment_doses` table tracks individual doses
  - Auto-complete treatment when all doses recorded
- **Fluid Balance**: Session-based daily tracking (see below)
- **Nurses Clin. Notes**: Written notes with pagination
- **Doctors Cli. Notes**: Written notes + SOAP notes from encounters

#### Fluid Balance — Session-Based Rewrite
- Each day/shift = one fluid session. Multiple entries per session
- Sessions have date + nurse attribution
- New Session button creates `fluid_sessions` record
- Session Card: expandable, shows date, nurse, entry count, net balance
- Expanded view: stats row (Intake/Output/Net), Add Intake/Output buttons
- Add Intake modal: fluid type (160+ fluids), intake mL, route checkboxes
- Add Output modal: output types (Urine/Vomit/Aspirate/Bowels/Blood Loss)
- Intake/Output Detail: view modal with accumulated route/type breakdown
- Intake/Output cards: clickable to open detail modal with notes
- `fluid_sessions` table + `session_id` FK on `fluid_balance`
- `details` JSONB column for per-route/per-type breakdown

### 2.4 Doctor Module

#### Doctor Dashboard (`/dashboard`)
- Stats: Total Patients, Pending Rx, Pending Lab, Appointments, In Consultation
- Quick Actions: Patients, Lab Results, Prescriptions (colored cards)
- Patient Queue: searchable, 10 per page, Consult button per patient
- Only folder-activated patients shown

#### Consultation (`/consultation/:patientId`)
- SOAP tab: 4 fields (Subjective, Objective, Assessment, Plan) + Notes with voice input
- ICD-11 browser saves diagnoses to encounter
- Lab order modal: searchable test catalog dropdown
- Prescription: drug auto-complete from inventory, "Other" option for custom names
- Timeline: expandable entries with doctor name, timestamp, SOAP notes, diagnoses
- Timeline modal: full encounter details + prescriptions + lab orders + radiology + results
- Payment status for prescribed tests shown

#### Lab Results / Doctor View (`/my-lab-results`)
- Dedicated lab page for doctors (separate from LaboratoryWorkbench)
- Shows only logged-in doctor's ordered tests
- Stats: Requested, Pending, Processing, Completed
- Unread tracking: `doctor_read_at` column on lab_orders
- Blue dot + border on unread completed results
- Sidebar badge shows unread count

#### Appointment Stats Card
- Shows active scheduled appointments count for logged-in doctor
- Clickable → opens Appointments page

### 2.5 Appointments Module (`/appointments`)
- Date picker, status filter (Scheduled, Completed, Cancelled)
- Stats cards for admin/nurse view
- Doctor view auto-filters by logged-in doctor
- **Active tab**: shows scheduled (not expired), Complete/Cancel buttons
- **History tab**: shows completed/cancelled/expired, searchable, filterable
- **Auto-expiry**: past-due scheduled appointments shown as "Expired" without modifying DB
- **Booking modal**: searchable patient dropdown, doctor dropdown, 12-hour AM/PM time picker
- Date filter dropdown with presets (Today, This Week, This Month, etc.)
- Confirmation modal for Complete/Cancel actions
- Role-based buttons: assigned doctor + Admin = Complete/Cancel, Records = Cancel only

### 2.6 Records Module
- Records Dashboard (`/dashboard` for Records role) with stats, quick search, recent registrations, pending requests
- Patient demographics page (`/records/patients/:id`) with tabs: Demographics, Documents, Edit History
- Comprehensive edit modal matching all registration fields
- Document management with file upload, image preview, fullscreen viewer
- Record Requests page (`/records/requests`) with status workflow (pending → approved → fulfilled/rejected)
- Patient search, edit demographics
- Audit history showing field-by-field diff with old/new values, timestamps, staff attribution

### 2.7 Patient Registration (Enhanced)
- 4-step registration: Personal Info, Contact, Medical, Documents → Register
- Searchable country dropdown (195+ countries, Nigeria pre-selected)
- Searchable Nigerian states + LGAs (774 LGAs)
- Searchable occupation (200+ options, custom input allowed)
- Searchable relationship (50+ types)
- Insurance: Private, HMO, NHIA, Retainership, Other (with custom name/type)
- Document upload with image compression, type selection popup
- DOB picker limited to past dates only
- Required fields marked with `*` and validated at each step

### 2.8 Patient Chart (`/patient/:patientId`)
- Tabs: Summary, Vitals, Encounters, Rx, Lab, Radiology, Admissions, Treatments, Fluid Balance, Nurse Notes, Doctor Notes
- Role-filtered: Doctor sees all tabs, Nurse sees filtered (no prescriptions, radiology, doctor clinical notes)
- Responsive design (flex-wrap, truncate, no horizontal scroll on all screen sizes)
- Treatment sheet with dose administration tracking and auto-complete
- Fluid balance with session-based daily tracking
- Insurance info displayed in summary
- Age calculated from DOB
- Clickable intake/output cards with detail modals
- Summary status reflects patient journey (Checked In → In Triage → Waiting → With Doctor → Discharged / Admitted)

### 2.9 Radiology Module
- Order list with status badges (expandable rows)
- Report editor with image upload dropzone
- Payment check before processing (402 if unpaid)
- Paid/Unpaid badges on each order
- Unpaid orders show "Payment Required" message instead of report editor

### 2.10 Admissions
- 6 wards: General, Maternity, Pediatric, ICU, Surgical, Isolation, Male, Female
- Bed assignment with dropdown (3 beds per ward: Bed 1–Bed 3)
- Admin can delete custom beds; duplicate bed validation
- Bed number shown as bold badge in cards
- Reassign bed flow (makes old bed available)
- Discharge workflow with preserved bed_number in history
- Payment check before bed assignment (402 if admission fee unpaid)

### 2.11 Role-Based Access Control
- Sidebar visibility per role (see Section 9 for full table)
- Tab filtering in Patient Chart per role
- Action button filtering in Appointments, Admissions, Inventory
- Data filtering: doctors/nurses only see folder-activated patients

### 2.12 Responsive Design
- All pages fit 320px+ without horizontal scrollbar
- `Layout` component `<main>` has `overflow-x-hidden`
- `flex-wrap`, `truncate`, responsive grid columns throughout
- `overflow-x-auto` for scrollable tables and tabs
- Tab pills with `flex-wrap` for mobile, icons hidden on small screens

---

## 3. Current Session: Paypoint & Inventory System

### 3.1 Paypoint Module (`/paypoint`)
- **Two modes:** Patient & Walk-in
- **Patient mode:** Search patient → shows all unpaid services across modules
- **Walk-in mode:** Service catalog with 50+ services organized by category (Consultation, Lab, Radiology, Procedures, Maternity, Admission, Miscellaneous)
- **Auto-cart:** clicking a patient auto-adds all their unpaid items to the cart
- **Payment methods:** Cash, Card, Transfer, POS
- **Receipt modal:** shows items, totals, payment method, staff name, patient info
- **Payment Orders tab:** searchable history of all payments with receipt viewing

#### Unpaid Services Detection
The Paypoint queries these tables for unpaid items:
- `patients` where `folder_activated = false` (folder activation fee)
- `prescriptions` where `is_paid = false` (via `encounters` → `patient_id`) — join through encounters because prescriptions have `encounter_id` not `patient_id`
- `lab_orders` where `is_paid = false` (via `encounters` → `patient_id`)
- `radiology_orders` where `is_paid = false` (via `encounters` → `patient_id`)
- `admissions` where `is_paid = false`

All queries use `COALESCE(is_paid, false) = false` to handle both `NULL` and `false` values (since ALTER TABLE ADD COLUMN DEFAULT false doesn't apply to existing rows).

#### Service Catalog Module Tags
Services in the catalog have a `module` field:
- `lab` → stored as `service_type = 'lab'` in payment_items
- `radiology` → stored as `service_type = 'radiology'`
- `pharmacy` → stored as `service_type = 'pharmacy'`
- Others → stored as `service_type = 'walkin_service'`

### 3.2 Payment Status Integration Across Modules

| Module | Payment Check | User Experience |
|--------|:------------:|:---------------|
| **Pharmacy Dispensing** | Server returns 402 if unpaid | "Payment required" error shown in dispense modal. Prescription shows "Unpaid" red badge. |
| **Lab Workbench** | Server returns 402 when trying to process unpaid order (status→processing/collected) | "Collect Sample" and "Enter Results" buttons hidden for unpaid items. "Awaiting Payment" badge shown instead. Worklist only shows paid items (`is_paid === true`). |
| **Radiology Module** | Server returns 402 when trying to submit report for unpaid order | Selecting an unpaid order shows "Payment Required" message instead of report editor. |
| **Admissions** | Server returns 402 when trying to assign bed for unpaid admission | Bed assignment blocked until admission fee paid. |
| **Triage Station** | Client-side filter | Only patients with `folder_activated !== false` appear in the queue. |
| **MyPatients (Nurse/Doctor)** | Client-side filter + badge | Non-admitted patients with `folder_activated = false` show "Unpaid" badge. Patients with `folder_activated = false` are filtered out of the list. |
| **Patient Dashboard** | Client-side filter | Only folder-activated patients shown in doctor/nurse views. |

### 3.3 Lab Orders Tab
- **Two sections:**
  1. **Paypoint payments awaiting conversion** — Walk-in patients who paid for lab tests at Paypoint but haven't had lab orders created yet. Shows "Create Lab Order" button.
  2. **Unpaid lab orders** — Doctor-ordered tests that haven't been paid for. Read-only display with "Awaiting Payment" badge.
- When "Create Lab Order" is clicked: specimen type & priority modal → creates lab orders with `is_paid = true`, `payment_id` set → marks payment_items as `is_converted = true` → orders appear in Worklist.

### 3.4 Inventory System

#### Categories
| Category | Page | Route | Roles |
|----------|------|-------|-------|
| `pharmacy` | Pharmacy Inventory | `/inventory` | Admin, Pharmacist |
| `lab` | Lab Inventory | `/lab-inventory` | Admin, Lab Scientist |
| `radiology` | Radiology Inventory | `/radiology-inventory` | Admin |
| `general` | General Services | `/general-inventory` | Admin |

#### Columns on `inventory_items`
- `drug_name` — item name
- `batch_number` — lot/batch tracking
- `stock_count` — current quantity
- `reorder_level` — low stock threshold
- `price` — selling price (₦)
- `cost_price` — purchase cost (₦)
- `supplier` — vendor name
- `category` — 'pharmacy' | 'lab' | 'radiology' | 'general'
- `amount_type` — units, mL, L, mg, g, tests, packs

#### Admin-Only Controls
- Add item, Edit item, Delete item — restricted to Admin role
- Stock adjustment via +/- buttons (directly in table rows)
- Margin % calculated and displayed automatically

#### Cost Price Tracking
When a payment is processed (POST `/api/payments`), the server:
1. Looks up the inventory item by name and category
2. Retrieves `cost_price` from inventory
3. Stores both `unit_price` (sale price) and `cost_price` in `payment_items`
4. This enables profit calculations per transaction

#### Lab Inventory Reduction
When all lab results for an order are approved (status → completed), the server:
1. Gets the `test_name` from the lab order
2. Looks up `test_inventory_map` for matching inventory items
3. Deducts `quantity_consumed` from inventory stock

### 3.5 Payment Checks on Server Side
All server-side payment checks use `!is_paid` (JavaScript) which handles both `false` and `null`:
```typescript
if (!prescription.is_paid) {
  res.status(402).json({ error: true, message: 'Payment required: ...' });
  return;
}
```
For SQL queries, use `COALESCE(is_paid, false) = false` to handle NULL values.

### 3.6 Recent Bug Fixes
- **DOB timezone shift**: Added `types.setTypeParser(types.builtins.DATE, (val) => val)` in `pool.ts` to return DATE columns as strings (YYYY-MM-DD) instead of Date objects — eliminates ±1 day UTC timezone shift.
- **MyPatients.tsx overwritten with TriageStation code**: A Node.js script bug (`fs.writeFileSync(mp, t2, "utf8")` wrote wrong variable to wrong file). Restored from git.
- **Prescriptions join**: prescriptions don't have `patient_id` — queries must join through `encounters` table.
- **Routing order**: Static routes like `/api/payments/pending-summary` must be registered BEFORE parameterized routes like `/api/payments/:id`.

---

## 4. Database Schema Changes

### 4.1 Tables Created (Full History)

#### Core Tables
- `patients` — patient demographics with hospital_number, insurance, folder_activated, etc.
- `staff_users` — staff accounts with roles, email, password
- `tenants` — multi-tenant support
- `wards` — hospital wards (6 wards seeded)

#### Clinical Tables
- `encounters` — patient visits/encounters with SOAP notes, diagnoses (JSONB)
- `vitals` — vital signs per encounter (BP, pulse, temp, SpO₂, triage priority)
- `prescriptions` — medication prescriptions linked to encounters
- `lab_orders` — lab test orders with numbering, specimen tracking, doctor_read_at
- `lab_results` — individual analyte results per lab order
- `lab_test_catalog` — predefined lab tests (25+ seeded)
- `radiology_orders` — imaging orders with report_text, image_path
- `admissions` — patient admissions with ward, bed_number, discharge tracking
- `appointments` — scheduled appointments with doctor assignment

#### Nurse/Treatment Tables
- `treatments` — treatment/medication records with status, times
- `treatment_doses` — individual dose tracking per treatment (time slots)
- `nurse_notes` — clinical notes with note_type (nurse/doctor)
- `fluid_balance` — fluid intake/output entries with details (JSONB)
- `fluid_sessions` — daily fluid balance sessions

#### Inventory Tables
- `inventory_items` — stock management with category, price, cost_price
- `purchase_orders` — procurement records
- `test_inventory_map` — maps lab test names to inventory items

#### Payment & Finance Tables
- `payments` — payment transactions with receipt numbers, method
- `payment_items` — individual line items per payment with cost tracking

#### Document Tables
- `patient_documents` — uploaded patient documents
- `custom_document_types` — user-defined document categories
- `custom_insurance_types` — user-defined insurance providers
- `record_requests` — medical record release requests

#### System Tables
- `audit_logs` — change tracking for patient edits
- `beds` — ward beds (3 per ward)
- `clinic_profile` — hospital configuration
- `otc_sales` — walk-in pharmacy sales

### 4.2 Columns Added Across Sessions

#### Session 1–5 (Earlier Work)
- `inventory_items.category` — 'pharmacy' | 'lab'
- `inventory_items.amount_type` — units, mL, etc.
- `lab_orders.specimen_type`, `priority`, `patient_name`, `patient_phone`, `referred_by`
- `lab_orders.lab_number`, `order_number`, `request_number`, `collected_at`, `results_collected_at`, `doctor_read_at`
- `lab_results.result_number`
- `encounters.diagnoses` (JSONB)
- `admissions.admitted_by`, `discharged_by`, `bed_number`
- `treatments.status`, `start_date`, `end_date`, `ended_by`, `times`
- `fluid_balance.session_id`, `details` (JSONB)
- `patients.email`, `address`, `emergency_contact_name`, `emergency_contact_phone`
- `patients.occupation`, `marital_status`, `nationality`, `state_of_origin`, `lga`
- `patients.next_of_kin_phone`, `next_of_kin_address`, `relationship`
- `patients.insurance_type`, `insurance_sub_type`

#### Current Session Additions
- `patients.folder_activated` — registration fee payment flag
- `prescriptions.is_paid`
- `lab_orders.is_paid`, `lab_orders.payment_id`, `lab_orders.walkin_phone`
- `radiology_orders.is_paid`, `radiology_orders.payment_id`, `radiology_orders.walkin_phone`
- `admissions.is_paid`
- `inventory_items.price`, `inventory_items.cost_price`
- `payment_items.cost_price`, `payment_items.item_name`, `payment_items.is_converted`
- `lab_test_catalog.default_price`

### 4.3 SQL Considerations
- All `is_paid` columns use `BOOLEAN DEFAULT false`
- Existing rows have `NULL` (ALTER TABLE ADD COLUMN with DEFAULT only affects new rows)
- All queries use `COALESCE(is_paid, false) = false` to handle NULL
- Use `SELECT p.*` with JOINs for prescriptions/lab/radiology since they don't have direct `patient_id`
- `types.setTypeParser(types.builtins.DATE, val => val)` in pool.ts returns dates as strings

### 4.4 Seed Data
- 7 staff users: Admin, Doctor, Nurse, Lab Scientist, Pharmacist, Records, Paypoint
- 6+ wards: General, Maternity, Pediatric, ICU, Surgical, Isolation, Male, Female
- 25+ lab tests in `lab_test_catalog`
- 160+ common medical fluids for fluid balance
- 3 beds per ward (Bed 1–Bed 3)
- `lab_orders.is_paid`
- `radiology_orders.is_paid`
- `admissions.is_paid`

### 4.3 Current Schema Status
- All `is_paid` columns use `BOOLEAN DEFAULT false`
- Existing rows have `NULL` in `is_paid` (ALTER TABLE ADD COLUMN with DEFAULT only affects new rows)
- All queries use `COALESCE(is_paid, false) = false` to handle NULL

---

## 5. Server API Endpoints (Full History)

### 5.1 Patient & Registration
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/patients` | GET | List/search patients (with status, search, doctor_id filters) |
| `/api/patients/search` | GET | Quick search by name/hospital number/phone (BEFORE :id route) |
| `/api/patients/:id` | GET | Single patient with encounters |
| `/api/patients/:id` | PUT | Update patient demographics (with audit logging) |
| `/api/patients` | POST | Register new patient (auto hospital_number) |
| `/api/patients/:patientId/audit` | GET | Audit log for patient edits |

### 5.2 Auth & Setup
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/auth/login` | POST | Staff login with bcrypt verification |
| `/api/setup/status` | GET | Clinic configuration status |
| `/api/setup/save` | POST | Save initial clinic setup |

### 5.3 Encounters & Vitals
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/encounters` | GET/POST | Patient encounters |
| `/api/encounters/:id` | GET | Encounter details with prescriptions, lab |
| `/api/vitals` | GET/POST | Vital signs per encounter |
| `/api/vitals/recent/:patientId` | GET | Recent vitals for patient |

### 5.4 Laboratory
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/lab-orders` | GET | List lab orders (with doctor_id filter) |
| `/api/lab-orders` | POST | Create lab order (handles payment_id, walkin_phone, is_paid) |
| `/api/lab-orders/:id` | PUT | Update lab order (with payment check for processing) |
| `/api/lab-orders/stats` | GET | Lab order counts by status |
| `/api/lab-orders/mark-read` | POST | Mark doctor's results as read |
| `/api/lab-results` | POST | Enter analyte results |
| `/api/lab-results/:id/approve` | PUT | Approve result (reduces inventory on full completion) |
| `/api/lab-results/:id/reject` | PUT | Reject result |
| `/api/lab-results/:orderId` | GET | Results for a lab order |
| `/api/lab-test-catalog` | GET/POST | Lab test definitions |

### 5.5 Pharmacy & Inventory
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/prescriptions` | GET/POST | Patient prescriptions |
| `/api/dispense` | POST | Dispense medication (with payment check, stock reduction) |
| `/api/inventory` | GET/POST | Inventory items (with category filter) |
| `/api/inventory/:id` | PUT | Update item (handles stock_count_delta) |
| `/api/inventory/:id` | DELETE | Remove item (Admin only) |
| `/api/otc-sales` | GET/POST | Walk-in pharmacy sales |
| `/api/purchase-orders` | GET/POST | Pharmacy purchase orders |

### 5.6 Radiology
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/radiology-orders` | GET/POST | Radiology orders |
| `/api/radiology-orders/:id` | PUT | Update order (with payment check for processing) |

### 5.7 Admissions & Wards
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/wards` | GET | Hospital wards list |
| `/api/admissions` | GET/POST | Admission records |
| `/api/admissions/active` | GET | Currently active admissions |
| `/api/admissions/:id/discharge` | PUT | Discharge patient |
| `/api/admissions/:id/bed` | PUT | Assign/reassign bed (with payment check) |
| `/api/beds` | GET | Beds list with occupancy status |
| `/api/beds` | POST | Add custom bed |

### 5.8 Appointments
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/appointments` | GET/POST | Appointment management |

### 5.9 Nurse Module
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/treatments` | GET/POST | Treatment records |
| `/api/treatments/:id` | PUT | End treatment |
| `/api/treatment-doses` | GET | Dose records per treatment |
| `/api/treatment-doses/:id/administer` | PUT | Mark dose administered |
| `/api/treatment-doses/:id/skip` | PUT | Skip dose with reason |
| `/api/nurse-notes` | GET/POST | Clinical notes |
| `/api/fluid-sessions` | GET/POST | Daily fluid sessions |
| `/api/fluid-balance` | GET/POST | Fluid intake/output entries |

### 5.10 Records & Documents
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/patients/:id/documents` | GET/POST | Patient document management |
| `/api/patients/:id/documents/:docId` | DELETE | Delete document |
| `/api/patients/:id/documents/:docId/meta` | PUT | Update document metadata |
| `/api/document-types` | GET/POST | Custom document types |
| `/api/document-types/:id` | DELETE | Remove custom document type |
| `/api/record-requests` | GET/POST | Medical record release requests |
| `/api/record-requests/:id` | PUT | Update request status |
| `/api/insurance-types` | GET/POST | Custom insurance provider types |
| `/api/insurance-types/:id` | DELETE | Remove custom insurance type |
| `/api/documents/:filename` | GET | Serve uploaded document files |

### 5.11 Paypoint & Payments (NEW — Current Session)
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/payments/pending/:patientId` | GET | Unpaid services for a patient |
| `/api/payments/pending-summary` | GET | All patients with unpaid items grouped |
| `/api/payments/pending-orders` | GET | Unconverted payment items by service_type |
| `/api/payments` | POST | Create payment, generate receipt, mark services paid |
| `/api/payments` | GET | List payments with filters |
| `/api/payments/:id` | GET | Payment detail with items |
| `/api/payments/items/convert` | PUT | Mark payment items as converted |
| `/api/payments/revenue/stats` | GET | Revenue aggregates by period + method |
| `/api/payments/revenue/by-service` | GET | Revenue breakdown by service type |

### 5.12 Payment Enforcement (Middleware)
| Endpoint | Check |
|----------|-------|
| `POST /api/dispense` | Returns 402 if prescription `is_paid` is falsy |
| `PUT /api/lab-orders/:id` | Returns 402 if `is_paid` falsy when status→processing/collected |
| `PUT /api/radiology-orders/:id` | Returns 402 if `is_paid` falsy when status→processing/completed |
| `PUT /api/admissions/:id/bed` | Returns 402 if admission `is_paid` falsy |
| `/api/insurance-types` | GET/POST | Custom insurance types |
| `/api/insurance-types/:id` | DELETE | Remove custom insurance type |

### 5.4 Search
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/patients/search` | GET | Search patients (BEFORE `/api/patients/:id` in routes) |

### 5.5 Payment Enforcement (existing endpoints updated)
| Endpoint | Check |
|----------|-------|
| `POST /api/dispense` | Returns 402 if prescription `is_paid` is falsy |
| `PUT /api/lab-orders/:id` | Returns 402 if `is_paid` falsy when status→processing/collected |
| `PUT /api/radiology-orders/:id` | Returns 402 if `is_paid` falsy when status→processing/completed |
| `PUT /api/admissions/:id/bed` | Returns 402 if admission `is_paid` falsy |

### 5.6 Lab Results Approval (updated)
When all results for an order are approved, the server now:
- Sets `lab_orders.status = 'completed'`
- Deducts inventory via `test_inventory_map`

---

## 6. Frontend Components

### 6.1 New Components This Session
| Component | Route | Purpose |
|-----------|-------|---------|
| `PaypointCheckout` | `/paypoint` | Payment processing with cart, catalog, orders history |
| `FinanceDashboard` | `/finance` | Revenue stats, payment history, method breakdown |
| `InventoryManager` | multipurpose | Reusable inventory CRUD for all categories |
| `RadiologyInventory` | `/radiology-inventory` | Radiology supplies inventory |
| `SearchableSelect` | reusable | Dropdown with search/filter, custom input fallback |

### 6.2 Updated Components This Session
| Component | Changes |
|-----------|---------|
| `LaboratoryWorkbench` | Added Orders tab, is_paid badges, payment-gated buttons, paypoint conversion |
| `RadiologyModule` | Added is_paid badges, payment-required message for unpaid orders |
| `Dispensing` | Added Paid/Unpaid badges per prescription |
| `MyPatients` | Added folder_activated filter, unpaid badge |
| `TriageStation` | Added folder_activated filter |
| `PatientRegistration` | Enhanced with insurance types, document upload, compression |
| `RecordsPatientDetail` | Complete edit modal with all fields, audit history, document management |
| `RecordsPatientList` | Full edit modal matching registration fields |
| `App.tsx` | Added paypoint, finance, inventory routes + sidebar links |

### 6.3 Key Utility Files
| File | Purpose |
|------|---------|
| `utils/compressImage.ts` | Client-side image compression before upload |
| `utils/validatePhone.ts` | Phone validation (digits+, minimum 11 digits) |
| `data/formData.ts` | Countries (195), Nigeria states (37), LGAs (774), Occupations (200+), Relationships (50+) |

---

## 7. Payment Flow & Integration

### 7.1 Complete Payment Lifecycle

```
1. Registration → patient.folder_activated = false
2. Paypoint → patient pays folder activation fee → folder_activated = true
3. Doctor/Prescriber → creates prescription/lab/radiology order → is_paid = false
4. Paypoint → patient pays for service → is_paid = true
   ├── Folder activation: UPDATE patients SET folder_activated = true
   ├── Prescription: UPDATE prescriptions SET is_paid = true
   ├── Lab: UPDATE lab_orders SET is_paid = true
   ├── Radiology: UPDATE radiology_orders SET is_paid = true
   └── Admission: UPDATE admissions SET is_paid = true
5. Service provider → checks is_paid before processing
   ├── Pharmacy: POST /api/dispense → returns 402 if unpaid
   ├── Lab: PUT /lab-orders/:id → returns 402 if unpaid
   ├── Radiology: PUT /radiology-orders/:id → returns 402 if unpaid
   └── Admissions: PUT /api/admissions/:id/bed → returns 402 if unpaid
```

### 7.2 Walk-in Flow
```
1. Walk-in patient → Paypoint
2. Staff selects "Walk-in" mode → names services + sets prices
3. Payment processed → receipt generated
4. If services include lab:
   → Lab staff sees it in Orders tab under "Paid via Paypoint"
   → Clicks "Create Lab Order" → fills specimen/priority → lab order created with is_paid = true
   → Lab order appears in Worklist
5. If services include radiology:
   → Radiology staff sees it in their order list
   → Can process report directly (already marked as paid)
```

### 7.3 Receipt Generation
- Auto-generated receipt number format: `RCP-YMMDD-XXXX` (e.g., `RCP-260612-4821`)
- Receipt includes: receipt number, patient/walkin name, hospital number, items with prices, total, payment method, date/time, processed by staff

---

## 8. Inventory System

### 8.1 Multi-Category Inventory
All categories use the same `inventory_items` table with `category` discriminator:
- `pharmacy` — managed via `/inventory` (also `LabInventory.tsx` for lab-specific view)
- `lab` — managed via `/lab-inventory`
- `radiology` — managed via `/radiology-inventory` (NEW)
- `general` — managed via `/general-inventory` (NEW)

### 8.2 Inventory Manager Features
- Sortable/searchable table
- Stock count with +/- quick adjustment (Admin only)
- Low stock alerts (amber banner when stock ≤ reorder_level)
- Sell price, cost price, margin % display
- Add/Edit/Delete modal (Admin only)
- Batch number, supplier, amount type tracking

### 8.3 Lab Inventory Consumption
- `test_inventory_map` table links test names to inventory items
- When lab results are fully approved (all results for an order), inventory is auto-deducted
- Quantity consumed per test specified in `test_inventory_map.quantity_consumed`

### 8.4 Cost Price at Time of Sale
- When a payment is processed, the server looks up the inventory item's `cost_price`
- Both `unit_price` (what customer paid) and `cost_price` (what hospital paid) are stored in `payment_items`
- Enables profit/loss reporting per transaction

---

## 9. Role-Based Access Control

### 9.1 Sidebar Visibility
| Page | Doctor | Nurse | Lab Sci | Pharmacist | Records | Paypoint | Admin |
|------|:------:|:-----:|:-------:|:----------:|:-------:|:--------:|:-----:|
| Dashboard | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Register Patient | - | - | - | - | ✓ | - | ✓ |
| Triage | - | ✓ | - | - | - | - | ✓ |
| Patients | ✓ | ✓ | - | ✓ | - | - | ✓ |
| Vitals | ✓ | ✓ | - | - | - | - | ✓ |
| Appointments | ✓ | ✓ | - | - | ✓ | - | ✓ |
| Admissions | ✓ | ✓ | - | - | - | - | ✓ |
| Laboratory | ✓ | - | ✓ | - | - | - | ✓ |
| Lab Inventory | - | - | ✓ | - | - | - | ✓ |
| Pharmacy | - | - | - | ✓ | - | - | ✓ |
| Paypoint | - | - | - | - | - | ✓ | ✓ |
| Finance | - | - | - | - | - | ✓ | ✓ |
| Radiology Inventory | - | - | - | - | - | - | ✓ |
| General Services | - | - | - | - | - | - | ✓ |
| Staff Management | - | - | - | - | - | - | ✓ |
| Super Admin | - | - | - | - | - | - | ✓ |

### 9.2 Data Access Rules
- Only `folder_activated` patients appear to doctors/nurses in patient lists and triage
- Only Admin can add/edit/delete inventory items
- Only Admin can complete or cancel any appointment
- Only the assigned doctor can complete their appointments
- Records can only cancel appointments (not complete)
- Paypoint staff access: Paypoint, Finance, Appointments

---

## 10. Known Issues & TODOs

### 10.1 Known Issues
1. **Pending-summary endpoint routing**: `/api/payments/pending-summary` must be registered before `/api/payments/:id` in `payments.ts`
2. **Prescriptions query**: Must JOIN through `encounters` to get `patient_id` (prescriptions don't have `patient_id` directly)
3. **Error API responses**: Some catch blocks in the frontend silently handle errors (e.g., empty `catch {}`). The user sees no feedback when these fail.
4. **Folder activation existing data**: Patients registered before the `folder_activated` column was added have `NULL`. The filter `folder_activated !== false` treats `NULL` as true (grandfathered). New patients have `false` (must pay).

### 10.2 TODOs for Next Developer
1. **Finance profit/loss reports**: Use `payment_items.cost_price` vs `unit_price` to build profit reports
2. **Bulk inventory import**: CSV/XLS import for adding many inventory items at once
3. **Inventory expiry alerts**: Notify when items are near expiry date
4. **Supplier management**: Separate `suppliers` table for better vendor tracking
5. **Purchase orders automation**: Auto-generate purchase orders when stock hits reorder level
6. **Paypoint dashboard**: Show daily/weekly revenue charts
7. **Patient balance/wallet**: Track prepayments and outstanding balances per patient
8. **Payment reconciliation**: Match payments against bank/pos statements
9. **POS integration**: Connect to physical POS terminal
10. **Email/SMS receipt**: Send receipts to patient email/phone
11. **Walk-in lab auto-numbering**: Generate unique patient number for walk-in patients (currently uses phone-based ID)
12. **Currency formatting**: Ensure consistent ₦ formatting in all components
13. **Unify old InventoryManagement.tsx with new InventoryManager.tsx** — the old component still exists for pharmacy but the new one is more comprehensive

### 10.3 Database Migrations Needed
- Run `UPDATE inventory_items SET price = 0 WHERE price IS NULL` after adding price column
- Run `UPDATE patients SET folder_activated = true WHERE folder_activated IS NULL` to grandfather existing patients
- Run `UPDATE lab_orders SET is_paid = true WHERE encounter_id IS NULL AND patient_name IS NOT NULL` to mark walk-in orders as paid

---

## 11. How to Continue

### 11.1 Starting the Project
```powershell
# Terminal 1 — Backend
cd server
npx tsx src/server.ts

# Terminal 2 — Frontend
cd client
npm run dev
```

Access: `http://localhost:5173/login`

### 11.2 Default Logins
| Role | Email | Password |
|------|-------|----------|
| Admin | `admin@sretan.com` | `admin123` |
| Doctor | `doctor@sretan.com` | `doctor123` |
| Nurse | `nurse@sretan.com` | `nurse123` |
| Lab | `lab@sretan.com` | `lab123` |
| Pharmacy | `pharmacy@sretan.com` | `pharm123` |
| Records | `records@sretan.com` | `records123` |
| Paypoint | `paypoint@sretan.com` | `pay123` |

### 11.3 Key Architectural Decisions
- **Date handling**: The pg driver is configured to return DATE columns as strings (`types.setTypeParser(types.builtins.DATE, val => val)`) to avoid UTC timezone shifts
- **Payment status**: `is_paid` columns use `BOOLEAN DEFAULT false` with `COALESCE` in queries
- **Inventory categories**: All in one table with `category` discriminator, separate frontend components for each
- **Prescriptions**: No `patient_id` column — always JOIN through `encounters`
- **Routing order**: Static/prefix routes must be registered before parameterized routes to avoid Express matching conflicts

### 11.4 Next Development Priorities
1. Profit/loss reports in Finance Dashboard
2. Purchase order automation
3. Patient wallet/balance system
4. POS terminal integration
5. Email/SMS receipt delivery
6. Unify old InventoryManagement with new InventoryManager
7. Super Admin portal enhancements
8. Clock tampering guard hardening
9. Sync daemon (cloud sync) — currently disabled
10. Packing (Tauri/Electron desktop app, Windows service)

---

*End of Session Summary — June 13, 2026*

---

## Session 2026-06-26 to 2026-06-30 — Finance Module, Radiology Rewrite, Doctor Results, Review Workflows

**Session Date:** June 26–30, 2026

### 1. Sidebar Restructuring (Admin)

- **Grouped sidebar**: Menu items grouped by module/category for Admin role: Dashboard, Clinical, Laboratory, Pharmacy, Radiology, Records, Finance, Administration
- **Collapsible categories**: Each category shows as an expandable/collapsible section with chevron icon
- **Non-admin roles**: Keep the original flat sidebar list (their limited items don't need grouping)
- Route renames: `/inventory` → `/pharmacy-inventory`, `/expiry` → `/pharmacy-expiry`, `/paypoint/new` → `/paypoint/pending`, `/paypoint/otc` → `/paypoint/dashboard`

### 2. Inventory Enhancements

- **Full CRUD**: Edit, Delete, Inactivate/Activate toggle on pharmacy and lab inventory
- **Sort columns**: Added sortable Sell Price, Cost Price, Supplier, Type (amount_type) columns
- **Clickable low stock alert**: Amber banner is now a toggle button that filters to show only low-stock items
- **Seed data**: 20 pharmacy drugs + 20 lab items + 20 radiology items + 20 general/services inventory items — all with prices > ₦0
- **Category scoping**: Pharmacy dispensing, OTC sales, doctor prescriptions auto-complete all filter by `category='pharmacy'`. Lab inventory deduction filters by `category='lab'`.

### 3. Paypoint/Finance Module — Comprehensive Overhaul

#### URL-Based Routing
- `/paypoint/pending` — All Pending (default, restored from user request)
- `/paypoint/patients` — Pending Patients (patients with unpaid bills)
- `/paypoint/dashboard` — OTC Dashboard (bill registered patients OR walk-in)
- `/paypoint/billing` — Billing (search patient → browse catalog → charge)
- `/paypoint/history` — Payment History

#### All Pending Tab (`/paypoint/pending`)
- Fetches from `/api/payments/all-pending-items` — all unpaid items across all modules
- Patient name + hospital # + timestamp in one cell
- Service badges (folder_activation/prescription/lab/radiology/admission)
- **Add to Cart** buttons per row (not checkboxes)
- Desktop cart sidebar + **mobile floating cart button with popup modal**
- Payment methods grid (Cash/Card/Transfer/POS)
- Cart enforces single-patient rule (only same hospital_number items can be added together)
- Error modal when mixing patients (styled, with Clear Cart + Got it buttons)

#### OTC Dashboard (`/paypoint/dashboard`) — PaypointDashboard.tsx
- **Two modes**: Registered Patient (search by name/hospital #/phone) or Walk-in Customer
- Patient search with debounced dropdown
- Full inventory catalog browser from all categories
- Item click increments quantity (not duplicate)
- Multiple image upload with thumbnails, preview, delete, full-screen viewer
- Image compression via sharp (1920px, JPEG q80)
- Cart with payment, receipt modal
- Auto-reset after payment (clears patient/customer selection to prevent duplicate billing)

#### Billing (`/paypoint/billing`) — BillingPage.tsx
- Paginated patient list (20/page) with search by name, hospital #, or phone
- Select patient → browse services from all categories → add to cart → charge
- Mobile floating cart popup

#### Payment History (`/paypoint/history` and `/paypoint/history`)
- Stats cards (Total Payments, Revenue, Today)
- Date filter dropdown: All Time, Today, Yesterday, This Week, This Month, This Year, Custom Date, Custom Range
- Search by receipt, patient, or staff
- Clickable rows → detail modal with items, method, staff, date
- Both `/paypoint/history` (PaypointCheckout.tsx) and `/finance/payment-history` (FinancePaymentHistory.tsx)

### 4. Finance Module — Independent from Paypoint

| Route | Component | Description |
|-------|-----------|-------------|
| `/finance/dashboard` | FinanceDashboard | Revenue analytics, 7-day trend bars, payment method breakdown, service revenue, quick stats |
| `/finance/billing` | FinancePatientBilling | Patient billing records — search, pagination, stats cards (total spent, payment count), payment history table, detail modal |
| `/finance/payment-history` | FinancePaymentHistory | All payments with date filters, search, detail modal |
| `/finance` | Redirect → `/finance/dashboard` | |

#### Finance Dashboard Analytics
- Stats: Today revenue, This Week (with % vs last week + arrow indicator), Total Revenue, Avg per Transaction
- 7-day Revenue Trend bar chart (highlighted today)
- Monthly Revenue (6 months) bar chart
- Daily Transaction Count (7 days)
- Payment Method Breakdown (Cash/Card/Transfer/POS) with horizontal progress bars
- Revenue by Service — scrollable list with bars
- Monthly Comparison (this month vs last month)
- Year to Date revenue with avg daily/weekly
- Top Patients by revenue leaderboard
- Quick Stats panel

#### Patient Billing Records (`/finance/billing`)
- Patient list with search by name/hospital #/phone (paginated 20/page)
- Click patient → comprehensive billing report:
  - Total Spent, Total Payments, First Payment, Last Payment
  - Payment Method Breakdown (Cash/Card/Transfer amounts + %)
  - Payment History table with clickable rows
  - Detail modal with items, method, staff, printed receipt

#### Finance Role
- New `Finance` role added to VALID_ROLES and sidebar guards
- Finance staff see: Finance Dashboard, Patient Billing, Payment History
- Login: `finance@sretan.com` / `finance123`

### 5. Laboratory Module — Review Workflow Update

#### Status Flow (Updated)
```
ordered → collected (sample collected) → processing (results entered) → review (pending approval) → completed (approved)
                                                                          → review (rejected) → edit results
```

#### Lab Reject Flow
- **Server**: `PUT /api/lab-results/:id/reject` now sets `lab_results.status = 'review'` and `lab_orders.status = 'review'`
- **Worklist**: Shows "Review" items with amber "Edit Results" button
- **Editing**: Opens the same result entry modal, pre-populates existing values
- **Re-approval**: After editing, status goes back to `review` → needs re-approval
- **Status filter**: Added "Review" option to worklist filter dropdown
- **Status badge**: Shows "Rejected - Review" (rose color) for review items

#### Results Tabs (`/lab/results`)
- **Pending Approval** — draft results with approve/reject
- **Completed** — all completed results for registered patients with `encounter_id`
- **Not Collected** — walk-in results (`!encounter_id`) without collection
- **Collected** — results with `results_collected_at` set

### 6. Radiology Module — Full Lab-Like Workflow

#### New Pages

| Route | Component | Description |
|-------|-----------|-------------|
| `/radiology` | RadiologyDashboard | Stats cards (Ordered/Processing/In Review/Completed), quick action cards |
| `/radiology/worklist` | RadiologyModule | Worklist + report editor (keep existing editor) |
| `/radiology/results` | RadiologyResults | Completed results with tabs (Completed/Not Collected/Collected) |
| `/radiology/review` | RadiologyReview | Pending approval queue (approve/reject) |
| `/radiology/orders` | RadiologyOrders | Unpaid radiology orders |
| `/radiology/history` | RadiologyHistory | All orders with date filters and search |

#### Radiology Status Flow
```
ordered → review (report entered by radiologist) → completed (approved) / rejected (back to worklist)
```

**Worklist (`/radiology/worklist`):**
- Shows only `ordered` + `rejected` items
- Only paid items shown (`is_paid=true`)
- "Enter Result" button per item → opens popup modal with report editor
- Editor has: formatting toolbar (mock), template phrases, report textarea, image upload dropzone
- **Multiple image upload**: Grid of thumbnails, delete per image, full-screen preview
- Submit sets status = 'review' (pending approval)
- After submit/reject, item disappears from worklist

**Review (`/radiology/review`):**
- Lists all items with `status = 'review'`
- Each card: patient, imaging type, ordering doctor, radiologist, timestamp
- **Approve** (green) → status = 'completed', sets `approved_by`
- **Reject** (red) → status = 'rejected', item reappears in worklist for editing
- Detail modal with full report + image

**Results (`/radiology/results`):**
- **Completed** tab (all completed)
- **Not Collected** tab (walk-in only, "Mark as Collected" button)
- **Collected** tab (results with collection date)
- Search, pagination, detail modal with image + radiologist info

#### Server Changes (`radiologyOrders.ts`)
- Stats endpoint includes `review` count
- PUT endpoint: on report submit → `status = 'review'`; on approve → `status = 'completed'`, `approved_by`; on reject → `status = 'rejected'`
- Payment guard applies to `review`/`completed`/`processing` statuses
- `reported_at` set on first submit, `approved_at` set on approve
- `approved_by` column added to `radiology_orders` (migration 015)
- Radiology SELECT includes `approved_by_name`, `reported_by_name`, `hospital_number`, `patient_id`

#### Radiology Dashboard
- 5 stats cards: Ordered, Processing, In Review, Completed, Total
- Quick actions: Worklist, Review, Results, History

#### Sidebar (Radiology — 7 items)
Dashboard, Worklist, Results, Review, Orders, History, Inventory, Expiry

### 7. Doctor Results Page (`/doctor/results`)

Comprehensive results page for doctors showing ALL lab + radiology orders they've ordered.

**Features:**
- Fetches from `/lab-orders?doctor_id=X` and `/radiology-orders?doctor_id=X`
- Stats: Total Lab, Total Radiology, Ordered, Collected, Processing, In Review, Completed
- **Type filter**: All / Lab / Radiology (with icons)
- **Date filter dropdown**: All Time, Today, Yesterday, This Week, This Month, This Year, Custom Date, Custom Range
- **Status filter**: dropdown with all status options
- **Sort**: Newest / Oldest
- **Search**: patient name, test name, order number, hospital #
- **Pagination**: 20 per page

**Unread tracking:**
- Read IDs stored in `localStorage` as `doctor_read_results`
- Completed unread items get a **blue left border**
- Mark as read on: click card, close modal, backdrop click, X button
- **Sidebar badge**: Blue count badge on Results link — combines lab + radiology unread counts
- Count updates instantly via `CustomEvent('doctorResultsRead')` + 30s periodic sync
- Initial count computed from API minus localStorage read IDs

**Status display:**
- Lab: `rejected` → "In Review", radiology: `processing/review/rejected` → "In Review"
- Completed items show "View" link

**Detail modal:**
- Lab: shows analyte results with reference ranges, abnormal flags (red highlighting)
- Radiology: shows full report text + attached image
- **Three staff tracking sections:**
  - **Entered By** (sky) — lab scientist who entered the approved result (`lab_results.entered_by` from completed results)
  - **Reported By** (indigo) — radiologist who wrote the report (radiology only)
  - **Approved By** (purple) — person who finalized/approved the result
- Each section has name + date/timestamp
- Patient info, status, date ordered, priority, specimen type

### 8. Radiology Results in Patient Chart

- Completed radiology shows **report text inline** (truncated, scrollable)
- **"View Full Report"** button opens comprehensive modal:
  - Patient name + imaging type
  - Ordered by doctor + date ordered
  - Radiologist / Reported By (name + timestamp)
  - Full report text
  - **Attached image** with click-to-fullscreen + zoom In/Out
- "In Review" status shown for review/rejected items (not "Rejected" — doctors never see that word)
- Encounter timeline modal also shows report text + radiologist info

### 9. Server Uploads & Image Compression

- **Upload endpoint**: `POST /api/upload` using multer with disk storage → `server/uploads/`
- **Image compression**: sharp library resizes to max 1920px and compresses JPEG quality 80 (mozjpeg)
- In-place processing via `toBuffer()` — original file untouched if compression fails
- **Static serving**: `express.static(uploadsDir)` at `/uploads/` path
- **Vite proxy**: `/uploads` proxied to backend in `vite.config.ts`
- **Multiple image paths**: Stored as comma-separated in `image_path` field

### 10. New Roles & Staff Logins

| Role | Email | Password | Access |
|------|-------|----------|--------|
| **Finance** | `finance@sretan.com` | `finance123` | Finance Dashboard, Patient Billing, Payment History |
| **Radiology** | `radiology@sretan.com` | `radiology123` | Radiology Dashboard, Worklist, Results, Review, Orders, History, Inventory, Expiry |

### 11. RadiologyRole Added
- `Radiology` added to `VALID_ROLES` in `staff.ts`
- Sidebar links and route guards include `Radiology` role
- DashboardRouter redirects Paypoint → `/paypoint/dashboard`

### 12. All-New Migration Files

| File | Purpose |
|------|---------|
| `013_lab_results_collected_by.sql` | Added `results_collected_by` to `lab_orders` |
| `014_radiology_enhance.sql` | Added `imaging_number`, `doctor_name`, `patient_name`, `is_paid`, `reported_by`, `reported_at`, `payment_id` to `radiology_orders` |
| `015_radiology_review.sql` | Added `approved_by`, `approved_at`, `results_collected_at`, `results_collected_by` to `radiology_orders` |
| `016_lab_results_entered_by.sql` | Added `entered_by` to `lab_results` |

### 13. New Server Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/upload` | POST | File upload with sharp compression |
| `/api/radiology-orders/stats` | GET | Radiology order counts by status |
| `/api/payments/all-pending-items` | GET | All unpaid items across all patients with prices |
| `/api/payments/patient-billing/:patientId` | GET | Patient billing summary with stats + payment history |
| `/api/lab-results/:orderId` | GET | Now supports optional `?status=` filter |

### 14. New Client Components

| Component | Route | Purpose |
|-----------|-------|---------|
| `PaypointPending` | `/paypoint/pending` | All pending items table with cart |
| `PaypointPatients` | `/paypoint/patients` | Patients with pending bills list |
| `PaypointDashboard` | `/paypoint/dashboard` | OTC/billing dashboard (renamed from OtcSales) |
| `BillingPage` | `/paypoint/billing` | Patient billing with catalog |
| `PaypointCheckout` | `/paypoint/history` | Payment history (stripped down) |
| `FinanceDashboard` | `/finance/dashboard` | Revenue analytics with charts |
| `FinancePatientBilling` | `/finance/billing` | Patient billing records |
| `FinancePaymentHistory` | `/finance/payment-history` | Payment history with date filters |
| `RadiologyDashboard` | `/radiology` | Stats dashboard |
| `RadiologyResults` | `/radiology/results` | Results with Not Collected/Collected tabs |
| `RadiologyReview` | `/radiology/review` | Approve/reject reports |
| `RadiologyOrders` | `/radiology/orders` | Unpaid orders |
| `RadiologyHistory` | `/radiology/history` | History with date filters |
| `DoctorResults` | `/doctor/results` | Comprehensive doctor results page |

### 15. Known Issues / TODOs

1. **Radiology doctor_read_at**: Unread tracking for radiology uses localStorage only (no server-side `doctor_read_at` on radiology_orders yet)
2. **entered_by backfill**: Existing lab results have `entered_by = NULL` (column added via migration 016). New results will populate it.
3. **approved_at backfill**: Radiology orders approved before the fix have `approved_at = NULL`. New approvals will set it.
4. **Image upload fallback**: If compression fails, original file is preserved — this is intentional
5. **Multiple image upload for lab**: Lab results only support single report entry, not images (lab is text-based)
6. **Paypoint vs Finance isolation**: Finance role sees Finance module only; Paypoint role sees paypoint/OTC pages only. No overlap by design.
7. **Radiology results in patient chart**: Uses `?status=completed` filter — only approved results visible to clinicians

---

## Session 2026-06-22 — Lab Module Restructuring & Voice-to-Text

**Session ID:** `sess-lab-voice-20260622`
**Date:** June 22, 2026

### 1. Laboratory Module Restructuring

#### Individual Lab Pages Created
The monolithic `LaboratoryWorkbench.tsx` was replaced with 7 dedicated page components:

| Page | Route | Lines | Features |
|------|-------|-------|----------|
| **LabDashboard** | `/lab` | 220 | Stats cards (ordered/collected/processing/completed), quick action grid (6 cards linking to sub-pages), recent activity timeline, integration cards (pending doctor requests, awaiting nurse collection, unpaid orders, paypoint conversions) |
| **LabWorklist** | `/lab/worklist` | 451 | Stats cards, search + status filter, order cards with Collect Sample/Enter Results, analyte entry modal with abnormal detection, collect confirmation modal, print modal, pagination |
| **LabResults** | `/lab/results` | 316 | Stats cards, sub-tabs (Pending Approval / Completed & Collected), approve/reject, search with walk-in badge, view/print modal, pagination |
| **LabHistory** | `/lab/history` | 264 | Stats cards (total/abnormals/unique patients), search + date range filter, result cards with abnormal highlighting, detail modal, pagination |
| **LabOrders** | `/lab/orders` | 246 | Stats cards, paypoint payments grouped by payment with convert button, unpaid orders section, convert modal with specimen/priority |
| **LabCatalog** | `/lab/catalog` | 262 | Stats cards, searchable table, add/edit/delete modals with specimen/price/description fields |
| **LabReports** | `/lab/reports` | 382 | Stats cards (today/week/month/avg), test frequency bar chart, doctor request patterns, revenue/financial data, status distribution bar chart, peak hours trends |

**Total new lab page code: ~2,141 lines**

#### Fixes to Legacy LaboratoryWorkbench
- Completed tab now shows both completed AND collected lab orders (merged)
- Collected tab added search box
- Tab order changed to Pending → Completed → Collected
- Completed tab fetches actual order data (was showing empty)
- Worklist filters out `completed` and `cancelled` status orders

### 2. Routing & Sidebar Changes (`App.tsx`)

- **LabRouter** rewritten to handle sub-routes: `/lab`, `/lab/worklist`, `/lab/results`, `/lab/history`, `/lab/orders`, `/lab/catalog`, `/lab/reports`, `/lab/legacy`
- Sidebar updated from 3 lab links to 9: Dashboard, Worklist, Results, History, Orders, Catalog, Reports, Inventory, Low Stock
- Badge for pending orders moved to Worklist link; unread badge for doctors moved to Results link
- Added `CheckCircle`, `FlaskConical`, `BarChart3` to lucide-react imports

### 3. Server API Additions (`server/src/routes/lab.ts`)

- `PUT /api/lab-test-catalog/:id` — update a lab test
- `DELETE /api/lab-test-catalog/:id` — delete a lab test

### 4. Fluid Intake/Output Removed from Vitals Forms

Removed `fluid_intake` and `fluid_output` fields from:

| File | Changes |
|------|---------|
| **PatientChart.tsx** | Removed from state, POST payload, reset, and UI modal |
| **TriageStation.tsx** | Removed from `VitalsForm` interface, `emptyForm`, POST payload, and entire Fluid Balance UI section |

(`MyPatients.tsx` and `DoctorVitals.tsx` never had these fields.)

### 5. Voice-to-Text (Mic) Added to All Nursing Notes

`VoiceInput` component (Web Speech API) added to nursing notes textareas in all record vitals:

| File | Location |
|------|----------|
| **PatientChart.tsx** | Record Vitals modal → Nursing Notes label |
| **TriageStation.tsx** | Vitals form → Nursing Notes heading |
| **MyPatients.tsx** | Vitals modal → Nursing Notes label |
| **DoctorVitals.tsx** | Record Vitals modal → Nursing Notes label |

### 6. Voice-to-Text (Mic) Added to Clinical Note Modals

| File | Modal | Label |
|------|-------|-------|
| **PatientChart.tsx** | Nurse "Add Clinical Note" modal | "Note" |
| **PatientChart.tsx** | Doctor "New Clinical Note" modal | "Note" |

### 7. Imports & Dependencies

- Added `useRef` import to: PatientChart.tsx, TriageStation.tsx, MyPatients.tsx, DoctorVitals.tsx
- Added `Mic` icon to all 4 files above
- `VoiceInput` component defined locally in each file (same pattern as DoctorConsultation.tsx)

### 8. Known Issues / TODOs
1. LabWorklist uses local `VoiceInput` — consider extracting to shared component if duplicated further
2. LabReports `/lab/reports` may need backend revenue-by-service endpoint verified
3. Legacy LaboratoryWorkbench retained at `/lab/legacy` for backward compatibility
4. DoctorLabResults still routes to `/lab/worklist` for doctor role — verify this matches expectations

---

*End of Session Summary — June 22, 2026*

---

## Session — June 26–July 1, 2026

### 1. Doctor Comments on Lab/Radiology Orders

- **Migration**: `017_doctor_comment.sql` — added `doctor_comment TEXT` column to `lab_orders` and `radiology_orders`
- **Server**: `lab.ts` POST accepts `doctor_comment`; `radiologyOrders.ts` POST accepts `doctor_comment`
- **DoctorConsultation.tsx**: Added "Doctor's Comment" textarea to both lab order and radiology order modals; lab dropdown now merges `lab_test_catalog` with inventory items (`category=lab`, `stock_count>0`) deduplicated; radiology dropdown dynamically populated from radiology inventory items
- **DoctorComment.tsx**: Reusable component that shows first 50 characters with "View more" button → stylish popup modal with full comment
- **Display across all views**: LabWorklist, LabOrders, RadiologyModule, RadiologyOrders, RadiologyReview, RadiologyResults, RadiologyHistory, PatientChart — all now render `DoctorComment` component instead of raw text
- **Lab result endpoint** enhanced: `GET /api/lab-results/:orderId` now joins `staff_users` to return `entered_by_name` and `approved_by_name`
- **Lab result modal** (PatientChart): Enhanced to show ordered date+time, scientist who entered results (name + timestamp), approver info
- **Paypoint/finance components**: doctor_comment excluded by design — never displayed in paypoint views

### 2. Pagination (15 per page)

- Added to all three Historical Timeline sections in `DoctorConsultation.tsx`: SOAP tab (encounter cards), Orders tab (lab/radiology), Prescribe tab (prescriptions)
- Responsive `Pagination` component with Previous/Next, up to 5 visible page numbers, disabled states at boundaries

### 3. Historical Timeline Tab Filtering

- **SOAP tab**: maintains encounter-based timeline (unchanged)
- **Orders tab**: shows only lab + radiology orders for the patient, sorted newest first
- **Prescribe tab**: shows only prescriptions for the patient, sorted newest first
- All data pre-fetched on mount in batch (no extra API calls on tab switch)
- Clicking prescription opens comprehensive detail modal (drug, dosage, status, payment, doctor, instructions)
- Clicking radiology order opens comprehensive radiology report modal with image viewer
- Prescription history shows **Dispensed** (green) / **Not Dispensed** (amber) instead of unpaid badge
- Server `GET /api/prescriptions` now joins encounters+staff_users to return `doctor_name`

### 4. Treatment Sheet — Session Model (Courses)

**Migration**: `019_treatment_sessions.sql`
- Created `treatment_sessions` table (tenant_id, treatment_id, staff_id, dosage, route, frequency, times, notes, status, start_date, end_date, ended_by, end_reason, change_log JSONB)
- Added `session_id` column to `treatment_doses`
- Backfilled: every existing treatment got a default session with doses linked

**Server** (`nurseModule.ts`):
- `POST /api/treatments` always creates a new standalone treatment entry (client decides course vs new treatment)
- `GET /api/treatment-sessions?treatment_id=X` — list sessions for a treatment
- `POST /api/treatment-sessions` — creates new session, auto-ends previous active session
- `PUT /api/treatment-sessions/:id` — update session (status, dosage, route, end_reason)
- `GET /api/treatment-doses` — supports `session_id` filter

**Client** (`PatientChart.tsx`):
- **Treatment Sheet**: drugs grouped by name with expandable sessions (newest first)
- **Active/All filter tabs**: default Active for nurses (auto-switches when treatments load), All for others
- **+ New Course**: visible when parent treatment is `active`; pre-fills dosage from latest course
- **End Treatment (drug-level)**: choice modal — "Mark as Completed" if all children complete, "End Treatment" with reason if any active child
- **End (course-level)**: ends single session with mandatory reason
- **Parent ended → children**: only non-completed children get ended; completed children preserved
- **Dose Inheritance**: +New Course copies last known dosage from previous course (editable)
- **Stylish empty states**: centered icon + message + action buttons for no treatments/no active
- **Treatment Summary**: now operates on **course-level** data (flattened sessions) — rows are courses not treatments, columns reflect course dosage/route/status/nurse
- **Sort**: groups sorted by active parent first, then by latest session activity
- **Parent info modal (i)**: comprehensive drug summary — created by, ended by, reason, dose stats, course history
- **Child info modal**: clickable status badge + info icon → comprehensive course details (dose breakdown, nurse timestamps, reason)

### 5. Dose Admin UI Improvements

- Dose slots show **DONE** (bold caps, emerald), **SKIPPED** (bold caps, rose), or **Pending**
- Nurse name displayed at `text-[10px] text-slate-600 font-medium` for readability
- 12-hour time format on all dose slot displays
- Child demarcation: `divide-y-2 divide-slate-100` for visible 2px separation between courses
- Times removed from inline display (shown only in about modal)
- Marking as given or skipped blocked when parent treatment is `ended` or `completed`

### 6. Matching & Choice Modal Improvements

- **Fuzzy drug matching**: `Save Treatment` now matches by exact name, `name + dosage`, or `entered name` starting existing treatment name (with `entered.length > 3` guard)
- Uses existing treatment's actual name (not user's typed input) for group key
- If parent was ended, "Add to Existing Courses" reactivates parent to `active` status
- **Choice Modal**: When all children complete → only "Mark as Completed" (no End Treatment); when active children exist → only "End Treatment"

### 7. Tooltip Hint System

- `Hint` component: dark rounded tooltip on hover (fixed position, no layout impact)
- Applied to every interactive/display element in treatment sheet: drug name, course count, active/completed/ended badges, info icons, +New Course, End Treatment, chevron, course status/dosage/route/frequency, End button, timestamps, reason, dose slots, filter tabs, Add Treatment button
- Applied to **Treatment Summary**: search input, date filter buttons, stats cards, table headers, all data cells
- Applied to **Fluid Balance**: New Session buttons, session date/entries/staff/net, Intake/Output/Net cards, all action buttons, intake entry cards (amount, fluid type, route breakdown, timestamps), output entry cards (amount, output types, timestamps), "more entries" text, empty states

### 8. Other Changes

- **Child info modal**: Times now displayed in 12-hour format (e.g., `6:00 AM, 2:00 PM`)
- **Parent end reason**: only stored on parent record, not propagated to children
- **Server filenames fixed**: All `/api/` prefixed API calls in PatientChart.tsx corrected (axios baseURL already includes `/api` → double-prefix was causing 404 on all session/dose operations)
- **TypeScript**: added `RadiologyOrder.doctor_comment` field, `Info` and `ClipboardList` icon imports
- **Add Treatment form**: all fields (name, dosage, route, frequency, times) required except notes; red asterisk indicators added

### 9. Database Migrations

| File | Purpose |
|------|---------|
| `017_doctor_comment.sql` | Add `doctor_comment` to `lab_orders`/`radiology_orders` |
| `018_treatments_end_reason.sql` | Add `end_reason` to `treatments` |
| `019_treatment_sessions.sql` | Create `treatment_sessions` table, add `session_id` to `treatment_doses`, backfill |

---

*End of Session Summary — July 1, 2026*

---

## Session — July 2, 2026

### 1. Height & Fetal Heart Rate in Vitals

- **Migration**: `020_vitals_height_fhr.sql` — `height DECIMAL(5,2)`, `fetal_heart_rate INT` columns
- Server POST `/api/vitals` accepts `height`, `fetal_heart_rate`
- Added to all 4 vitals modals: PatientChart, TriageStation, MyPatients, DoctorVitals — form state, POST payload, UI fields, display grids
- **Fetal Heart Sound**: `021_vitals_fetal_heart_sound.sql` — `fetal_heart_sound VARCHAR` column
- Added as text input to all vitals modals + display grids; server accepts in POST
- Input uses `type="text"` for FH Sound (descriptive values like Normal/Muffled/Absent)

### 2. Clinical Note View Tracking

- **Migration**: `021_clinical_note_views.sql` — `clinical_note_views` table (note_id, viewed_by, viewed_at, UNIQUE constraint per staff per note)
- `POST /api/nurse-notes/:id/view` — records view (upsert)
- `GET /api/nurse-notes` — returns `view_count` and `viewers` array (name + timestamp)
- Nurse + doctor notes truncated at 250 chars with "View more →"; clicking opens comprehensive modal with full content
- Admin users see view count badges and viewer list (name + timestamp) in detail modal

### 3. Vitals Preview & Audit System

- **Migration**: `023_vitals_audit.sql` — `recorded_by`, `edited_by`, `edited_at`, `deleted_by`, `deleted_at`, `edit_log JSONB`
- Server PUT `/api/vitals/:id` — validates 10-minute window + same-staff-only; logs previous snapshot to `edit_log`; includes `edited_by_name` in log entries
- Server DELETE `/api/vitals/:id` — soft-deletes with same time + staff checks
- Server GET now returns `recorded_by_name` and `edited_by_name`; filters out soft-deleted records
- **Preview modal** — "Preview & Save" button opens stylish modal showing only fields with values; "Edit" goes back; "Confirm & Save" submits
- **Vitals cards** — Edit/Delete buttons visible only within 10 minutes for recording staff; "Edited by [name] [timestamp]" shown on edited records
- **Edit history modal** — clicking edited-by name opens modal showing all edit_log entries with editor names, timestamps, and previous values
- Preview modal applied to PatientChart, DoctorVitals, MyPatients, AdmissionsPage
- TriageStation scope omitted (dedicated triage flow, not generic vitals form)

### 4. VoiceInput Auto-Scroll

- `VoiceInput` component enhanced: accepts optional `textareaId` prop; `useEffect` watches text growth during recording and auto-scrolls the target textarea
- Added `id="vitals-notes-ta"`, `id="nurse-note-ta"`, `id="doctor-note-ta"` to respective textareas

### 5. Tooltip Hint System Expansion

- Added `Hint` tooltips to all interactive elements in record vitals modal (header, close, all input fields, triage buttons, Cancel/Save, nursing notes)
- `Hint` component refactored to use `React.cloneElement` — no layout-breaking wrapper `<span>`; preserves exact DOM structure

### 6. Vitals UI Improvements

- Vitals cards show only metrics with actual values (filter out empty via `.filter(Boolean)`) — no more "—" entries
- Nursing notes in vitals cards: truncated at 250 chars with clickable "...View more" button → modal with full text
- Timestamps in 12-hour format (`en-US` locale)
- Pagination: 20 per page (`VITALS_PER_PAGE = 20`)
- Auto-switch to vitals tab after saving (`setActiveSection('vitals')`)
- Tabs: removed nurse role filter — all tabs visible to all roles (Rx, Radiology, Doctors Cli. Notes now visible to nurses)
- Edited vitals card: stacked vertically (name above timestamp) instead of inline

### 7. Server-Side Updates

- `vitals.ts`: complete rewrite with PUT/DELETE endpoints; audit logging with staff name lookup; enriched GET with joined names
- `nurseModule.ts`: added view tracking endpoints, enhanced GET with subqueries for view_count/viewers
- `prescriptions.ts`: query joins encounters+staff_users to return `doctor_name`

### 8. Database Migrations

| File | Purpose |
|------|---------|
| `020_vitals_height_fhr.sql` | Add `height`, `fetal_heart_rate` to vitals |
| `021_clinical_note_views.sql` | Create `clinical_note_views` table |
| `022_vitals_fetal_heart_sound.sql` | Add `fetal_heart_sound` to vitals |
| `023_vitals_audit.sql` | Add audit columns + `edit_log` to vitals |

---

## Session 2026-07-02 to 2026-07-06 — Maternity Module (Full Implementation)

**Session Date:** July 2–6, 2026

### 1. Maternity Module Overview

Full pregnancy lifecycle tracking: booking/registration, antenatal visits, labour & delivery with WHO 1994 Partograph, delivery records, newborns (supports twins/triplets), postnatal care. Integrates with existing Admissions (Maternity Ward), Paypoint (maternity services), Vitals (maternity fields), and Patient Chart.

### 2. Database Migrations (4 files)

| Migration | Content |
|-----------|---------|
| `024_maternity_core.sql` | `maternity_patients` (pregnancy profile: LMP, EDD, gravida, para, blood group, genotype, Rh, HIV, HBV, risk level) + `antenatal_visits` (visit_number, fundal_height, fetal_presentation, FHR, urine protein/glucose, Hb, PCV, TT dose, next appointment) |
| `025_maternity_labour.sql` | `maternity_deliveries` (labour admission, delivery details, perineum, placenta, complications, outcome) + `maternity_partograph` (time-series cervical dilation, descent, contractions, FHR, maternal vitals, drugs, moulding, caput) + `maternity_newborns` (baby name, sex, weight, length, head circumference, APGAR 1/5/10min, resuscitation, vitamin K, congenital anomalies) |
| `026_maternity_postnatal.sql` | `postnatal_visits` (fundal height, lochia, vitals, breastfeeding, perineal wound, c-section wound, family planning) |
| `027_vitals_maternity_fields.sql` | ALTER TABLE vitals ADD COLUMN fundal_height, fetal_presentation, urine_protein, urine_glucose, hemoglobin, pcv, gestational_age_weeks, tt_dose |

### 3. Server Routes (`routes/maternity.ts`)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/maternity-patients` | GET | List with filters (status, search, patient_id, edd range, risk_level) + `available_female=true` returns female patients not yet in maternity program |
| `/api/maternity-patients/stats` | GET | Dashboard stats: active pregnancies, deliveries today, due this week, overdue ANC |
| `/api/maternity-patients/:id` | GET | Single record with patient info, visit count, last visit date, next appointment |
| `/api/maternity-patients` | POST | Book pregnancy (validates patient is female, no duplicate active record) |
| `/api/maternity-patients/:id` | PUT | Update pregnancy profile |
| `/api/antenatal-visits` | GET/POST | ANC visit CRUD (auto visit_number, gestational_age) |
| `/api/antenatal-visits/:id` | PUT | Edit ANC visit |
| `/api/maternity-deliveries` | GET/POST | Delivery records (POST auto-detects if complete: sets status='active' for labour admission, 'completed' for full delivery) |
| `/api/maternity-admit-labour` | POST | Atomic labour admission: creates admissions record (Maternity Ward) + delivery record (status='active'), checks for existing active delivery |
| `/api/maternity-deliveries/:id` | GET | Full detail with newborns + partograph entries |
| `/api/maternity-deliveries/:id` | PUT | Update delivery; auto-updates maternity_patient status if completed |
| `/api/maternity-deliveries/:id/complete` | PUT | Dedicated completion: records full delivery details + sets status='completed' + updates maternity_patient to 'delivered' |
| `/api/maternity-partograph` | GET/POST | Partograph entry CRUD (24-hour timeline, all WHO fields) |
| `/api/maternity-partograph/:id` | PUT | Update single partograph entry |
| `/api/maternity-partograph/:id` | DELETE | Remove partograph entry (used by undo/redo and point removal) |
| `/api/maternity-newborns` | POST | Add newborn to delivery |
| `/api/maternity-newborns/:id` | PUT/DELETE | Update/remove newborn |
| `/api/postnatal-visits` | GET/POST | Postnatal visit CRUD |

**Vitals enhancement:** `routes/vitals.ts` updated to accept 8 new maternity fields in POST/PUT with audit snapshot support.

### 4. Client Components

| Component | Route | Purpose |
|-----------|-------|---------|
| `MaternityDashboard` | `/maternity` | Stats cards (active pregnancies, deliveries today, due this week, overdue ANC), quick action grid, recent activity |
| `MaternityBooking` | `/maternity/booking` | Lists available female patients (not yet in maternity), comprehensive booking modal with ALL fields (LMP/EDD, gravida/para, blood group, genotype, Rh, HIV, HBV, risk factors) |
| `MaternityPatientList` | `/maternity/patients` | Searchable/filterable table with status, EDD badges, risk level, gravida/para, last visit |
| `MaternityPatientDetail` | `/maternity/patients/:id` | 4 tabs: **Profile** (full pregnancy data), **ANC Visits** (timeline with expandable cards), **Delivery** (delivery record + newborns), **Postnatal** (visits list). Labour admission modal with datetime, membranes, notes → creates delivery + admission record |
| `MaternityANCWorklist` | `/maternity/anc` | Active patients grid with "Record ANC Visit" modal (weight, BP, fundal height, FHR, presentation, urine, Hb, PCV, TT dose, next appointment) |
| `MaternityLabourWard` | `/maternity/labour` | Two views: **Active Labours** list with "Manage Labour" (opens partograph + delivery management) and direct **"Admit Patient"** button. Partograph chart, delivery form, newborn form |
| `MaternityLabourSummary` | `/maternity/labour-summary` | All deliveries with search, date/status filters, detail modal (delivery info, newborns, partograph entries) |
| `MaternityPostnatalWard` | `/maternity/postnatal` | Delivered patient list + postnatal visit recording modal |
| `PartographChart` | embedded | **WHO 1994 Modified Partograph** — interactive SVG chart (see Section 6 below) |

### 5. Patient Chart Integration

- **Maternity tab** added to PatientChart sections array (visible only for female patients)
- Shows: Pregnancy profile card (EDD, gestational age, gravida/para, risk level), ANC visit timeline (last 5), Labour & Delivery summary, Postnatal visits
- "Book Pregnancy" button for female patients without a record
- "Record ANC Visit" button for Nurse/Doctor roles
- "View Full Chart" link to dedicated `/maternity/patients/:id` page

### 6. Doctor Consultation Integration

- Maternity info banner in DoctorConsultation.tsx: shows EDD, gestational age, gravida/para, risk level, last ANC visit date, "View Full Chart" button
- Data fetched alongside patient data on consultation load

### 7. Nurse Vitals Enhancement

All 4 vitals forms (PatientChart, TriageStation, MyPatients, DoctorVitals) updated:
- **Conditionally show** 8 maternity fields (fundal height, fetal presentation, urine protein, urine glucose, hemoglobin, PCV, gestational age, TT dose) — only visible when the patient has an active maternity record
- Previously always visible; now gated by API fetch on patient selection
- Fields render as `<select>` dropdowns for categorical values (fetal_presentation, urine_protein, urine_glucose, tt_dose) and `<input>` for numeric (fundal_height, hemoglobin, PCV, gestational_age_weeks)

### 8. Sidebar & Navigation

Maternity appears as its own category between Radiology and Records in Admin grouped view:
```
Maternity (Doctor, Nurse, Records, Admin):
  /maternity              → Maternity Dashboard
  /maternity/booking      → Book Pregnancy
  /maternity/patients     → Maternity Patients
  /maternity/anc          → ANC Visits
  /maternity/labour       → Labour & Delivery
  /maternity/labour-summary → Labour Summary
  /maternity/postnatal    → Postnatal
```

### 9. WHO 1994 Partograph Chart — Interactive Digital Implementation

The `PartographChart` component is a complete interactive digital version of the WHO 1994 Modified Partograph paper form:

#### Layout Structure
- **24 columns** (Hours 0-23), matching WHO standard
- **Fixed width** (columns fill container via dynamic cell width calculation with ResizeObserver)
- **Hidden scrollbars** (CSS: `scrollbar-width: none`, `::-webkit-scrollbar: display: none`)
- **Fullscreen mode** (Fullscreen API toggle button in toolbar)
- **A4-printable** (`@media print` CSS class)

#### Sections (top to bottom)

| Section | Implementation |
|---------|---------------|
| **Header** | 2-row patient info (Name, Gravida, Para, Hospital #, Date of admission, Time of admission, Ruptured membranes hours) |
| **Fetal Heart Rate** | SVG chart (80-200 bpm, 13 rows). Click to plot dots with SVG polyline. **Shading zones**: red (<110 or >160), amber (110-119 or 150-160), green (120-150). **Thick lines** at 90 and 180 bpm. Dotted reference lines at 120 and 160. |
| **Amniotic fluid / Moulding** | Dual `<select>` per cell: Amniotic fluid (I/C/M/B) + Moulding (0/+/++/+++). 24 columns. |
| **Cervix / Descent** | **Outer Y-axis**: Cervix 0-10 cm (11 rows). **Inner Y-axis**: Descent 0-5 (6 rows). **Alert line** (solid black, 1px): from [4cm, Hour 0] → [10cm, Hour 6], labeled "Alert". **Action line** (dashed red, 2px): from [4cm, Hour 4] → [10cm, Hour 10], labeled "Action". **Click** to place X (cervix). **Shift+Click** to place O (descent). **WHO crossing logic**: Warning banners — "Crossed Alert Line" (amber) and animated red "ACTION REQUIRED". |
| **Contractions per 10 min** | Y-axis 1-5 (5 rows). Select per cell (1-5). Visual shading key. |
| **Oxytocin U/L drops/min** | Select per cell (0/5/10/15/20/30/40/50). |
| **Drugs given and IV fluids** | Full-width `<textarea>` (3 rows height). |
| **Maternal Vital Signs** | SVG chart (60-180, 13 rows). **Click** (no drag) = toggle pulse dot (●). **Click+drag** (≥5px movement) = draw BP arrow (↑) with systolic at mousedown, diastolic at mouseup position. Legend below. |
| **Temperature °C** | `<input type=number step=0.1 min=30 max=42>` per cell. |
| **Urine** | 3 rows: **protein** (Nil/+/++/+++), **acetone** (Nil/+/++/+++), **volume** (<30/30-100/>100). Select per cell. |
| **Hours + Time** | Numbered HOURS 0-23 + TIME inputs per cell (bottom rows). |

#### Undo/Redo System
- History stack in MaternityLabourWard tracks every mutation: add/delete/update/clear
- **Undo**: reverses last action (deletes added entry, re-creates deleted entry, restores old value)
- **Redo**: re-applies undone action
- **Clear All**: deletes all entries for the current patient (undoable)
- Stack persists across component re-renders

#### Data Model
```typescript
type PartoEntry = {
  hour: number; time?: string; fhr?: number; cervix_cm?: number; descent_0_5?: number;
  contractions?: 1|2|3|4|5; oxytocin?: number; pulse?: number; bp_sys?: number; bp_dia?: number; temp?: number;
  amniotic_fluid?: 'I'|'C'|'M'|'B'; moulding?: '0'|'+'|'++'|'+++';
  urine_protein?: 'Nil'|'+'|'++'|'+++'; urine_acetone?: 'Nil'|'+'|'++'|'+++'; urine_volume?: '<30'|'30-100'|'>100';
  drugs_iv?: string; _id?: string;
}
```

#### Key Fixes
- **Cross-field corruption**: Vitals chart fired BOTH `onClick` (pulse dot) AND `onMouseDown` (BP arrow) on every click. Fixed: `onMouseDown`+`onMouseUp` with 5px movement threshold distinguishes click (pulse toggle) vs drag (BP arrow). No more `useEffect` window mousemove listener — saves only on mouseup.
- **Race conditions**: Removed per-mousemove API saves during BP drag. BP sys saves on mousedown, BP dia saves on mouseup only.
- **Cleanup**: `onMouseLeave` handler + window `mouseup` listener (no mousemove) for when user drags outside chart.

### 10. Access by Role (Maternity)

| Feature | Records | Nurse | Doctor | Admin |
|---------|:------:|:-----:|:-----:|:-----:|
| Maternity Dashboard | ✓ | ✓ | ✓ | ✓ |
| Book Pregnancy | ✓ | ✓ | ✓ | ✓ |
| Maternity Patient List | ✓ | ✓ | ✓ | ✓ |
| ANC Visit Recording | - | ✓ | ✓ | ✓ |
| Labour Admission | - | ✓ | ✓ | ✓ |
| Partograph Recording | - | ✓ | ✓ | ✓ |
| Delivery Recording | - | ✓ | ✓ | ✓ |
| Postnatal Care | - | ✓ | ✓ | ✓ |
| Patient Chart Maternity tab | ✓ (read-only) | ✓ | ✓ | ✓ |
| Maternity Vitals fields | - | ✓ (if maternity patient) | ✓ (if maternity patient) | ✓ (if maternity patient) |

### 11. Plan Document

A comprehensive `MATERNITY_MODULE_PLAN.md` file was created at project root detailing:
- Full implementation plan with architecture, database schema, server routes, client components
- Access matrix by role
- Build order (5 phases)
- Integration points (Admissions, Paypoint, Inventory, Lab, Appointments)
- Sidebar and navigation placement

### 12. Files Created

```
database/024_maternity_core.sql
database/025_maternity_labour.sql
database/026_maternity_postnatal.sql
database/027_vitals_maternity_fields.sql
server/src/routes/maternity.ts
server/src/db/migrate.ts
client/src/components/MaternityDashboard.tsx
client/src/components/MaternityBooking.tsx
client/src/components/MaternityPatientList.tsx
client/src/components/MaternityPatientDetail.tsx
client/src/components/MaternityANCWorklist.tsx
client/src/components/MaternityLabourWard.tsx
client/src/components/MaternityLabourSummary.tsx
client/src/components/MaternityPostnatalWard.tsx
client/src/components/PartographChart.tsx
MATERNITY_MODULE_PLAN.md
```

### 13. Files Modified

```
server/src/server.ts                    — registered maternity routes, auto-run migrations
server/src/routes/vitals.ts             — added 8 maternity fields to POST/PUT with audit
server/src/db/init.ts                   — replaced single-migration with runMigrations()
client/src/App.tsx                      — added 7 maternity sidebar links + routes + icons
client/src/components/PatientChart.tsx  — added Maternity tab + booking/ANC modals + vitals fields
client/src/components/TriageStation.tsx — conditional maternity vitals fields
client/src/components/MyPatients.tsx    — conditional maternity vitals fields
client/src/components/DoctorVitals.tsx  — conditional maternity vitals fields + display cards
client/src/components/DoctorConsultation.tsx — maternity info banner
```

---

## Session 2026-08-12 — Insurance/HMO Module (Full Implementation) + Cross-Module Compliance Fixes

**Scope:** Complete Insurance/HMO module for the Sretan HMS/EMR + security/compliance fixes from the rules audit.

---

### 1. Cross-Module Compliance Fixes (from `RULES_COMPLIANCE_AUDIT.md`)

| Rule | Fix | File |
|------|-----|------|
| **Rule 5 — Defensive Validation** | `validateVitalRanges()`: temperature 32–43°C, SpO2 0–100%, systolic BP 60–250, diastolic 30–150, pulse 30–250, RR 5–60, reject negatives (weight/height/fluids/FHR/fundal/Hb/PCV/GA) | `server/src/routes/vitals.ts` |
| **Rule 5** | Reject `quantity_dispensed <= 0` | `server/src/routes/pharmacy.ts` |
| **Rule 5** | Reject negative unit_price / zero-negative quantity | `server/src/routes/payments.ts` |
| **Rule 3 — Tenant Isolation** | Added `tenant_id` to `wards`, `admissions`, `beds` (migration `038`) with dynamic backfill; all admissions handlers use `getTenantId()` | `server/src/routes/admissions.ts`, `database/038_wards_admissions_tenant.sql` |
| **Rule 2 — Audit Logging** | Added `audit_logs` INSERTs (performed_by, old_data, new_data) for encounters POST/PUT, vitals POST/DELETE, admissions POST/discharge | `encounters.ts`, `vitals.ts`, `admissions.ts` |
| **Rule 3 — Auth (Critical)** | `isSuperAdmin()` returns `false` for `user_type === 'insurance_staff'` (master token no longer grants superadmin to insurance staff) | `server/src/utils/insuranceAuth.ts` |

---

### 2. Insurance Database Migrations

| File | Purpose |
|------|---------|
| `028_insurance_providers.sql` | Providers + insurance_staff_users tables, `patient_insurance_id` column |
| `032_insurance_seed_providers.sql` | 10 Nigerian HMOs (NHIS, Greenfield, Reliance, AXA, Leadway, Hygeia, THT, Precious, Clearline, Multi-Shield) |
| `033_insurance_seed_staff.sql` | Test user `insurance@sretan.com` / `insurance` |
| `034_insurance_cases.sql` | Cases, services, policies, auth requests, co-pay config, excluded services, invoices + items |
| `035_insurance_provider_category.sql` | `category` column on providers + backfill |
| `036_insurance_case_services_source.sql` | Source tracking columns (`source_type`, `source_id`) |
| `037_insurance_service_invoicing.sql` | Service invoicing state (`pending`/`invoiced`), `total_invoiced`/`total_uninvoiced` on cases |
| `039_insurance_coverage_rules.sql` | `insurance_provider_coverage_rules` + `default_coverage_pct` on providers |

---

### 3. Server Routes (New)

| File | Purpose |
|------|---------|
| `routes/insuranceAuth.ts` | Insurance staff login/logout/me |
| `routes/insuranceProviders.ts` | Provider CRUD, 24h code lock, name/category cascade to patients, deactivate/activate, superadmin hard-delete |
| `routes/insuranceStaff.ts` | Staff CRUD, roles (admin/editor/viewer), access scope (own/all), deactivate/activate, superadmin hard-delete |
| `routes/insuranceCases.ts` | Cases CRUD, services CRUD (+ soft-remove), auth requests, policies, co-pay, patient coverage, patient list/summary |
| `routes/insuranceInvoices.ts` | Invoice generation (per-case + per-period), draft→sent→paid, cancel/void reopen services |
| `routes/insuranceReports.ts` | Utilization, financial, aging reports |
| `routes/insuranceCoverage.ts` | Coverage rules CRUD + inventory items endpoint |
| `utils/autoSyncServices.ts` | Auto-sync completed clinical services (lab/radiology/pharmacy/admissions/encounters/treatments/fluids-intake/maternity) with real inventory prices |
| `utils/coverageLookup.ts` | Coverage % lookup (item override → category rule → provider default → 100%) + patient primary insurance |
| `utils/insuranceAuth.ts` | Role/scope helpers, `isSuperAdmin` fix |

---

### 4. Frontend Components (New)

| Component | Route | Purpose |
|-----------|-------|---------|
| `InsuranceLogin.tsx` | `/insurance/login` | Insurance staff login |
| `InsuranceLayout.tsx` + `InsuranceSidebar.tsx` | — | Responsive hamburger sidebar layout |
| `InsuranceDashboard.tsx` | `/insurance/dashboard` | Stats + month billed (WAT) |
| `InsuranceProviders.tsx` | `/insurance/providers` | Provider CRUD + deactivate/activate + delete + coverage rules modal |
| `InsuranceStaff.tsx` | `/insurance/staff` | Staff CRUD + roles + deactivate + delete |
| `InsuranceCases.tsx` | `/insurance/cases` | Case list with search/filter |
| `InsuranceCaseDetail.tsx` | `/insurance/cases/:id` | Case detail, services, remove/delete modals |
| `InsuranceNewCase.tsx` | `/insurance/cases/new` | Create case + prefill from auth request |
| `InsurancePatients.tsx` | `/insurance/patients` | Patient list with primary insurance tags |
| `InsurancePatientDetail.tsx` | `/insurance/patients/:id` | Main / Clinical Reference / Insurance Services / Invoices tabs |
| `InsuranceInvoices.tsx` | `/insurance/invoices` | Invoice list + review workflow + print |
| `InsuranceReports.tsx` | `/insurance/reports` | Financial / utilization / aging reports |
| `InsuranceAuthRequests.tsx` | `/insurance/auth-requests` | Pre-authorization workflow |
| `NumberStepper.tsx` | — | Reusable numeric input (fractions, +/- stepper, empty-by-default handling) |

---

### 5. Key Insurance Features

#### 5.1 Insurance Unification (`patient_insurance_policies` = single source of truth)
- Registration and Records edit capture directly into policies (not `patients.insurance_type`)
- Only registered providers selectable (no free-text entry)
- Policy status computed: **active / expired / deactivated**
- **One primary per patient** enforced (adding a primary demotes the old one)
- **Same provider can't be both primary + secondary** (server POST/PUT + UI dropdown filter)
- **Co-pay inheritance**: new policies inherit provider default unless overridden
- **Auto-promotion**: when primary expires, oldest active secondary auto-promoted (with `↑ Primary` tag)

#### 5.2 Coverage Rules & Billing Routing
- Coverage rules page (`/insurance/providers` → % icon): provider default %, category-level %, individual item overrides from inventory
- Coverage lookup priority: item override → category rule → provider default → 100%
- `GET /api/payments/pending/:patientId` auto-routes insured patients:
  - 100% covered → auto-billed to insurance case, marked paid, skipped at Paypoint
  - Partial → insurance portion auto-billed, patient pays remainder at Paypoint
  - 0% covered → normal Paypoint billing
- Dedup logic prevents re-billing on repeated fetches

#### 5.3 Insurance Patient Detail — Two service actions
- **X icon** (session remove): hides service for current billing view; returns on refresh (client-side Set)
- **Trash icon** (permanent delete): 2-step stylish confirmation → hard delete from DB

#### 5.4 Insurance Badges (primary insurance)
- Added `primary_provider` to patients list/search/detail + maternity endpoints
- Badge shown next to patient names in: RecordsPatientList, RecordsPatientDetail, PatientChart, DoctorConsultation, DoctorDashboard, MyPatients, TriageStation, PatientDashboard, MaternityPatientList, MaternityDashboard

#### 5.5 Provider Actions
- **Deactivate/Activate** (Power icon): insurance staff + admin, 2-step confirmation
- **Delete** (Trash icon): superadmin only, 3-step confirmation, cascade deletes
- Server enforces 403 for insurance staff on delete

#### 5.6 NumberStepper
- Empty-by-default, numbers only (incl. fractions)
- Stepper arrows increment by 1
- Shows actual qty/price as default
- Total always = qty × price (0 if either empty)

---

### 6. Admin Integration
- Insurance module accessible to clinical Admin/Finance via `/admin/insurance/*` routes
- "Insurance" category added to clinical sidebar (Admin: all, Finance: read-only dashboard/cases/invoices)

---

### 7. Test User
- **Email:** `insurance@sretan.com`
- **Password:** `insurance`
- Role: admin, Provider: Greenfield HMO, Access scope: own
- Login at `/insurance/login` or via main login (auto-detected)

---

### 8. Documentation Files Created
- `INSURANCE_MODULE_PLAN.md` — design/plan
- `INSURANCE_MODULE_GAP_ANALYSIS.md` — gap analysis
- `RULES_COMPLIANCE_AUDIT.md` — cross-module compliance audit
- `INSURANCE_IMPLEMENTATION.md` — implementation record

---

*End of Session Summary — August 12, 2026*

---

## Session 2026-08-26 — Pharmacy Billing & Insurance, Standardized Receipts, Paypoint Enhancements, Username Login

**Session Date:** August 26, 2026

---

### 1. Pharmacy Dispensing & Insurance Billing

- **Dispense with "Bill to Insurance"** (`pharmacy.ts`): when `bill_to_insurance` is set, the prescription is now marked `is_paid = true` alongside `status = 'dispensed'`, so the item stops appearing at Paypoint. A defensive guard rejects billing an already-paid prescription (400).
- **Bill-to-insurance marks source orders paid** (`insuranceCases.ts`): `/insurance/bill-to-insurance` now calls `markSourceOrderAsPaid()` — prescriptions, lab, radiology, and admissions are marked paid; `folder_activation` items set `folder_activated = true`. Includes `service_id` + `source_type` traceability in `insurance_case_services`.
- **Dispense modal note** (`Dispensing.tsx`): paid prescriptions show **"Billed to insurance"** vs **"Already paid at Paypoint"** via a new `billed_to_insurance` flag (EXISTS against `insurance_case_services`) returned by `GET /api/prescriptions`.
- **Dispensing page** now lists only **paid** prescriptions (subtitle/count/empty state updated).
- **New `/dispensing/unpaid` page** (`UnpaidOrders.tsx`): comprehensive card grid of all unpaid prescriptions — search (drug/patient/hospital #/phone/doctor), summary cards, 30/page styled pagination, insurance tags. Backed by new `GET /api/prescriptions/unpaid` endpoint (parameterized join incl. patient + doctor + drug price).

### 2. Pharmacy Module Restructure

- `/pharmacy` (removed route + menu item) → **Pharmacy Dashboard** (`PharmacyDashboard.tsx`) is now an **operational hub**: live "Ready to Dispense (Paid)" list, low-stock/expiring banners, stat cards, quick actions, low-stock list. Pharmacists land on it at `/dashboard` (DashboardRouter → `<PharmacyDashboard />`).
- Dashboard menu item now uses the **Pill** icon; back-navigation buttons across pharmacy pages retargeted to `/dashboard`.
- Styled, overflow-safe pagination (30/page) across `/dispensing` and `/dispensing/unpaid` (`flex-wrap`, `min-h-0`, pill "Page X / Y").

### 3. Paypoint Module

- **Insurance pages removed from the Finance module**: removed `Finance` role from all insurance sidebar links and wrapped `/admin/insurance/*` routes in `<ProtectedRoute roles={['Admin']}>`.
- **`/finance/payment-history`**: pagination 30/page (always-visible bar).
- **"Bill to Insurance" for all items** at Paypoint (`PaypointPending`, `PaypointCheckout`) gated on an **active insurance case** — all item types can be billed; billed items leave pending.
- **`/paypoint/patients` + `/paypoint/pending`**: pagination 30/page, search by **phone**, **primary insurance tags**, newest-first sorting (via `last_pending_at`, `insurance_provider`, `phone` added to `pending-summary`/`all-pending-items`).
- **`/paypoint/billing`**: pagination 30/page + primary insurance tags (uses existing `primary_provider` from `/api/patients`).
- **`/paypoint/dashboard`**: insurance tags on search results + selected patient; cart **Bill to Insurance** toggle (only with an active case); when ticked the **Cash/Card/Transfer/POS buttons are hidden** and the primary insurance provider is shown; checkout posts to `/insurance/bill-to-insurance` (audited `added_by`) with an `INS-<case>` receipt.
- Fixed a pre-existing React duplicate-key warning in patient service badges.

### 4. Walk-in Sales (`/walk-in-sales`)

- **Click any inventory row** to add to cart (multiple clicks increment until stock limit).
- **Discount checkbox** reveals the discount field; **Subtotal and Sale Notes removed**.
- **Patient search in the cart** (registered patients with insurance tags) + **Bill to Insurance** toggle; when ticked, payment methods are hidden and the primary insurance is shown; billing adds to the patient's insurance case.
- **Barcode/scan input removed**; sales table converted to **Sales Today / Sales History tabs** with search + 30/page pagination; View + Print actions per sale (sale-details modal with **Print Receipt** for thermal printer); delete/void button removed.
- **Sale-complete modal fixes**: `max-h` constrained with scrollable body + pinned footer (buttons always visible), **Done left / Print Receipt right**, and fixed the **blank-page-after-sale** crash (`unit_price` from pg arrives as a string → `parseFloat` on add-to-cart + defensive `Number()` in receipt/print).
- **Cart items list enlarged** in all cart views (Walk-in Sales, Paypoint Dashboard/Pending/Patients/Checkout, Billing) and **notes boxes removed** everywhere (dead `notes` state cleaned, payloads send `notes: null`).
- Print window no longer blocks the app: auto-print now runs inside the popup's own document; popup-blocked shows a non-blocking notice.

### 5. Standardized Receipts & Reports

- New **`client/src/utils/print.ts`** shared module: hospital constants (**MACHOKO MEMORIAL HOSPITAL**, address, Tel: 0802900231 / 07068855750 / 08068862666), `buildReceiptHtml` (Item / Qty / **Price = qty×price**, **TOTAL below**), `generateReceiptNumber` (**MMH-** prefix), `printPaymentReceipt`, `printRadiologyReport`, `openPrint`, `escapeHtml`, receipt/report headers.
- **Receipt format applied to every receipt** (Walk-in Sales cart + per-sale, Paypoint Pending/Checkout/Dashboard/Patients, Billing, Finance): heading, address, contact, Receipt No (**MMH-…**), **Date + Time on one line**, Staff, Customer, Payment Method, line items, TOTAL, auto-print.
- **Lab & radiology report/result prints** use the same heading/address/contact only (`labPrint.ts`, Lab Worklist/History report modals + copies, `RadiologyResults`, `PatientChart` radiology print, insurance invoices).
- Date+time combined onto one receipt line.

### 6. Username Login

- **Migration `041_staff_usernames.sql`**: added `username` to `staff_users` and `insurance_staff_users`; backfilled from the email local part (`doctor@sretan.com` → `doctor`) with `_N` de-duplication and fallbacks (idempotent).
- **Login accepts username OR email** (case-insensitive) in `auth.ts` and `insuranceAuth.ts`; `username` returned in the user object.
- **Staff create/update** (`staff.ts`) accepts `username` (derives from email prefix when blank, format-validated, duplicate 409); `GET /api/staff` returns it.
- **Login pages** (`Login.tsx`, `InsuranceLogin.tsx`): field is now **"Username or Email"** (placeholder `e.g. doctor`).
- **StaffManagement.tsx**: Add Staff modal has a **Username** field that auto-fills from the email prefix as typed.
- `scripts/seed_users.cjs` and `SETUP.md` updated with demo usernames (admin, doctor, nurse, lab, pharmacy, records, paypoint).

### 7. Branding & Misc

- **MACHOKO EMR → MACHOKO HMS** everywhere (login title, sidebar, browser tab, server startup log, setup console).
- Server `GET /api/prescriptions` returns `billed_to_insurance`; `GET /api/prescriptions/unpaid` added.
- New migrations this session: `040_otc_sales_void.sql` (void columns + audited void/restock endpoint `PUT /api/otc-sales/:id/void`), `041_staff_usernames.sql`.

---

*End of Session Summary — August 26, 2026*
