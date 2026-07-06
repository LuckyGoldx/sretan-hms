# Sretan HMS — Maternity Module Implementation Plan

**Date:** July 2, 2026

---

## Table of Contents

1. [Overview](#1-overview)
2. [Sidebar & Navigation](#2-sidebar--navigation)
3. [Database Schema](#3-database-schema)
4. [Server API Endpoints](#4-server-api-endpoints)
5. [Client Pages & Components](#5-client-pages--components)
6. [Patient Chart Integration](#6-patient-chart-integration)
7. [Nurse Vitals Enhancement](#7-nurse-vitals-enhancement)
8. [Doctor Consultation Integration](#8-doctor-consultation-integration)
9. [Workflows](#9-workflows)
10. [Access by Role](#10-access-by-role)
11. [Build Order](#11-build-order)
12. [Integration Points](#12-integration-points)

---

## 1. Overview

The Maternity module adds full pregnancy lifecycle tracking to Sretan HMS:

- **Pregnancy Booking** — Register a female patient for antenatal care with LMP, EDD, gravida/para, blood group, genotype, risk assessment
- **Antenatal Visits** — Structured visit tracking (visit number, fundal height, fetal presentation, FH, urine tests, hemoglobin, next appointment)
- **Labour & Delivery** — Labour admission, WHO partograph monitoring, delivery recording, newborn registration (supports twins/triplets)
- **Postnatal Care** — Mother follow-up visits (fundus, lochia, wound healing, breastfeeding, family planning)
- **Nurse Vitals Integration** — Maternity fields (fundal height, FH, urine protein, Hb) added to existing vitals forms
- **Doctor Consultation Integration** — Maternity info banner in consultation page
- **Patient Chart Tab** — Maternity tab in the existing patient chart

The module follows the same patterns established by Laboratory, Radiology, Pharmacy, and Admissions:
- Dedicated sidebar category with sub-pages
- Dedicated server route file with tenant-isolated CRUD
- Database migration files (sequential numbering)
- Lazy-loaded React components
- Role-based access control

---

## 2. Sidebar & Navigation

### 2.1 New Sidebar Category

Maternity gets its own category in the Admin grouped sidebar, positioned between Radiology and Records:

```typescript
// Admin category order
const categoryOrder = [
  'Dashboard', 'Clinical', 'Laboratory', 'Pharmacy',
  'Radiology', 'Maternity', 'Records', 'Finance', 'Administration'
]
```

### 2.2 Sidebar Links

```typescript
// ── Maternity ──
{ to: '/maternity', label: 'Maternity Dashboard', icon: Baby, roles: ['Doctor', 'Nurse', 'Records', 'Admin'], category: 'Maternity' },
{ to: '/maternity/patients', label: 'Patients', icon: Users, roles: ['Doctor', 'Nurse', 'Records', 'Admin'], category: 'Maternity' },
{ to: '/maternity/anc', label: 'ANC Visits', icon: Calendar, roles: ['Doctor', 'Nurse', 'Admin'], category: 'Maternity' },
{ to: '/maternity/labour', label: 'Labour & Delivery', icon: Stethoscope, roles: ['Doctor', 'Nurse', 'Admin'], category: 'Maternity' },
{ to: '/maternity/postnatal', label: 'Postnatal', icon: Heart, roles: ['Doctor', 'Nurse', 'Admin'], category: 'Maternity' },
```

**Role visibility:**
- **Doctor, Nurse, Admin** — see all 5 sidebar links
- **Records** — see only Dashboard + Patients

### 2.3 Icon Import

Add `Baby` to the `lucide-react` import in `App.tsx`:
```typescript
import { ..., Baby, Heart, Calendar } from 'lucide-react'
```

### 2.4 Route Registration

```typescript
const MaternityDashboard = lazy(() => import('./components/MaternityDashboard'))
const MaternityPatientList = lazy(() => import('./components/MaternityPatientList'))
const MaternityPatientDetail = lazy(() => import('./components/MaternityPatientDetail'))
const MaternityANCWorklist = lazy(() => import('./components/MaternityANCWorklist'))
const MaternityLabourWard = lazy(() => import('./components/MaternityLabourWard'))
const MaternityPostnatalWard = lazy(() => import('./components/MaternityPostnatalWard'))

// Routes in App.tsx
<Route path="/maternity" element={<ProtectedRoute roles={['Doctor', 'Nurse', 'Records', 'Admin']}><Layout><MaternityDashboard /></Layout></ProtectedRoute>} />
<Route path="/maternity/patients" element={<ProtectedRoute roles={['Doctor', 'Nurse', 'Records', 'Admin']}><Layout><MaternityPatientList /></Layout></ProtectedRoute>} />
<Route path="/maternity/patients/:id" element={<ProtectedRoute roles={['Doctor', 'Nurse', 'Records', 'Admin']}><Layout><MaternityPatientDetail /></Layout></ProtectedRoute>} />
<Route path="/maternity/anc" element={<ProtectedRoute roles={['Doctor', 'Nurse', 'Admin']}><Layout><MaternityANCWorklist /></Layout></ProtectedRoute>} />
<Route path="/maternity/labour" element={<ProtectedRoute roles={['Doctor', 'Nurse', 'Admin']}><Layout><MaternityLabourWard /></Layout></ProtectedRoute>} />
<Route path="/maternity/postnatal" element={<ProtectedRoute roles={['Doctor', 'Nurse', 'Admin']}><Layout><MaternityPostnatalWard /></Layout></ProtectedRoute>} />
```

---

## 3. Database Schema

### 3.1 Migration Files

Three migration files, sequentially numbered after the latest (`023_vitals_audit.sql`):

| File | Purpose |
|------|---------|
| `024_maternity_core.sql` | Pregnancy profile + ANC visits |
| `025_maternity_labour.sql` | Labour, delivery, partograph, newborns |
| `026_maternity_postnatal.sql` | Postnatal visits |

### 3.2 `024_maternity_core.sql`

```sql
-- ============================================================
-- MATERNITY PATIENTS: Pregnancy profile / booking
-- ============================================================
CREATE TABLE IF NOT EXISTS maternity_patients (
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES patients(id) ON DELETE CASCADE UNIQUE NOT NULL,

  -- Pregnancy dating
  lmp DATE,
  edd DATE,
  booking_gestational_age INT,           -- weeks at time of booking

  -- Obstetric history
  gravida INT DEFAULT 1,
  para INT DEFAULT 0,
  living_children INT DEFAULT 0,

  -- Laboratory
  blood_group VARCHAR(5),                -- A, B, AB, O
  genotype VARCHAR(5),                   -- AA, AS, SS, AC, SC
  rh_factor VARCHAR(10),                 -- Positive, Negative
  hiv_status VARCHAR(20),                -- Reactive, Non-reactive, Unknown
  hbv_status VARCHAR(20),                -- Reactive, Non-reactive, Unknown

  -- Risk assessment
  risk_level VARCHAR(20) DEFAULT 'low',  -- low, high
  risk_factors TEXT,

  -- Status tracking
  status VARCHAR(20) DEFAULT 'active',   -- active, delivered, transferred, anc_lost
  booked_by UUID REFERENCES staff_users(id),
  booked_at TIMESTAMPTZ DEFAULT NOW(),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  is_synced BOOLEAN DEFAULT false,
  last_synced_at TIMESTAMPTZ
);

CREATE TRIGGER update_maternity_patients_updated_at
  BEFORE UPDATE ON maternity_patients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- ANTENATAL VISITS: Each scheduled check-up
-- ============================================================
CREATE TABLE IF NOT EXISTS antenatal_visits (
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  maternity_patient_id UUID REFERENCES maternity_patients(id) ON DELETE CASCADE NOT NULL,

  visit_number INT NOT NULL,             -- auto-incremented per patient
  visit_date DATE NOT NULL,
  gestational_age_weeks INT,

  -- Anthropometrics
  weight DECIMAL(5,2),

  -- Vital signs
  systolic_bp INT,
  diastolic_bp INT,

  -- Obstetric examination
  fundal_height DECIMAL(5,2),           -- cm
  fetal_presentation VARCHAR(50),       -- cephalic, breech, transverse
  fetal_heart_rate INT,
  fetal_heart_sound VARCHAR(50),

  -- Urine dipstick
  urine_protein VARCHAR(20),            -- negative, trace, +1, +2, +3
  urine_glucose VARCHAR(20),

  -- Hematology
  hemoglobin DECIMAL(5,2),              -- g/dL
  pcv DECIMAL(5,2),                     -- %

  -- Preventive care
  tt_dose VARCHAR(20),                  -- tetanus toxoid: 1, 2, 3, 4, 5, completed
  iycf_given BOOLEAN DEFAULT false,     -- iron/folate supplementation

  -- Planning
  next_appointment_date DATE,
  notes TEXT,

  staff_id UUID REFERENCES staff_users(id),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  is_synced BOOLEAN DEFAULT false,
  last_synced_at TIMESTAMPTZ
);

CREATE TRIGGER update_antenatal_visits_updated_at
  BEFORE UPDATE ON antenatal_visits
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

### 3.3 `025_maternity_labour.sql`

```sql
-- ============================================================
-- MATERNITY DELIVERIES: Labour admission → delivery record
-- ============================================================
CREATE TABLE IF NOT EXISTS maternity_deliveries (
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  maternity_patient_id UUID REFERENCES maternity_patients(id) ON DELETE CASCADE NOT NULL,
  admission_id UUID REFERENCES admissions(id) ON DELETE SET NULL,

  -- Labour timeline
  admitted_at TIMESTAMPTZ,
  labour_onset_at TIMESTAMPTZ,
  rupture_of_membranes_at TIMESTAMPTZ,

  -- Delivery details
  delivery_date DATE,
  delivery_time TIME,
  delivery_type VARCHAR(50),            -- SVD, vacuum, forceps, c_section, breech
  delivery_place VARCHAR(50),           -- labour_ward, theatre, other

  -- Perineum & placenta
  perineum_status VARCHAR(50),          -- intact, tear_1st_degree, tear_2nd_degree, tear_3rd_degree, tear_4th_degree, episiotomy
  placenta_delivery VARCHAR(50),        -- complete, incomplete, retained, manual_removal
  placenta_delivery_time TIME,
  blood_loss_ml INT,

  -- Interventions
  oxytocin_given BOOLEAN DEFAULT false,

  -- Complications
  complication VARCHAR(100),            -- PPH, pre_eclampsia, eclampsia, cord_prolapse, shoulder_dystocia, uterine_rupture, none
  complication_notes TEXT,

  -- Staff
  delivered_by UUID REFERENCES staff_users(id),

  -- Outcome
  outcome VARCHAR(20) DEFAULT 'live_birth',   -- live_birth, stillbirth, macerated_stillbirth, miscarriage
  status VARCHAR(20) DEFAULT 'active',        -- active, completed
  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  is_synced BOOLEAN DEFAULT false,
  last_synced_at TIMESTAMPTZ
);

CREATE TRIGGER update_maternity_deliveries_updated_at
  BEFORE UPDATE ON maternity_deliveries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- PARTOGRAPH DATA: Time-series cervical dilation monitoring
-- ============================================================
CREATE TABLE IF NOT EXISTS maternity_partograph (
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id UUID REFERENCES maternity_deliveries(id) ON DELETE CASCADE NOT NULL,

  recorded_at TIMESTAMPTZ NOT NULL,      -- every 30-60 min

  -- Cervical assessment
  cervical_dilation DECIMAL(4,1),        -- cm
  descent DECIMAL(4,1),                  -- station (-3 to +3)

  -- Contractions
  contractions_frequency INT,            -- per 10 minutes
  contractions_duration INT,             -- seconds

  -- Fetal monitoring
  fetal_heart_rate INT,

  -- Maternal vitals
  maternal_pulse INT,
  systolic_bp INT,
  diastolic_bp INT,
  temperature DECIMAL(5,2),

  -- Urine
  urine_volume INT,                      -- mL
  urine_ketones VARCHAR(20),             -- negative, trace, +1, +2, +3

  -- Interventions
  drugs_given TEXT,                      -- oxytocin_rate, pain_relief, eg "Oxytocin 2mU/min"

  -- Membrane & moulding status
  membranes VARCHAR(20),                 -- intact, ruptured, artificially_ruptured
  moulding VARCHAR(10),                  -- none, +, ++, +++
  caput VARCHAR(10),                     -- none, +, ++, +++

  notes TEXT,
  recorded_by UUID REFERENCES staff_users(id),

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- NEWBORNS: Supports twins, triplets
-- ============================================================
CREATE TABLE IF NOT EXISTS maternity_newborns (
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id UUID REFERENCES maternity_deliveries(id) ON DELETE CASCADE NOT NULL,

  baby_number INT DEFAULT 1,             -- 1, 2, 3 for multiples
  baby_name VARCHAR(255),
  baby_sex VARCHAR(10),

  -- Anthropometrics
  birth_weight DECIMAL(5,2),             -- kg
  birth_length DECIMAL(5,2),             -- cm
  head_circumference DECIMAL(5,2),       -- cm

  -- APGAR scores
  apgar_1min INT,
  apgar_5min INT,
  apgar_10min INT,

  -- Resuscitation
  resuscitation VARCHAR(100),            -- none, oxygen, bag_mask, intubation
  delivery_to_cry_seconds INT,

  -- Immediate care
  vitamin_k_given BOOLEAN DEFAULT false,
  immunizations_given TEXT,              -- BCG, OPV, HepB

  -- Abnormalities
  congenital_anomalies TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  is_synced BOOLEAN DEFAULT false,
  last_synced_at TIMESTAMPTZ
);

CREATE TRIGGER update_maternity_newborns_updated_at
  BEFORE UPDATE ON maternity_newborns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

### 3.4 `026_maternity_postnatal.sql`

```sql
-- ============================================================
-- POSTNATAL VISITS: Mother follow-up after delivery/discharge
-- ============================================================
CREATE TABLE IF NOT EXISTS postnatal_visits (
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id UUID REFERENCES maternity_deliveries(id) ON DELETE CASCADE NOT NULL,

  visit_date DATE NOT NULL,
  visit_number INT NOT NULL,

  -- Uterine involution
  fundal_height_cm DECIMAL(5,2),

  -- Lochia
  lochia VARCHAR(100),                   -- rubra/serosa/alba + scant/moderate/heavy

  -- Maternal vitals
  systolic_bp INT,
  diastolic_bp INT,
  pulse INT,
  temperature DECIMAL(5,2),

  -- Breastfeeding
  breastfeeding_status VARCHAR(50),      -- exclusive, mixed, not_established
  breast_engorged BOOLEAN DEFAULT false,
  breast_mastitis BOOLEAN DEFAULT false,

  -- Wound assessment
  perineal_wound VARCHAR(50),            -- healing, infected, dehiscence, N_A
  c_section_wound VARCHAR(50),           -- healing, infected, dehiscence, N_A

  -- Family planning
  family_planning_discussed BOOLEAN DEFAULT false,
  family_planning_method VARCHAR(100),

  complications TEXT,
  notes TEXT,

  staff_id UUID REFERENCES staff_users(id),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  is_synced BOOLEAN DEFAULT false,
  last_synced_at TIMESTAMPTZ
);

CREATE TRIGGER update_postnatal_visits_updated_at
  BEFORE UPDATE ON postnatal_visits
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

### 3.5 Vitals Table Enhancement (`027_vitals_maternity_fields.sql`)

```sql
-- Additional maternity fields in the vitals table
ALTER TABLE vitals
  ADD COLUMN IF NOT EXISTS fundal_height DECIMAL(5,2),
  ADD COLUMN IF NOT EXISTS fetal_presentation VARCHAR(50),
  ADD COLUMN IF NOT EXISTS urine_protein VARCHAR(20),
  ADD COLUMN IF NOT EXISTS urine_glucose VARCHAR(20),
  ADD COLUMN IF NOT EXISTS hemoglobin DECIMAL(5,2),
  ADD COLUMN IF NOT EXISTS pcv DECIMAL(5,2),
  ADD COLUMN IF NOT EXISTS gestational_age_weeks INT,
  ADD COLUMN IF NOT EXISTS tt_dose VARCHAR(20);
```

---

## 4. Server API Endpoints

### 4.1 Route File

Create `server/src/routes/maternity.ts` following the pattern of `admissions.ts` and `nurseModule.ts`.

### 4.2 Endpoint Reference

#### Maternity Patients

| Endpoint | Method | Purpose | Auth |
|---|---|---|---|
| `/api/maternity-patients` | GET | List all maternity patients with patient join. Filters: `status`, `search` (patient name/HN), `edd_before`, `edd_after` | All roles |
| `/api/maternity-patients` | POST | Book pregnancy. Body: `{ patient_id, lmp, edd, gravida, para, blood_group, genotype, hiv_status, risk_factors }`. Validates: patient exists, is female, no active record | Doctor, Nurse, Records, Admin |
| `/api/maternity-patients/:id` | GET | Single record with patient info, ANC visit count, delivery status, latest vitals data | All roles |
| `/api/maternity-patients/:id` | PUT | Update pregnancy profile | Doctor, Nurse, Admin |
| `/api/maternity-patients/:id` | DELETE | Soft-delete/cancel pregnancy booking | Admin only |
| `/api/maternity-patients/stats` | GET | Stats: active count, deliveries today, due this week/month, overdue ANC visits | Doctor, Nurse, Admin |

#### Antenatal Visits

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/antenatal-visits` | GET | List visits. Filters: `maternity_patient_id`, `date_from`, `date_to`. Returns with staff name JOIN | Doctor, Nurse, Admin |
| `/api/antenatal-visits` | POST | Record ANC visit. Body: full visit payload. Auto-calculates visit_number, gestational_age. Optionally creates a vitals record as side effect | Doctor, Nurse, Admin |
| `/api/antenatal-visits/:id` | PUT | Edit visit (10-min window audit, same as vitals pattern) | Doctor, Nurse, Admin |

#### Labour & Delivery

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/maternity-deliveries` | GET | List deliveries. Filters: `date_from`, `date_to`, `status`, `outcome`, `maternity_patient_id` | Doctor, Nurse, Admin |
| `/api/maternity-deliveries` | POST | Create delivery record. Sets maternity_patient.status → 'delivered' | Doctor, Nurse, Admin |
| `/api/maternity-deliveries/:id` | GET | Full record with partograph entries + newborns | Doctor, Nurse, Admin |
| `/api/maternity-deliveries/:id` | PUT | Update delivery record | Doctor, Nurse, Admin |

#### Partograph

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/maternity-partograph` | GET | List by `delivery_id`, ordered by recorded_at ASC | Doctor, Nurse, Admin |
| `/api/maternity-partograph` | POST | Record partograph entry (single time-slice) | Doctor, Nurse, Admin |
| `/api/maternity-partograph/:id` | PUT | Edit partograph entry | Doctor, Nurse, Admin |
| `/api/maternity-partograph/:id` | DELETE | Remove erroneous entry | Admin only |

#### Newborns

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/maternity-newborns` | POST | Add newborn to delivery. Body: `{ delivery_id, baby_name, baby_sex, birth_weight, apgar_1min, ... }` | Doctor, Nurse, Admin |
| `/api/maternity-newborns/:id` | PUT | Update newborn data | Doctor, Nurse, Admin |
| `/api/maternity-newborns/:id` | DELETE | Remove newborn record | Admin only |

#### Postnatal

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/postnatal-visits` | GET | List by `delivery_id` or `maternity_patient_id` | Doctor, Nurse, Admin |
| `/api/postnatal-visits` | POST | Record postnatal visit | Doctor, Nurse, Admin |
| `/api/postnatal-visits/:id` | PUT | Edit postnatal visit | Doctor, Nurse, Admin |

#### Vitals (Enhanced)

| Endpoint | Change |
|---|---|
| `POST /api/vitals` | Now accepts: `fundal_height`, `fetal_presentation`, `urine_protein`, `urine_glucose`, `hemoglobin`, `pcv`, `gestational_age_weeks`, `tt_dose` |
| `GET /api/vitals/recent/:patientId` | Returns new fields in response |


### 4.3 Server Registration

In `server/src/server.ts`:
```typescript
import maternityRouter from './routes/maternity'
app.use(maternityRouter)
```

### 4.4 Key Server Patterns

All endpoints follow existing conventions:
- `getTenantId()` for tenant isolation
- Parameterized queries (`$1`, `$2`, ...)
- `COALESCE(is_paid, false) = false` for payment checks
- Error responses: `{ error: true, message: string }`
- Staff attribution via `staff_id` from authenticated user

Example route skeleton:
```typescript
router.get('/api/maternity-patients', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId()
    const { status, search } = req.query
    let query = `
      SELECT mp.*, p.full_name, p.hospital_number, p.dob, p.phone, p.sex,
        (SELECT COUNT(*) FROM antenatal_visits WHERE maternity_patient_id = mp.id) as visit_count
      FROM maternity_patients mp
      JOIN patients p ON p.id = mp.patient_id
      WHERE mp.tenant_id = $1
    `
    const params: any[] = [tenantId]
    let paramIndex = 2
    if (status) { query += ` AND mp.status = $${paramIndex++}`; params.push(status) }
    if (search) { query += ` AND (p.full_name ILIKE $${paramIndex} OR p.hospital_number ILIKE $${paramIndex})`; params.push(`%${search}%`); paramIndex++ }
    query += ` ORDER BY mp.created_at DESC`
    const result = await pool.query(query, params)
    res.json(result.rows)
  } catch (err) {
    res.status(500).json({ error: true, message: (err as Error).message })
  }
})
```

---

## 5. Client Pages & Components

### 5.1 Component Map

| Component | Route | Lines (est.) | Description |
|---|---|---|---|
| `MaternityDashboard` | `/maternity` | ~200 | Stats cards, quick action grid, recent activity |
| `MaternityPatientList` | `/maternity/patients` | ~350 | Searchable/filterable patient table with status badges |
| `MaternityPatientDetail` | `/maternity/patients/:id` | ~600 | Tabbed view: Profile, ANC Visits, Delivery, Postnatal |
| `MaternityANCWorklist` | `/maternity/anc` | ~300 | Worklist of upcoming ANC + record visit modal |
| `MaternityLabourWard` | `/maternity/labour` | ~700 | Active labours list, partograph chart, delivery form, newborn form |
| `MaternityPostnatalWard` | `/maternity/postnatal` | ~300 | Postnatal patient list + visit recording |

### 5.2 MaternityDashboard (`/maternity`)

**Stats cards (top row):**
- Active Pregnancies (count)
- Deliveries This Month (count)
- Due This Week (count, amber accent)
- Overdue for ANC Visit (count, red accent if > 0)

**Quick action cards (grid, 2x2 or 3x2):**
- Book Pregnancy (navigates to patient selector modal)
- Record ANC Visit (navigates to patient search → visit modal)
- Labour & Delivery (navigates to `/maternity/labour`)
- Postnatal Care (navigates to `/maternity/postnatal`)
- Appointment Reminders (list of due EDDs/next appointments)

**Recent activity list:**
- Last 10 events (bookings, visits, deliveries) with timestamps and staff names
- Paginated

**Records role:** sees simplified view — stats + booking button + patient list link. No clinical quick actions.

### 5.3 MaternityPatientList (`/maternity/patients`)

**Search bar**: search by patient name, hospital number, phone

**Filters:**
- Status: All, Active, Delivered, Transferred
- Risk Level: All, Low, High
- EDD: This Week, This Month, Next Month, Overdue

**Table columns:**
| Column | Notes |
|---|---|
| Patient Name | Linked to patient detail page |
| Hospital # | Clickable |
| Age | Calculated from DOB |
| EDD | Days remaining shown as badge (green/yellow/red) |
| Gest. Age | Weeks at last visit |
| Gravida/Para | Displayed as "G2 P1" |
| Risk Level | Badge: green (low), red (high) |
| Status | Badge: blue (active), green (delivered), gray (transferred) |
| Last Visit | Date of most recent ANC visit |
| Action | "View" button → patient detail |

**Pagination**: 20 per page

**Records role:** sees same table + "Book Pregnancy" button. Clicking a patient opens read-only detail.

### 5.4 MaternityPatientDetail (`/maternity/patients/:id`)

**Header:**
- Patient name, hospital number, age
- Pregnancy status badge (Active/Delivered)
- "Book Pregnancy" / "Edit Profile" button (role-dependent)

**Tabs:**

#### Tab 1 — Profile
Displays full pregnancy data card:
- LMP, EDD, Gestational age at booking
- Gravida, Para, Living children
- Blood group, Genotype, Rh factor
- HIV status, HBV status
- Risk level + risk factors
- Booked by + date
- **Edit button** (Doctor/Nurse/Admin) — opens edit modal with all fields

#### Tab 2 — ANC Visits
- **"Record ANC Visit" button** (Doctor/Nurse/Admin)
- Visit timeline (newest first), each card shows:
  - Visit #, date, gestational age
  - Weight, BP, Fundal height, Fetal presentation, FHR
  - Urine protein/glucose, Hb, PCV
  - TT dose, iron/folate given
  - Next appointment date
  - Staff name
  - Click card → full detail modal
- Pagination (15 per page)

#### Tab 3 — Labour & Delivery
- If pregnancy is active:
  - "Admit for Labour" button → opens labour admission modal
  - Shows message: "No delivery record yet"
- If delivered:
  - Delivery card: date, type, place, perineum, placenta, blood loss, outcome
  - Partograph link (if recorded)
  - Newborns listed as sub-cards with baby name, sex, weight, APGAR
  - Click newborn card → detail modal

#### Tab 4 — Postnatal
- Only visible if delivered
- List of postnatal visits (newest first)
- "Record Postnatal Visit" button

### 5.5 MaternityANCWorklist (`/maternity/anc`)

**Two sub-tabs:**

#### Upcoming (default)
- List of patients whose `next_appointment_date` is today or future
- Columns: Patient name, EDD, last visit date, next appointment date, days overdue (if past)
- "Record Visit" button per row → opens ANC Visit modal

#### History
- All past ANC visits across all patients
- Searchable by patient name, date range
- Click → visit detail modal

**Record ANC Visit Modal** (shared component):
```
┌─────────────────────────────────────┐
│  Record ANC Visit — Patient Name    │
│  Visit #3 · Gestational Age: 24 wks │
├─────────────────────────────────────┤
│ Visit Date: [___]                   │
│ Weight (kg): [___]                  │
│ BP: [___] / [___]                   │
│ Fundal Height (cm): [___]           │
│ Fetal Presentation: [cephalic ▼]    │
│ Fetal Heart Rate: [___]             │
│ Fetal Heart Sound: [normal ▼]       │
│ Urine Protein: [negative ▼]         │
│ Urine Glucose: [negative ▼]         │
│ Hemoglobin (g/dL): [___]            │
│ PCV (%): [___]                      │
│ TT Dose: [completed ▼]              │
│ Iron/Folate Given: [x]              │
│ Next Appointment: [___]             │
│ Notes: [textarea]                   │
│                                      │
│ [Cancel]           [Save & Submit]   │
└─────────────────────────────────────┘
```

### 5.6 MaternityLabourWard (`/maternity/labour`)

This is the most complex page — equivalent to Lab Workbench for maternity.

#### Tab 1 — Active Labours
- List of patients currently in labour (delivery status = 'active')
- Cards show: patient name, admitted at, labour duration, cervical dilation (latest partograph), FH
- "Partograph" button → opens partograph panel
- "Record Delivery" button → opens delivery form

#### Tab 2 — Partograph (inline viewer for one patient)
```
┌─────────────────────────────────────────────────────────────┐
│                    PARTOGRAPH — Patient Name                 │
│  Admitted: 02-Jul-2026 08:00  |  Labour duration: 4h 30min  │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Cervix (cm)                                                 │
│  10 ┤                                                       │
│   9 ┤                    X  (action line)                    │
│   8 ┤              X  X───(alert line)                       │
│   7 ┤        X  X───                                        │
│   6 ┤  X  X───                                               │
│   5 ┤───                                                     │
│   4 ┤                                                        │
│   3 ┤                                                        │
│   2 ┤                                                        │
│   1 ┤                                                        │
│   0 └───┬───┬───┬───┬───┬───┬───┬───┬───┬───┬───┬───┬───    │
│        0   1   2   3   4   5   6   7   8   9  10  11  12      │
│                                                              │
│  Descent                                                     │
│  +3 ┤                                                        │
│  +2 ┤                                              X         │
│  +1 ┤                                         X              │
│   0 ┤                                   X  X                 │
│  -1 ┤                             X  X                       │
│  -2 ┤                       X  X                             │
│  -3 ┤                 X  X                                   │
│      └───┬───┬───┬───┬───┬───┬───┬───┬───┬───┬───┬───┬───    │
│        0   1   2   3   4   5   6   7   8   9  10  11  12      │
│                                                              │
│  + Add Entry  [Time: 12:30] [Cx: [7.0]] [Desc: [-0.5]] [+] │
│                                                              │
│  Recent entries:                                              │
│  │ 12:30 │ Cx 7.0 │ Desc -0.5 │ FH 140 │ Cont 3/10min 45s │ │
│  │ 12:00 │ Cx 6.0 │ Desc -1.0 │ FH 138 │ Cont 3/10min 40s │ │
│  │ 11:30 │ Cx 5.0 │ Desc -1.5 │ FH 142 │ Cont 2/10min 35s │ │
│                                                              │
│  [Record Delivery →]                                          │
└─────────────────────────────────────────────────────────────┘
```

**Visual partograph requirements:**
- Canvas/SVG-based chart plotting cervical dilation (cm) over time
- Alert line (slope of 1cm/hour starting at 4cm)
- Action line (parallel, 4 hours after alert line)
- Descent plotted separately
- Grid lines for each hour
- Warning color when crossing alert/action lines

#### Tab 3 — Delivery Form
Opens after clicking "Record Delivery":
```
┌─────────────────────────────────────┐
│       Record Delivery               │
├─────────────────────────────────────┤
│ Delivery Date: [___]                │
│ Delivery Time: [___]                │
│ Delivery Type: [SVD ▼]             │
│ Delivery Place: [labour_ward ▼]     │
│ Perineum: [intact ▼]               │
│ Placenta: [complete ▼]             │
│ Placenta Delivery Time: [___]       │
│ Blood Loss (mL): [___]              │
│ Oxytocin Given: [x]                 │
│ Complication: [none ▼]              │
│ Complication Notes: [textarea]      │
│ Outcome: [live_birth ▼]            │
│ Overall Notes: [textarea]           │
├─────────────────────────────────────┤
│          NEWBORN #1                  │
│ Baby Name: [___]                    │
│ Sex: [Male ▼] Weight (kg): [___]   │
│ Length (cm): [___]                  │
│ Head Circ (cm): [___]               │
│ APGAR 1min: [___] 5min: [___]      │
│ APGAR 10min: [___]                  │
│ Resuscitation: [none ▼]             │
│ Vitamin K Given: [x]                │
│ Immunizations: [BCG, OPV]          │
│ Anomalies: [textarea]               │
│                                      │
│ [+ Add Newborn (for twins)]         │
│                                      │
│ [Cancel]           [Save Delivery]   │
└─────────────────────────────────────┘
```

#### Tab 4 — History
- All past deliveries (searchable, date-filtered)
- Click → detail modal with full record

### 5.7 MaternityPostnatalWard (`/maternity/postnatal`)

**Patient list:**
- All patients with status = 'delivered', sorted by delivery date (newest first)
- Search by patient name/HN
- Filter by days since delivery (0-7 days, 8-14 days, 15-42 days)

**Per patient:**
- Patient info + delivery summary card
- "Record Postnatal Visit" button
- Visit timeline (newest first)

**Postnatal Visit Modal:**
```
┌─────────────────────────────────────┐
│  Record Postnatal Visit             │
├─────────────────────────────────────┤
│ Visit Date: [___]                   │
│ Visit #: [auto]                     │
│ Fundal Height (cm): [___]           │
│ Lochia: [rubra_moderate ▼]          │
│ BP: [___] / [___]                   │
│ Pulse: [___]  Temp: [___]           │
│ Breastfeeding: [exclusive ▼]        │
│ Breast Engorged: [ ]                │
│ Mastitis: [ ]                       │
│ Perineal Wound: [healing ▼]         │
│ C-Section Wound: [N_A ▼]            │
│ FP Discussed: [x]                   │
│ FP Method: [condom ▼] if yes        │
│ Complications: [textarea]            │
│ Notes: [textarea]                    │
│                                      │
│ [Cancel]           [Save]            │
└─────────────────────────────────────┘
```

---

## 6. Patient Chart Integration

### 6.1 New Tab in PatientChart.tsx

Add to the `sections` array:

```typescript
const sections = [
  { id: 'summary', label: 'Summary', icon: FileText },
  { id: 'vitals', label: `Vitals (${vitalsList.length})`, icon: Activity },
  // ... existing sections ...
  { id: 'maternity', label: maternityRecord ? 'Maternity' : 'Maternity', icon: Baby },
  // ... rest of sections ...
]
```

The maternity icon `Baby` needs to be added to the `lucide-react` import in PatientChart.tsx.

### 6.2 Conditional Rendering

```tsx
{activeSection === 'maternity' && (
  <div className="space-y-4">
    {maternityRecord ? (
      <>
        {/* Profile Card */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-800">Pregnancy Profile</h3>
            {(isDoctor || isNurse) && (
              <button onClick={openEditProfile} className="text-sm text-primary">Edit</button>
            )}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div><span className="text-slate-400">EDD</span><p className="font-medium">{maternityRecord.edd?.slice(0,10)}</p></div>
            <div><span className="text-slate-400">Gest. Age</span><p className="font-medium">{gestationalAge} weeks</p></div>
            <div><span className="text-slate-400">Gravida/Para</span><p className="font-medium">G{maternityRecord.gravida} P{maternityRecord.para}</p></div>
            <div><span className="text-slate-400">Risk</span>
              <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${maternityRecord.risk_level === 'high' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                {maternityRecord.risk_level}
              </span>
            </div>
          </div>
        </div>

        {/* ANC Visits */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-800">ANC Visits</h3>
            {(isDoctor || isNurse) && (
              <button onClick={openANCVisitModal} className="text-sm text-primary font-medium hover:underline">+ Record Visit</button>
            )}
          </div>
          {ancVisits.length === 0 ? (
            <p className="text-sm text-slate-400">No ANC visits recorded yet</p>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {ancVisits.slice(0, 5).map((v: any) => (
                <div key={v.id} className="flex items-center justify-between p-2 bg-slate-50 rounded-xl text-sm cursor-pointer hover:bg-slate-100"
                     onClick={() => openVisitDetail(v)}>
                  <div>
                    <span className="font-medium">Visit #{v.visit_number}</span>
                    <span className="text-slate-400 ml-2">{v.visit_date?.slice(0,10)}</span>
                  </div>
                  <div className="text-slate-500 text-xs">
                    FH: {v.fundal_height}cm · FHR: {v.fetal_heart_rate} · GA: {v.gestational_age_weeks}w
                  </div>
                </div>
              ))}
              {ancVisits.length > 5 && (
                <p className="text-xs text-primary text-center cursor-pointer">View all {ancVisits.length} visits →</p>
              )}
            </div>
          )}
        </div>

        {/* Labour & Delivery */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-800">Labour & Delivery</h3>
            {maternityRecord.status === 'active' && (isDoctor || isNurse) && (
              <button onClick={openLabourAdmission} className="text-sm text-primary font-medium hover:underline">+ Admit for Labour</button>
            )}
          </div>
          {deliveryRecord ? (
            <div className="text-sm space-y-1">
              <p><span className="text-slate-400">Delivery:</span> {deliveryRecord.delivery_date?.slice(0,10)} · {deliveryRecord.delivery_type}</p>
              <p><span className="text-slate-400">Outcome:</span> {deliveryRecord.outcome}</p>
              {newborns.map((nb: any) => (
                <p key={nb.id}><span className="text-slate-400">Baby:</span> {nb.baby_name || `Baby #${nb.baby_number}`} · {nb.birth_weight}kg · APGAR {nb.apgar_1min}/{nb.apgar_5min}</p>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400">Not yet delivered</p>
          )}
        </div>

        {/* Postnatal */}
        {deliveryRecord && (
          <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-800">Postnatal</h3>
              {(isDoctor || isNurse) && (
                <button onClick={openPostnatalModal} className="text-sm text-primary font-medium hover:underline">+ Record Visit</button>
              )}
            </div>
            {postnatalVisits.length === 0 ? (
              <p className="text-sm text-slate-400">No postnatal visits recorded</p>
            ) : (
              <div className="space-y-1 text-sm">
                {postnatalVisits.map((pv: any) => (
                  <p key={pv.id}>Visit #{pv.visit_number}: {pv.visit_date?.slice(0,10)} · Lochia: {pv.lochia} · BF: {pv.breastfeeding_status}</p>
                ))}
              </div>
            )}
          </div>
        )}
      </>
    ) : (
      /* No pregnancy record */
      <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
        <Baby className="w-12 h-12 text-slate-300 mx-auto mb-3" />
        <p className="text-slate-500 mb-4">No pregnancy record found for this patient</p>
        {patient.sex === 'Female' && (isDoctor || isNurse || isRecords || isAdmin) && (
          <button onClick={openBookingModal}
            className="px-6 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:scale-[1.01]">
            Book Pregnancy
          </button>
        )}
        {patient.sex !== 'Female' && (
          <p className="text-xs text-slate-400">Maternity module is only available for female patients</p>
        )}
      </div>
    )}
  </div>
)}
```

### 6.3 Records Role in Chart Tab

Records sees the Maternity tab with:
- Same pregnancy profile card (read-only, no Edit button)
- Same ANC visit list (no Record Visit button)
- Same delivery/postnatal sections (read-only)
- "Book Pregnancy" button visible (Records can book)

---

## 7. Nurse Vitals Enhancement

### 7.1 Maternity Section in Vitals Forms

All four vitals forms get an expandable **"Maternity Vitals"** section:

Files to modify:
- `PatientChart.tsx` — Record Vitals modal
- `TriageStation.tsx` — Vitals form
- `MyPatients.tsx` — Vitals modal
- `DoctorVitals.tsx` — Record Vitals modal

Implementation pattern (add to each form's state and payload):

```tsx
const [showMaternityVitals, setShowMaternityVitals] = useState(false)

// In the form, after existing vitals fields:
{patient?.sex === 'Female' && (
  <div className="border-t border-slate-200 pt-4 mt-4">
    <button
      type="button"
      onClick={() => setShowMaternityVitals(!showMaternityVitals)}
      className="flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-800"
    >
      <ChevronDown className={`w-4 h-4 transition-transform ${showMaternityVitals ? 'rotate-0' : '-rotate-90'}`} />
      Maternity Vitals
    </button>
    {showMaternityVitals && (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
        <div>
          <label className="block text-xs text-slate-400 mb-1">Fundal Height (cm)</label>
          <input type="number" step="0.1" value={form.fundal_height || ''}
            onChange={e => setForm({...form, fundal_height: e.target.value})}
            className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Fetal Presentation</label>
          <select value={form.fetal_presentation || ''}
            onChange={e => setForm({...form, fetal_presentation: e.target.value})}
            className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white">
            <option value="">Select</option>
            <option value="cephalic">Cephalic</option>
            <option value="breech">Breech</option>
            <option value="transverse">Transverse</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Fetal Heart Rate</label>
          <input type="number" value={form.fetal_heart_rate || ''}
            onChange={e => setForm({...form, fetal_heart_rate: e.target.value})}
            className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Fetal Heart Sound</label>
          <input type="text" value={form.fetal_heart_sound || ''}
            onChange={e => setForm({...form, fetal_heart_sound: e.target.value})}
            className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
            placeholder="Normal / Muffled / Absent" />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Urine Protein</label>
          <select value={form.urine_protein || ''}
            onChange={e => setForm({...form, urine_protein: e.target.value})}
            className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white">
            <option value="">Select</option>
            <option value="negative">Negative</option>
            <option value="trace">Trace</option>
            <option value="+1">+1</option>
            <option value="+2">+2</option>
            <option value="+3">+3</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Urine Glucose</label>
          <select value={form.urine_glucose || ''}
            onChange={e => setForm({...form, urine_glucose: e.target.value})}
            className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white">
            <option value="">Select</option>
            <option value="negative">Negative</option>
            <option value="trace">Trace</option>
            <option value="+1">+1</option>
            <option value="+2">+2</option>
            <option value="+3">+3</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Hemoglobin (g/dL)</label>
          <input type="number" step="0.1" value={form.hemoglobin || ''}
            onChange={e => setForm({...form, hemoglobin: e.target.value})}
            className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">TT Dose</label>
          <select value={form.tt_dose || ''}
            onChange={e => setForm({...form, tt_dose: e.target.value})}
            className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white">
            <option value="">Select</option>
            <option value="1">Dose 1</option>
            <option value="2">Dose 2</option>
            <option value="3">Dose 3</option>
            <option value="4">Dose 4</option>
            <option value="5">Dose 5</option>
            <option value="completed">Completed</option>
          </select>
        </div>
      </div>
    )}
  </div>
)}
```

### 7.2 Vitals Display Enhancement

Vitals cards in PatientChart and other views show maternity fields when present:

```tsx
{vitals.fundal_height && (
  <div className="flex items-center gap-1 text-xs bg-purple-50 px-2 py-1 rounded-lg">
    <span className="text-purple-500">FH:</span>
    <span className="font-medium">{vitals.fundal_height}cm</span>
  </div>
)}
{vitals.fetal_heart_rate && (
  <div className="flex items-center gap-1 text-xs bg-pink-50 px-2 py-1 rounded-lg">
    <span className="text-pink-500">FHR:</span>
    <span className="font-medium">{vitals.fetal_heart_rate}</span>
  </div>
)}
```

---

## 8. Doctor Consultation Integration

### 8.1 Maternity Info Banner

In `DoctorConsultation.tsx`, after the patient header, add a conditional banner:

```tsx
{/* Maternity Banner */}
{maternityRecord && maternityRecord.status === 'active' && (
  <div className="bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 rounded-2xl p-4">
    <div className="flex items-start gap-3 flex-wrap">
      <Baby className="w-5 h-5 text-purple-500 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-purple-800">Antenatal Patient</p>
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs text-purple-700">
          <span>EDD: {maternityRecord.edd?.slice(0,10)}</span>
          <span>Gest. Age: {gestationalAge} weeks</span>
          <span>G{maternityRecord.gravida} P{maternityRecord.para}</span>
          <span className={`px-2 py-0.5 rounded-full font-medium ${
            maternityRecord.risk_level === 'high'
              ? 'bg-red-100 text-red-700'
              : 'bg-green-100 text-green-700'
          }`}>{maternityRecord.risk_level} risk</span>
          {lastANCVisit && <span>Last ANC: {lastANCVisit.visit_date?.slice(0,10)}</span>}
        </div>
      </div>
      <button onClick={() => navigate(`/maternity/patients/${maternityRecord.id}`)}
        className="flex-shrink-0 px-3 py-1.5 text-xs font-medium text-purple-700 bg-white border border-purple-200 rounded-xl hover:bg-purple-50">
        View Full Chart
      </button>
    </div>
  </div>
)}
```

### 8.2 Data Fetching

In consultation page, fetch maternity data alongside other patient data:

```typescript
// In useEffect or parallel fetch
const [maternityRecord, setMaternityRecord] = useState<any>(null)
const [lastANCVisit, setLastANCVisit] = useState<any>(null)

useEffect(() => {
  if (!patientId) return
  const fetchMaternity = async () => {
    try {
      const res = await fetch(`/api/maternity-patients?patient_id=${patientId}`, {
        headers: { 'x-master-token': 'sretan-emr-master-token-2026' }
      })
      const records = await res.json()
      if (Array.isArray(records) && records.length > 0) {
        const rec = records[0]
        setMaternityRecord(rec)
        // Fetch latest ANC visit
        const ancRes = await fetch(`/api/antenatal-visits?maternity_patient_id=${rec.id}&limit=1`, {
          headers: { 'x-master-token': 'sretan-emr-master-token-2026' }
        })
        const ancData = await ancRes.json()
        if (Array.isArray(ancData) && ancData.length > 0) {
          setLastANCVisit(ancData[0])
        }
      }
    } catch {}
  }
  fetchMaternity()
}, [patientId])
```

---

## 9. Workflows

### 9.1 Pregnancy Booking

```
Who: Records, Nurse, Doctor, Admin
Where: Maternity Dashboard → "Book Pregnancy", Patient Chart → "Book Pregnancy", Maternity Patient List → "Book"

Flow:
  1. Search/select patient from dropdown (auto-filters to female patients)
  2. Enter LMP → EDD auto-calculated (280 days from LMP) OR manual EDD input
  3. Enter obstetric history: gravida, para, living children
  4. Enter lab results: blood group, genotype, Rh factor, HIV/HBV status
  5. Assess risk level: low/high + risk factors text
  6. Submit → creates maternity_patients record with status='active'
  7. Patient's Patient Chart now shows Maternity tab
  8. Patient appears in Maternity Dashboard stats and Patient List
```

### 9.2 Recording an ANC Visit

```
Who: Nurse, Doctor
Where: Maternity patient detail → ANC tab, Patient Chart Maternity tab, Maternity ANC Worklist

Flow:
  1. Select patient (or already on patient's page)
  2. Click "Record ANC Visit"
  3. Modal pre-fills: visit_number (auto), gestational_age (calculated from EDD)
  4. Enter: weight, BP, fundal height, fetal presentation, FHR, FH sound
  5. Enter: urine protein, urine glucose, hemoglobin, PCV
  6. Enter: TT dose, iron/folate given checkbox
  7. Set next appointment date
  8. Add notes
  9. Submit → creates antenatal_visits record
  10. Optionally creates a vitals record in the vitals table (choosable)
```

### 9.3 Labour Admission → Partograph → Delivery

```
Who: Nurse, Doctor
Where: Maternity Labour & Delivery page, or Patient Chart → Maternity tab → "Admit for Labour"

Admission Flow:
  1. Click "Admit for Labour" on active pregnancy
  2. Modal: labour onset time, membrane status, admission time
  3. Submit → creates maternity_deliveries record (status='active') + admissions record (Maternity Ward)
  4. Patient appears in "Active Labours" list on Labour & Delivery page

Partograph Flow:
  5. Select patient from Active Labours list
  6. Click "Partograph" → opens partograph viewer
  7. Every 30-60 min: click "+ Add Entry"
  8. Enter: time, cervical dilation, descent, contractions (freq + duration), FHR
  9. Enter: maternal BP, pulse, temp
  10. Enter: urine volume/ketones, drugs given, membrane status, moulding
  11. Submit → plotted on partograph chart
  12. Alert line and action line shown for visual reference
  13. Warning if crossing action line

Delivery Flow:
  14. When delivery imminent: click "Record Delivery"
  15. Fill delivery form: type, place, perineum, placenta, blood loss, complications
  16. Outcome: live_birth, stillbirth, etc.
  17. Add newborn(s): name, sex, weight, length, head circumference, APGAR
  18. Immediate newborn care: resuscitation, vitamin K, immunizations
  19. Submit → delivery status='completed', maternity_patient status='delivered'
  20. Patient moves to "Delivered" list and appears in Postnatal
```

### 9.4 Postnatal Visit

```
Who: Nurse, Doctor
Where: Maternity Postnatal page, Patient Chart → Maternity tab

Flow:
  1. Select delivered patient
  2. Click "Record Postnatal Visit"
  3. Enter: visit date, fundal height, lochia assessment
  4. Enter: BP, pulse, temp
  5. Assess: breastfeeding status, breast engorgement/mastitis
  6. Assess: perineal wound, C-section wound
  7. Family planning discussion + method
  8. Add complications/notes
  9. Submit → creates postnatal_visits record
```

### 9.5 Nurse Vitals Recording (Routine)

```
Who: Nurse
Where: TriageStation, MyPatients, PatientChart, DoctorVitals — any vitals recording point

Flow:
  1. Select/open a female patient
  2. Record standard vitals (BP, pulse, temp, etc.)
  3. Expand "Maternity Vitals" section (appears when patient is female)
  4. Enter: fundal height, FH, presentation, urine protein/glucose, Hb
  5. Submit → vitals saved with maternity fields
  6. If patient has active maternity record: optionally auto-create a lightweight ANC visit record
```

---

## 10. Access by Role

| Feature | Records | Nurse | Doctor | Admin |
|---|---|---|---|---|
| **Sidebar** | | | | |
| Maternity Dashboard | ✓ | ✓ | ✓ | ✓ |
| Patients | ✓ | ✓ | ✓ | ✓ |
| ANC Visits | - | ✓ | ✓ | ✓ |
| Labour & Delivery | - | ✓ | ✓ | ✓ |
| Postnatal | - | ✓ | ✓ | ✓ |
| | | | | |
| **Actions** | | | | |
| Book Pregnancy | ✓ | ✓ | ✓ | ✓ |
| View Maternity Detail | ✓ (read-only) | ✓ | ✓ | ✓ |
| Record ANC Visit | - | ✓ | ✓ | ✓ |
| Edit ANC Visit | - | ✓ | ✓ | ✓ |
| Admit for Labour | - | ✓ | ✓ | ✓ |
| Record Partograph | - | ✓ | ✓ | ✓ |
| Record Delivery + Newborns | - | ✓ | ✓ | ✓ |
| Record Postnatal Visit | - | ✓ | ✓ | ✓ |
| Record Vitals w/ maternity fields | - | ✓ (Triage) | ✓ (Vitals page) | ✓ |
| Doctor Consultation banner | - | - | ✓ | - |
| Delete records | - | - | - | ✓ |
| | | | | |
| **Patient Chart Tab** | ✓ (read-only) | ✓ | ✓ | ✓ |
| **Maternity Patient Detail Page** | ✓ (read-only) | ✓ (full) | ✓ (full) | ✓ (full) |

---

## 11. Build Order

### Phase 1 — Pregnancy Booking & ANC (Steps 1-6)

| Step | Files | Description |
|---|---|---|
| 1 | `database/024_maternity_core.sql` | Create maternity_patients + antenatal_visits tables |
| 2 | `server/src/routes/maternity.ts` (part 1) | CRUD for maternity patients + ANC visits |
| 3 | `server/src/server.ts` | Register maternity router |
| 4 | `client/src/components/MaternityDashboard.tsx` | Dashboard with stats + quick actions |
| 5 | `client/src/components/MaternityPatientList.tsx` | Searchable patient table + Book Pregnancy button |
| 6 | `client/src/components/MaternityPatientDetail.tsx` | Tabbed detail: Profile + ANC Visits |
| — | `client/src/App.tsx` | Add sidebar links + routes (Maternity category) |

**Milestone:** Can book pregnancy + record/view ANC visits.

### Phase 2 — Chart & Vitals Integration (Steps 7-9)

| Step | Files | Description |
|---|---|---|
| 7 | `database/027_vitals_maternity_fields.sql` | Add fundal_height, fetal_presentation, urine_protein, urine_glucose, hemoglobin, pcv, gestational_age_weeks, tt_dose to vitals table |
| 8 | `client/src/components/PatientChart.tsx` | Add Maternity tab with profile card, visit list, delivery/postnatal sections |
| 9 | `PatientChart.tsx`, `TriageStation.tsx`, `MyPatients.tsx`, `DoctorVitals.tsx` | Add expandable "Maternity Vitals" section to all vitals forms |

**Milestone:** Maternity data visible in patient chart + nurses can record maternity vitals.

### Phase 3 — Doctor Integration (Step 10)

| Step | Files | Description |
|---|---|---|
| 10 | `DoctorConsultation.tsx` | Add maternity info banner with EDD, risk level, link to full chart |

**Milestone:** Doctors see pregnancy context during consultation.

### Phase 4 — Labour, Delivery, Partograph (Steps 11-13)

| Step | Files | Description |
|---|---|---|
| 11 | `database/025_maternity_labour.sql` | Create maternity_deliveries, maternity_partograph, maternity_newborns tables |
| 12 | `server/src/routes/maternity.ts` (part 2) | CRUD for deliveries, partograph entries, newborns |
| 13 | `client/src/components/MaternityLabourWard.tsx` | Active labours list, visual partograph chart, delivery form, newborn form |

**Milestone:** Full labour management with partograph + delivery recording.

### Phase 5 — Postnatal (Steps 14-15)

| Step | Files | Description |
|---|---|---|
| 14 | `database/026_maternity_postnatal.sql` | Create postnatal_visits table |
| 15 | `client/src/components/MaternityPostnatalWard.tsx` | Postnatal visit recording + history |

**Milestone:** Complete maternity lifecycle (booking → ANC → delivery → postnatal).

---

## 12. Integration Points

### 12.1 Admissions (Existing)

The `Maternity Ward` (`MAT`) already exists in the `wards` table. Labour admission creates an `admissions` record with `ward_id` matching the Maternity Ward. The `maternity_deliveries.admission_id` FK links the two.

### 12.2 Paypoint (Existing)

Maternity services already seeded in the general services inventory (`012_seed_radiology_general.sql`):

| Service | Price |
|---|---|
| Antenatal Care (Booking) | ₦15,000 |
| Antenatal Care (Follow-up) | ₦5,000 |
| Normal Delivery | ₦80,000 |
| Caesarean Section | ₦250,000 |
| Maternity Ward (Per Night) | ₦15,000 |

**Integration:**
- Pregnancy booking checks `folder_activated` (patient must pay registration fee)
- Labour admission can check if delivery fee is paid via paypoint
- Follow the same `is_paid` pattern: `maternity_deliveries` can have `is_paid` column if needed

### 12.3 Inventory (Existing)

Maternity-specific consumables (oxytocin, vitamin K, etc.) can be added to the `inventory_items` table with a `maternity` category, following the same multi-category pattern.

### 12.4 Lab Module (Existing)

ANC-related lab tests (blood group, genotype, HIV, Hb, urinalysis) already exist in `lab_test_catalog`. Doctors can order these through the standard lab order flow during consultation. The maternity profile can reference recent lab results.

### 12.5 Appointments (Existing)

ANC follow-up appointments can optionally be synced to the existing `appointments` table when `next_appointment_date` is set, so they appear in the patient's appointment calendar.

---

*End of Maternity Module Plan*

---

*End of Maternity Module Implementation Plan — July 2, 2026*
