# Machoko HMS — Comprehensive Session Summary

**Date:** June 13, 2026
**Project:** Hospital Management System (formerly Sretan EMR, now Machoko HMS)
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
