# Sretan EMR — Session Summary (June 8, 2026)

## Overview
Major feature additions across pharmacy, lab, nurse, and doctor modules. Fluid balance system completely redesigned with session-based daily tracking. Role-based dashboards and access controls implemented.

---

## 1. Pharmacy Module

### Walk-in Sales (`/walk-in-sales`)
- New dedicated page for OTC/non-patient sales
- Cart system: searchable inventory, add/remove items, quantity controls, editable unit prices
- Multi-item checkout: processes all cart items sequentially, reduces inventory
- Payment method selector (Cash/Card/Transfer)
- Receipt modal after sale with itemized list and copy-to-clipboard
- Responsive: desktop shows cart side-by-side, mobile shows floating cart button with bottom-sheet modal
- Cart badge on sidebar link, auto-refreshes pending count every 30s

### Pharmacy Inventory (`/inventory`)
- Inventory management page (sortable, searchable, low stock alerts)
- Add Item button restricted to Admin role only
- Category field (`pharmacy` / `lab`) separates pharmacy from lab inventory

### Dispensing (`/dispensing`)
- Shows prescribing doctor name (fetched from encounter's staff_id)
- Dispense modal shows prescribed by doctor

---

## 2. Laboratory Module (Comprehensive Rewrite)

### Lab Test Catalog
- 25+ predefined lab tests seeded (CBC, Malaria, LFT, RFT, Lipid Profile, etc.)
- Searchable dropdown in walk-in lab form
- API: `GET/POST /api/lab-test-catalog`

### Lab Inventory (`/lab-inventory`)
- Dedicated page for lab supplies (category=`lab`)
- Sortable columns, low stock alerts, Admin-only add
- 10 mock lab inventory items seeded for testing

### Lab Low Stock (`/lab-low-stock`)
- Shows only items below reorder level in lab category

### Lab Workbench (`/lab`) — Major Rewrite
**Tabs:** Worklist | Results | History | Walk-in Lab
- **Worklist**: Full order lifecycle (ordered → collected → processing → completed)
  - Search by patient, test, or lab number
  - Filter by status. Pagination (15/page)
  - Sample collection button, enter results button, view button
- **Results**: Pending Approval (approve/reject) and Completed sub-tabs
  - Approve sets status=completed, updates lab_order status
  - Reject sends back to draft
- **History**: All approved/rejected results with details
- **Walk-in Lab**: Direct lab requests for non-patients
  - Patient name, phone, test (searchable catalog), specimen type, priority, referred by
  - Creates lab_orders without encounter_id

### Lab Numbering
- `lab_number`: unique per lab order (LAB-2026-XXXXX)
- `request_number`: groups multiple tests from same walk-in submission (REQ-XXXXX)
- `order_number`: sequential per test within a request (ORD-001, ORD-002)
- For registered patients: `lab_number` = patient's `hospital_number`
- For walk-in patients: `lab_number` based on phone number (digits only)
- `lab_results` get `result_number` (RES-2026-XXXXX)

### Lab Notifications
- Sidebar badges: Lab Scientist sees pending order count, Doctor sees completed results count

---

## 3. Lab Results / Doctor View (`/my-lab-results`)
- Dedicated lab page for doctors (separate from LaboratoryWorkbench)
- Shows only the logged-in doctor's ordered tests
- Stats: Requested, Pending, Processing, Completed
- **Unread tracking**: `doctor_read_at` column on lab_orders
  - Blue dot + border on unread completed results
  - "View Results" marks as read
  - Sidebar badge shows unread count ("N unread")
  - `POST /api/lab-orders/mark-read` bulk endpoint

---

## 4. Appointments Module

### Appointments Page (`/appointments`)
- Date picker, status filter (Scheduled, Completed, Cancelled)
- Stats cards for admin/nurse view
- Doctor view auto-filters by logged-in doctor
- **Active tab**: shows scheduled (not expired), Complete/Cancel buttons
- **History tab**: shows completed/cancelled/expired, searchable, filterable
- **Auto-expiry**: past-due scheduled appointments shown as "Expired" without modifying DB
- **Booking modal**: searchable patient dropdown, doctor dropdown, 12-hour AM/PM time picker
- Date filter dropdown: All Time, Today, Yesterday, This Week, This Month, This Year, Custom Day, Custom Range
- Confirmation modal for Complete/Cancel actions

---

## 5. Nurse Module — Comprehensive Implementation

### Dashboard (`/dashboard` for Nurse)
- Quick-action cards: Triage, Register Patient, Patients, Appointments, Admissions, Vitals History

### Triage Station (`/triage`) — Rewritten
- **Waiting tab**: Patient queue board (checked-in patients), searchable, "Triage" button
- **Vitals Entry tab**: Patient selection → vitals grid (BP, Pulse, Temp, RR, Weight, SpO₂)
  - Triage priority pills (Red = Emergency, Yellow = Urgent, Green = Routine)
  - Nursing notes textarea, fluid balance (intake/output)
  - Submit creates encounter + vitals + updates patient status
- **Triaged tab**: Patients in triage, "Move to Waiting" button → status=waiting
- All entries attributed to nurse via staff_id

### Patients List (`/patients` for Nurse)
- "Consult" replaced with "Vitals" button (opens inline vitals modal)
- "Chart" button remains
- No "Admit to Ward" / "Discharge from Ward" buttons
- Vitals modal: 7 fields + triage priority + nursing notes, saves to encounter+vitals

### Vitals Page (`/vitals`) — Enhanced
- Patient search, select → vitals history
- "Record Vitals" button for both Nurses and Doctors
  - Same modal pattern: 7 vitals fields + priority + notes
- Nurse name and timestamp displayed on each vitals card

### Clinical Notes (Nurse) — `nurse_notes` table
- Nurses Clinical Notes tab in Patient Chart
- Note types: General, Observation, Handover, Incident, Care Plan Update
- Doctor notes stored with `note_type='doctor'` in same table

### Nurse-Specific Tabs in Patient Chart
- **Treatments (Treatment Sheet)**: Medication administration record
  - Add Treatment modal: drug name, dosage, route, frequency, administration times (12-hour checkboxes)
  - Dose grid: time slots (6AM, 8AM, 10AM, 12PM, etc.) — click to administer or skip
  - Stylish confirmation modal for administer/skip
  - "End Treatment" button with confirmation modal
  - Started/Expired timestamps with nurse attribution
  - `treatment_doses` table tracks individual doses
- **Fluid (Fluid Balance)**: Session-based daily tracking (see below)
- **Nurses Clin. Notes**: Written notes with pagination
- **Doctors Cli. Notes**: Written notes + SOAP notes from encounters

### Fluid Balance — Session-Based Rewrite

**Concept:** Each day/shift = one fluid session. Multiple entries per session. Sessions have date + nurse attribution.

- **New Session (Day) button**: Creates a `fluid_sessions` record (patient_id, staff_id, session_date)
- **Session Card**: Expandable, shows date, nurse, entry count, net balance
- **Expanded view**:
  - Stats row: Intake / Output / Net totals for the session
  - **Add Intake** button → modal with fluid type (searchable 160+ fluids), intake mL, route checkboxes (Oral/IV/Foley/Parenteral/Other)
  - **Add Output** button → modal with output types (Urine/Vomit/Aspirate/Bowels/Blood Loss) each in mL, auto-calculated total
  - **Intake Detail** → view modal showing accumulated intake by route for this session
  - **Output Detail** → view modal showing accumulated output by type for this session
  - **Intake Entries** (blue cards): only entries with intake_ml > 0, compact route breakdown
  - **Output Entries** (amber cards): only entries with output_ml > 0, compact type breakdown
- **Database**: `fluid_sessions` table + `session_id` FK on `fluid_balance`
- **API**: `GET/POST /api/fluid-sessions`, `GET/POST /api/fluid-balance?session_id=X`

### Fluid Balance Entry Modals
- Two independent modals for intake and output (not mixed)
- Each submits as a `fluid_balance` record with `details` JSONB (intake route map / output type map)
- Attributed to nurse via staff_id, linked to session via session_id

---

## 6. Role-Based Access Control

### Sidebar Visibility by Role
| Page | Doctor | Nurse | Lab Scientist | Pharmacist | Records | Paypoint | Admin |
|------|--------|-------|--------------|------------|---------|----------|-------|
| Dashboard | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Register Patient | - | ✓ | - | - | ✓ | - | ✓ |
| Triage | - | ✓ | - | - | - | - | ✓ |
| Patients | ✓ | ✓ | - | ✓ | ✓ | ✓ | ✓ |
| Vitals | ✓ | ✓ | - | - | - | - | ✓ |
| Appointments | ✓ | ✓ | - | - | ✓ | - | ✓ |
| Admissions | ✓ | ✓ | - | - | - | - | ✓ |
| Laboratory | ✓ | - | ✓ | - | - | - | ✓ |
| Lab Inventory | - | - | ✓ | - | - | - | ✓ |
| Lab Low Stock | - | - | ✓ | - | - | - | ✓ |
| Pharmacy etc. | - | - | - | ✓ | - | - | ✓ |
| Prescriptions | ✓ | - | - | ✓ | - | - | ✓ |

### Patient Chart Actions by Role
| Action | Doctor | Nurse |
|--------|--------|-------|
| Record Vitals | ✓ | ✓ |
| Consult (SOAP) | ✓ | - |
| Add Treatment | - | ✓ |
| Add Clinical Note (Nurse) | - | ✓ |
| New Note (Doctor) | ✓ | - |
| Add Fluid Entry | - | ✓ |
| Intake/Output Detail | ✓ | ✓ |

---

## 7. Doctor Module Enhancements

### Doctor Dashboard (`/dashboard`)
- Stats: Total Patients, Pending Rx, Pending Lab, Appointments (new), In Consultation
- Quick Actions: Patients, Lab Results, Prescriptions (colored cards)
- Patient Queue: searchable, 10 per page, Consult button per patient

### Consultation (`/consultation/:patientId`)
- SOAP tab: 4 fields (Subjective, Objective, Assessment, Plan) + Notes field with voice input
- ICD-11 browser saves diagnoses to encounter
- Lab order modal: searchable test catalog dropdown
- Prescription: drug auto-complete from inventory, "Other" option for custom names
- Timeline: expandable entries showing doctor name, timestamp, SOAP notes, diagnoses
- Timeline modal: full encounter details + prescriptions + lab orders + radiology orders + lab results

### Appointment Stats Card
- Shows active scheduled appointments count for logged-in doctor
- Clickable → opens Appointments page

---

## 8. UI / UX Improvements

### Voice Input
- Microphone button next to each SOAP field + Notes field
- Uses Web Speech API (Chrome/Edge/Safari)
- Appends to existing text, respects pre-speech content

### Pagination (15 per page)
- Added to: Worklist, Results, History, Lab, Rx, Encounters, Vitals, Admissions, Treatments, Fluid Balance
- Previous/Next buttons with up to 5 numbered page buttons
- Pages reset on tab switch

### Back Buttons
- Added `ArrowLeft` navigation to all pages (navigate(-1))

### Responsive Design
- Mobile floating cart button for walk-in sales
- Responsive grids throughout (1→2→3 columns based on breakpoint)
- Sidebar toggle on mobile
- `Layout` component `<main>` has `overflow-x-hidden` to prevent page-level horizontal scrollbar on all routes
- **Standard requirement for all future pages/modules:** Fit any screen size (320px+) without horizontal page scrollbar. Use `flex-wrap`, `truncate`, responsive grid columns, and `overflow-x-auto` for scrollable tables/tabs. All `flex items-center justify-between` rows with potentially long text must include `flex-wrap` and `min-w-0` with `truncate` on text spans. See Master Guide Plan for full specification.

---

## 9. Database Changes

### New Tables
- `otc_sales` — walk-in pharmacy sales
- `lab_test_catalog` — predefined lab tests (25 seeded)
- `nurse_notes` — clinical notes (with note_type for doctor/nurse separation)
- `treatments` — treatment administration records
- `treatment_doses` — individual dose tracking per treatment (time slots)
- `fluid_balance` — fluid intake/output records
- `fluid_sessions` — daily fluid balance sessions
- `purchase_orders` — pharmacy procurement

### New Columns
- `inventory_items.category` — 'pharmacy' | 'lab'
- `inventory_items.amount_type` — units, mL, etc.
- `lab_orders.specimen_type`, `priority`, `patient_name`, `patient_phone`, `referred_by`, `lab_number`, `order_number`, `request_number`, `collected_at`, `results_collected_at`, `doctor_read_at`
- `lab_results.result_number`
- `encounters.diagnoses` (JSONB)
- `admissions.admitted_by`, `discharged_by`
- `treatments.status`, `start_date`, `end_date`, `ended_by`, `times`
- `fluid_balance.session_id`, `details` (JSONB)

### Constraints
- `lab_orders.lab_number` UNIQUE dropped (allows grouping multiple orders under same lab_number)
- `patients.hospital_number` UNIQUE

---

## 10. Key API Endpoints Added

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/otc-sales` | GET/POST | Walk-in pharmacy sales |
| `/api/lab-test-catalog` | GET/POST(+search) | Lab test catalog |
| `/api/lab-orders/stats` | GET | Lab order counts by status |
| `/api/lab-orders/mark-read` | POST | Mark doctor's results as read |
| `/api/treatment-doses/:id/administer` | PUT | Mark dose as administered |
| `/api/treatment-doses/:id/skip` | PUT | Skip a dose |
| `/api/nurse-notes` | GET/POST | Clinical notes |
| `/api/treatments` | GET/POST | Treatment records |
| `/api/treatments/:id` | PUT | End treatment (status=expired) |
| `/api/fluid-balance` | GET/POST | Fluid intake/output entries |
| `/api/fluid-sessions` | GET/POST | Daily fluid sessions |
| `/api/admissions` | GET/POST | Admission records |
| `/api/admissions/:id/discharge` | PUT | Discharge from ward |
| `/api/admissions/active` | GET | Active admissions |
| `/api/wards` | GET | Hospital wards list |
| `/api/appointments` | GET/POST | Appointment management |
| `/api/purchase-orders` | GET/POST | Pharmacy purchase orders |

---

## 11. Seed Data
- 25 lab tests in `lab_test_catalog`
- 10 lab inventory items (below reorder level for low-stock testing)
- 6 wards: General, Maternity, Pediatric, ICU, Surgical, Isolation, Male, Female
- 7 staff users with roles: Admin, Doctor, Nurse, Lab Scientist, Pharmacist, Records, Paypoint
- 160+ common medical fluids

---

## To Build/Run

### Frontend
```bash
cd client
npm install
npm run dev
```
### Backend
```bash
cd server
npm install
npx tsx src/server.ts
```
### Database
PostgreSQL 16+, database name: `sretan_emr`
Auto-migrates on server startup (creates tables)
Seed scripts: `server/seed_users.cjs`
