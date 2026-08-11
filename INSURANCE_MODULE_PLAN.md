# Insurance / HMO Module — Design & Implementation Plan

## 1. Overview

Currently the system stores insurance information on the patient record (`insurance`, `insurance_type`, `insurance_sub_type`) but does **nothing** with it clinically or administratively. This plan adds a full Insurance/HMO module with:

- Separate login for insurance staff (per insurance provider)
- Insurance case management (per encounter/admission)
- Parallel service tracking (insurance staff can modify services without touching clinical records)
- HMO batch invoicing and payment tracking
- Role-based reporting

---

## 2. Database Schema — New Tables

### 2.1 `insurance_providers`

Stores registered HMOs/insurance companies.

```sql
CREATE TABLE insurance_providers (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  name VARCHAR(200) NOT NULL,          -- e.g. "NHIS", "Greenfield HMO", "Reliance HMO"
  code VARCHAR(50) UNIQUE NOT NULL,    -- e.g. "GPHMO", "RLHMO"
  contact_person VARCHAR(200),
  contact_phone VARCHAR(50),
  contact_email VARCHAR(200),
  address TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 2.2 `insurance_staff_users`

Insurance staff login table (separate from clinical `staff_users`).

```sql
CREATE TABLE insurance_staff_users (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  provider_id UUID REFERENCES insurance_providers(id),  -- NULL if access_scope = 'all'
  full_name VARCHAR(200) NOT NULL,
  email VARCHAR(200) UNIQUE NOT NULL,
  phone VARCHAR(50),
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'viewer',     -- 'admin', 'editor', 'viewer'
  access_scope VARCHAR(50) NOT NULL DEFAULT 'own',  -- 'own' or 'all'
  is_active BOOLEAN DEFAULT true,
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Roles:**
- `admin` — Full access: create cases, edit services, generate reports, manage staff
- `editor` — Can view and edit case services, cannot manage staff or generate reports
- `viewer` — Read-only access

**Access Scope:**
- `own` (default) — Staff only sees cases and data for their own HMO (`provider_id` must be set)
- `all` — Staff can see and manage cases across ALL insurance providers. Used for super-administrators, aggregators, or hospital-level insurance coordinators. `provider_id` can be NULL for these users.

### 2.3 `insurance_cases`

One case per patient-visit (admission or encounter) for insured patients. This is the core record that insurance staff work with.

```sql
CREATE TABLE insurance_cases (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  provider_id UUID REFERENCES insurance_providers(id),
  patient_id UUID REFERENCES patients(id),
  maternity_patient_id UUID REFERENCES maternity_patients(id) NULL,
  encounter_id UUID REFERENCES encounters(id) NULL,
  admission_id UUID REFERENCES admissions(id) NULL,
  case_number VARCHAR(100) UNIQUE NOT NULL,  -- e.g. "HMO-2026-00001"
  auth_code VARCHAR(100),                    -- HMO pre-authorization code
  status VARCHAR(50) DEFAULT 'active',       -- 'active', 'closed', 'disputed'
  coverage_start_date DATE,
  coverage_end_date DATE,
  total_billed DECIMAL(12,2) DEFAULT 0,
  total_paid DECIMAL(12,2) DEFAULT 0,
  co_pay_amount DECIMAL(12,2) DEFAULT 0,
  notes TEXT,
  created_by UUID REFERENCES insurance_staff_users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Case statuses:**
- `active` — Patient is currently under this insurance case
- `closed` — Case resolved, billing completed
- `disputed` — Billing discrepancy, under review
- `voided` — Case cancelled/voided (with reason)

**Additional columns (add via migration):**
```sql
ALTER TABLE insurance_cases ADD COLUMN IF NOT EXISTS co_pay_collected DECIMAL(12,2) DEFAULT 0;
ALTER TABLE insurance_cases ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ;
ALTER TABLE insurance_cases ADD COLUMN IF NOT EXISTS void_reason TEXT;
ALTER TABLE insurance_cases ADD COLUMN IF NOT EXISTS voided_by UUID REFERENCES insurance_staff_users(id);
ALTER TABLE insurance_cases ADD COLUMN IF NOT EXISTS auto_created BOOLEAN DEFAULT false;
```

### 2.4 `insurance_case_services`

Services added/modified by insurance staff. These are **parallel** to clinical orders — they do NOT affect lab/pharmacy/radiology processing. They exist solely for HMO billing and tracking.

```sql
CREATE TABLE insurance_case_services (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  case_id UUID REFERENCES insurance_cases(id) ON DELETE CASCADE,
  service_type VARCHAR(50) NOT NULL,     -- 'consultation', 'lab', 'radiology', 'pharmacy', 'admission', 'procedure', 'misc'
  service_name VARCHAR(300) NOT NULL,     -- e.g. "Malaria Rapid Test", "Amoxicillin 500mg"
  quantity INT DEFAULT 1,
  unit_price DECIMAL(10,2) DEFAULT 0,
  total_price DECIMAL(10,2) DEFAULT 0,
  clinical_order_id UUID NULL,           -- links to original clinical order if applicable
  added_by UUID REFERENCES insurance_staff_users(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Key principle:** When an insurance staff adds/modifies a service here, it does **NOT** update the clinical encounter, lab order, prescription, or patient chart. The clinical record stays as the doctor ordered. The insurance case services are the HMO's view of what was done/what they're billed for.

### 2.5 `insurance_invoices`

Monthly/periodic invoices sent to HMOs.

```sql
CREATE TABLE insurance_invoices (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  provider_id UUID REFERENCES insurance_providers(id),
  invoice_number VARCHAR(100) UNIQUE NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status VARCHAR(50) DEFAULT 'draft',    -- 'draft', 'sent', 'paid', 'disputed'
  total_amount DECIMAL(12,2) DEFAULT 0,
  paid_amount DECIMAL(12,2) DEFAULT 0,
  due_date DATE,
  generated_by UUID REFERENCES insurance_staff_users(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 2.6 `insurance_invoice_items`

Line items on invoices (aggregated from cases).

```sql
CREATE TABLE insurance_invoice_items (
  id UUID PRIMARY KEY,
  invoice_id UUID REFERENCES insurance_invoices(id) ON DELETE CASCADE,
  case_id UUID REFERENCES insurance_cases(id),
  service_type VARCHAR(50),
  description TEXT,
  quantity INT,
  unit_price DECIMAL(10,2),
  total_price DECIMAL(10,2)
);
```

### 2.7 `patient_insurance_policies`

Stores multiple insurance policies per patient (primary, secondary, tertiary).

```sql
CREATE TABLE patient_insurance_policies (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
  provider_id UUID REFERENCES insurance_providers(id),
  policy_number VARCHAR(100) NOT NULL,
  policy_holder_name VARCHAR(200),
  relationship_to_patient VARCHAR(50),   -- 'self', 'spouse', 'child', 'parent', 'other'
  coverage_type VARCHAR(50) DEFAULT 'primary',  -- 'primary', 'secondary', 'tertiary'
  is_active BOOLEAN DEFAULT true,
  start_date DATE,
  end_date DATE,
  co_pay_percentage DECIMAL(5,2) DEFAULT 0,   -- per-policy co-pay override
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 2.8 `insurance_auth_requests`

Authorization requests submitted to HMOs for pre-approval of services.

```sql
CREATE TABLE insurance_auth_requests (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  provider_id UUID REFERENCES insurance_providers(id),
  patient_id UUID REFERENCES patients(id),
  case_id UUID REFERENCES insurance_cases(id) NULL,  -- linked after case created
  request_number VARCHAR(100) UNIQUE NOT NULL,       -- e.g. "AUTH-2026-00001"
  status VARCHAR(50) DEFAULT 'requested',            -- 'requested', 'submitted_to_hmo', 'approved', 'denied', 'expired'
  auth_code VARCHAR(100) NULL,                       -- HMO-issued auth code (set on approval)
  requested_services TEXT,                            -- description of services needing auth
  estimated_amount DECIMAL(12,2),
  authorized_amount DECIMAL(12,2) NULL,
  clinical_justification TEXT,
  validity_start_date DATE NULL,
  validity_end_date DATE NULL,
  response_notes TEXT NULL,                           -- HMO's response/denial reason
  requested_by UUID REFERENCES insurance_staff_users(id),
  responded_by UUID REFERENCES insurance_staff_users(id) NULL,
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  responded_at TIMESTAMPTZ NULL
);
```

**Auth statuses:**
- `requested` — Initial state, pending internal review
- `submitted_to_hmo` — Sent to HMO for approval
- `approved` — HMO approved with auth_code and authorized_amount
- `partial` — HMO approved some services only
- `denied` — HMO denied with reason
- `expired` — Auth code validity period has passed

### 2.9 `insurance_provider_co_pay_config`

Per-provider co-pay configuration (instead of storing in provider settings table).

```sql
CREATE TABLE insurance_provider_co_pay_config (
  id UUID PRIMARY KEY,
  provider_id UUID REFERENCES insurance_providers(id) ON DELETE CASCADE,
  calculation_method VARCHAR(50) NOT NULL DEFAULT 'percentage',  -- 'percentage', 'fixed_per_visit', 'fixed_per_service', 'tiered', 'none'
  percentage_value DECIMAL(5,2) DEFAULT 0,      -- used when method = 'percentage'
  fixed_amount DECIMAL(10,2) DEFAULT 0,          -- used when method = 'fixed_per_visit' or 'fixed_per_service'
  is_active BOOLEAN DEFAULT true,
  updated_by UUID REFERENCES insurance_staff_users(id),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 2.10 `insurance_excluded_services`

Services excluded from insurance coverage (patient pays 100%).

```sql
CREATE TABLE insurance_excluded_services (
  id UUID PRIMARY KEY,
  provider_id UUID REFERENCES insurance_providers(id) ON DELETE CASCADE,
  service_type VARCHAR(50) NOT NULL,
  service_name VARCHAR(300) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 3. Patient Registration — Insurance Fields

### 3.1 Existing `patients` Table — New Column

Add a column to store the patient's unique insurance membership/national ID number (e.g. NHIS number, HMO member ID, provider-specific card number).

```sql
ALTER TABLE patients ADD COLUMN IF NOT EXISTS patient_insurance_id VARCHAR(100);
```

This allows:
- Patients to be uniquely identified by their insurance ID across the system
- Insurance staff to look up patients by their insurance membership number
- Cross-referencing with HMO databases

### 3.2 Registration Form Changes

When `insurance` field is set to any value (Private, HMO, NHIA, Retainership, Other), a new field appears:

- **Patient Insurance ID** — `<input type="text">` — the patient's membership/national ID number issued by their insurance provider
  - Example: NHIS No: `NHIS-123456789`, Greenfield HMO ID: `GPH-78901`
  - Stored in `patients.patient_insurance_id`
  - Searchable from the insurance module

The existing `insurance`, `insurance_type`, `insurance_sub_type` fields remain unchanged — they store the provider name and plan type. The new `patient_insurance_id` stores the **patient's personal ID** within that insurance scheme.

### 3.3 Provider Unique Code

Each `insurance_providers` record has a unique `code` (e.g. `GPHMO` for Greenfield HMO, `NHIS` for National Health Insurance Scheme, `RLHMO` for Reliance HMO). This code:
- Is set when the provider is created by Super Admin
- Is used in `insurance_cases.case_number` prefix (e.g. `GPHMO-2026-00001`)
- Uniquely identifies which HMO/insurance a case belongs to
- Allows grouping and filtering by provider in reports

### 3.4 Registration — Insurance Provider Selection

The registration form's existing insurance dropdown must be updated to offer selection from registered `insurance_providers` in addition to the current free-text/custom options:

- When user selects **HMO** or **NHIA**, the `insurance_type` dropdown is populated from `insurance_providers` (active providers only) instead of the current `custom_insurance_types` table
- When user selects **Retainership**, the existing fixed options (CBN, Zenith Bank) remain
- When user selects **Private** or **Other**, the existing free-text/custom behavior remains
- A new **Provider Code** read-only field displays the provider's `code` once a provider is selected (for visual confirmation)
- The `insurance` field on the patient record now stores the provider `id` (UUID) instead of a free-text name, enabling direct linking to `insurance_providers`

### 3.5 Existing `custom_insurance_types` — Migration Path

The current system uses a `custom_insurance_types` table and `/api/insurance-types` endpoints for HMO/insurance provider selection. This must be migrated:

1. **Pre-migration**: Run a one-time script that reads all unique `insurance` values from `patients` and `custom_insurance_types`, creates corresponding entries in `insurance_providers`, and updates patient records to point to the new provider IDs
2. **Backward compatibility**: The old `/api/insurance-types` endpoints remain active during Phase 1 but are marked deprecated
3. **Cutover**: After migration, the registration form reads from `insurance_providers` exclusively; the old endpoints are removed in Phase 4
4. **Data mapping**: For patients with `insurance = '__other__'`, the `insurance_sub_type` value becomes the provider name. For `insurance = 'HMO'` or `'NHIA'`, the `insurance_type` is matched against `insurance_providers.name`

Migration SQL pattern:
```sql
-- Create providers from existing distinct insurance values
INSERT INTO insurance_providers (id, tenant_id, name, code)
SELECT gen_random_uuid(), t.tenant_id, t.insurance, UPPER(LEFT(t.insurance, 5))
FROM (SELECT DISTINCT tenant_id, insurance FROM patients WHERE insurance IS NOT NULL AND insurance NOT IN ('Private', 'None', 'N/A')) t;

-- Update patient records to store provider UUID (requires application-level mapping)
-- The new `patient_insurance_id` column stores the patient's membership number
```

### 3.6 Multiple Insurance Policies Per Patient

A patient may have multiple concurrent insurance policies (e.g., NHIS + private HMO, or a primary + secondary HMO). The single `patient_insurance_id` column on `patients` is insufficient for this.

**Solution:** Add a `patient_insurance_policies` table:

```sql
CREATE TABLE patient_insurance_policies (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
  provider_id UUID REFERENCES insurance_providers(id),
  policy_number VARCHAR(100) NOT NULL,       -- e.g. "NHIS-123456789", "GPH-78901"
  policy_holder_name VARCHAR(200),           -- if different from patient (e.g. spouse)
  relationship_to_patient VARCHAR(50),       -- 'self', 'spouse', 'child', etc.
  coverage_type VARCHAR(50) DEFAULT 'primary',  -- 'primary', 'secondary', 'tertiary'
  is_active BOOLEAN DEFAULT true,
  start_date DATE,
  end_date DATE,
  co_pay_percentage DECIMAL(5,2) DEFAULT 0,  -- per-policy co-pay override
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Design rules:**
- `patient_insurance_id` column on `patients` remains for quick lookup of default/primary policy
- The `patient_insurance_policies` table holds all policies for patients with multiple coverage
- When creating an `insurance_case`, the staff selects which policy applies (defaults to primary)
- For coordination of benefits: primary policy pays first, secondary covers remaining balance
- Paypoint displays all active policies when processing co-pay for an insured patient
- The insurance staff UI shows a "Policies" section on the patient view listing all active/inactive policies

**Registration form update:**
- Step 3 shows "Add Insurance Policy" button after primary policy is entered
- Clicking it opens a secondary policy form (provider, policy number, coverage type, relationship)
- The UI supports adding up to 3 policies per patient

---

## 4. Insurance Staff Login Flow

### 4.1 Authentication

- Separate login endpoint: `POST /api/insurance/auth/login`
- Uses `insurance_staff_users` table (not `staff_users`)
- Returns JWT with `user_type: 'insurance_staff'`, `provider_id`, and `access_scope`
- Separate auth middleware: `insuranceAuthGuard`

### 4.2 Staff Registration & Access Control

- Super Admin creates insurance providers via a setup page
- Provider admin (or super admin) can create/edit insurance staff accounts
- Staff accounts have:
  - `provider_id` — the HMO they belong to (NULL if `access_scope = 'all'`)
  - `access_scope` — `'own'` (default, sees only their HMO) or `'all'` (sees all HMOs)
- A staff with `access_scope = 'all'`:
  - Can see and manage cases for **any** insurance provider
  - Can generate cross-provider reports
  - Is useful for hospital-level insurance coordinators, NHIA administrators, or aggregator platforms
  - Provider filter dropdown appears in the UI to switch between HMOs
- `access_scope` can only be set by Super Admin

### 4.3 Provider Filter for Cross-Provider Staff

When a staff user has `access_scope = 'all'`, all insurance management pages show a **provider filter dropdown** at the top:

```
┌─────────────────────────────────────────────────────────┐
│  👤 Super Admin (All HMOs)               Jane [Logout]  │
│  ┌──────────────────────┐                               │
│  │ Provider: All HMOs  ▼│                               │
│  └──────────────────────┘                               │
└─────────────────────────────────────────────────────────┘
```

Options: `All HMOs`, or a specific provider. Selecting a provider filters all cases, invoices, and reports to that provider only.

---

## 5. Insurance Module UI — Pages

All pages live under `/insurance/` route prefix with separate layout.

### 5.1 Login Page `/insurance/login`

- Email + password
- Redirects to dashboard on success
- Password reset flow

### 5.2 Dashboard `/insurance/dashboard`

**Stats cards:**
- Active cases (today/total)
- Open invoices count
- Pending authorization requests
- Total billed this month (by this provider, or all providers if `access_scope = 'all'`)
- Total paid this month

**Quick actions:**
- Search patient by hospital number, name, or **patient insurance ID**
- View recent cases for this provider (or all providers)
- Recent invoices

**Provider filter** (visible only when `access_scope = 'all'`):
- Dropdown: All HMOs / specific provider
- Filters all stats, cases, invoices, and reports on the page

### 5.3 Patient Search `/insurance/patients`

- Search by hospital #, name, phone, or **patient insurance ID**
- Shows insurance status: provider name, patient insurance ID, auth code, case status
- Click → opens patient's insurance case list

### 5.4 Insurance Case Detail `/insurance/cases/:id`

**Header:**
- Patient name, hospital #, DOB, **patient insurance ID**
- Provider name, case number, auth code
- Case status badge + edit button

**Tabs:**

#### Tab 1: Case Info
- Coverage period, co-pay amount
- Patient insurance ID
- Admission details (if applicable)
- Encounter/consultation reference
- Notes

#### Tab 2: Services (Insurance Staff Editable)
- Table of services with: type, name, qty, unit price, total price
- **Add Service** button → modal with:
  - Service type dropdown (consultation, lab, radiology, pharmacy, admission, procedure, misc)
  - Service name (auto-complete from clinical catalog or free-text)
  - Quantity
  - Unit price (editable)
  - Notes
- **Edit** inline — quantity, price
- **Delete** (with confirmation)
- **Original clinical reference** shown as muted text if linked to a clinical order

**Critical rule:** Adding/editing services here does NOT create lab orders, prescriptions, or modify the clinical encounter. These are purely for HMO billing.

#### Tab 3: Clinical Reference (Read-Only)
- Shows the actual clinical encounter SOAP notes
- Shows the actual lab orders (from lab_orders table)
- Shows the actual prescriptions (from prescriptions table)
- Shows admission details
- This is for reference only — no edits allowed here

#### Tab 4: Billing Summary
- Total billed vs total paid
- Co-pay breakdown
- Invoice references
- Download invoice PDF

### 5.5 Create Case `/insurance/cases/new`

- Select patient (search by name, hospital #, or **patient insurance ID**)
- Select insurance provider (auto-filled from staff's provider, or dropdown for `access_scope = 'all'`)
- Enter auth code
- Set coverage period
- Enter patient insurance ID (auto-filled from patient record, editable)
- Link to encounter or admission (optional)
- Create case → opens case detail

### 5.6 Invoices `/insurance/invoices`

- List of invoices for this provider (or all providers)
- Filter by provider (if `access_scope = 'all'`), status, period
- Click → invoice detail with line items
- "Generate Invoice" button → selects a period and provider, aggregates all closed cases, creates invoice

### 5.7 Reports `/insurance/reports`

- **Utilization Report**: Service type breakdown by period and provider
- **Patient Report**: All patients and their service totals
- **Financial Report**: Billed vs paid, aging analysis
- **Provider Comparison Report** (only for `access_scope = 'all'`): Compare billing across HMOs
- Export to CSV/PDF
- Filter by date range, provider, service type, status

### 5.8 Staff Management `/insurance/staff` (Admin / `access_scope = 'all'` only)

- List all insurance staff across all providers (or filtered by provider)
- Create new staff (email, name, role, **access_scope**, provider)
- Deactivate/reactivate staff
- Role assignment
- Change access_scope (Super Admin only)

### 5.9 Provider Settings `/insurance/settings` (Admin only)

- Edit provider details (name, contact info, code)
- Co-pay percentage/defaults
- View all providers (if `access_scope = 'all'`)
- Configure co-pay calculation method per provider (percentage, fixed, service-based)

### 5.10 Authorization Requests `/insurance/auth-requests`

**Pre-authorization management page:**

- **List view**: All authorization requests with status filter (pending, approved, denied, expired)
- **Request card**: Patient name + hospital #, provider name, requested services, auth code, requested by, date
- **Pending tab**: Auth requests awaiting HMO response — shows days since request with amber warning for >48h
- **Approved tab**: Approved authorizations with auth code, validity period, authorized amount
- **Denied tab**: Denied requests with reason, re-submission option
- **Request modal**: Select patient, select provider, enter service details, attach clinical notes, submit
- **Approve/Deny buttons** (for insurance staff with HMO response): sets status + optionally enters auth code
- **Expiry check**: Auto-expire auth requests that exceed their validity period
- **Create case from auth**: "Create Case" button on approved auth requests — pre-fills case with provider, patient, auth code, coverage period

### 5.11 Void/Cancel Workflow

- **Void case**: Available only for `active` cases with no paid invoices. Requires reason. Sets `status = 'voided'`
- **Cancel invoice**: Available only for `draft` invoices. Sets `status = 'cancelled'` with reason
- **Reverse invoice payment**: Available only for `paid` invoices within 30 days. Creates credit note, reopens cases, requires Super Admin approval
- **Audit trail**: All void/cancel/reverse actions logged with staff ID, timestamp, and reason

---

## 6. API Endpoints

### Authentication
| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/insurance/auth/login` | Insurance staff login |
| POST | `/api/insurance/auth/logout` | Logout |
| GET | `/api/insurance/auth/me` | Current user info |

### Providers (Super Admin)
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/insurance/providers` | List all providers |
| POST | `/api/insurance/providers` | Create provider |
| PUT | `/api/insurance/providers/:id` | Update provider |
| DELETE | `/api/insurance/providers/:id` | Deactivate provider |

### Staff
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/insurance/staff` | List staff (filtered by provider) |
| POST | `/api/insurance/staff` | Create staff account |
| PUT | `/api/insurance/staff/:id` | Update staff |
| PATCH | `/api/insurance/staff/:id/status` | Activate/deactivate |

### Cases
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/insurance/cases` | List cases (filtered by provider, status, patient) |
| GET | `/api/insurance/cases/:id` | Get case detail with services |
| POST | `/api/insurance/cases` | Create new case |
| PUT | `/api/insurance/cases/:id` | Update case (status, auth code, notes) |
| GET | `/api/insurance/cases/patient/:patientId` | Get all cases for a patient |

### Services (Insurance-Only)
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/insurance/cases/:caseId/services` | List services for a case |
| POST | `/api/insurance/cases/:caseId/services` | Add service (insurance-only) |
| PUT | `/api/insurance/cases/:caseId/services/:id` | Update service (qty, price) |
| DELETE | `/api/insurance/cases/:caseId/services/:id` | Remove service |

### Clinical Reference
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/insurance/clinical/:patientId/encounters` | Patient's clinical encounters (read-only) |
| GET | `/api/insurance/clinical/:patientId/lab-orders` | Patient's lab orders (read-only) |
| GET | `/api/insurance/clinical/:patientId/prescriptions` | Patient's prescriptions (read-only) |
| GET | `/api/insurance/clinical/:patientId/admissions` | Patient's admissions (read-only) |

### Invoices
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/insurance/invoices` | List invoices (filtered by provider, status, period) |
| GET | `/api/insurance/invoices/:id` | Invoice detail with line items |
| POST | `/api/insurance/invoices/` | Generate invoice from cases in date range |
| PUT | `/api/insurance/invoices/:id` | Update invoice status (mark sent, paid) |
| GET | `/api/insurance/invoices/:id/pdf` | Download invoice as PDF |

### Authorization Requests
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/insurance/auth-requests` | List auth requests (filtered by provider, status, patient) |
| POST | `/api/insurance/auth-requests` | Create new authorization request |
| PUT | `/api/insurance/auth-requests/:id` | Update auth request (status, auth code, response notes) |
| GET | `/api/insurance/auth-requests/stats` | Pending/approved/denied counts |

### Patient Insurance Policies
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/insurance/policies/:patientId` | List policies for a patient |
| POST | `/api/insurance/policies` | Add policy to patient |
| PUT | `/api/insurance/policies/:id` | Update policy (coverage type, end date, status) |
| DELETE | `/api/insurance/policies/:id` | Remove policy (soft-delete) |

### Void/Cancel Operations
| Method | Endpoint | Purpose |
|--------|----------|---------|
| PUT | `/api/insurance/cases/:id/void` | Void a case (with reason) |
| PUT | `/api/insurance/invoices/:id/cancel` | Cancel a draft invoice |
| POST | `/api/insurance/invoices/:id/credit-note` | Generate credit note for paid invoice |

### Co-Pay (Clinical-facing)
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/insurance/co-pay/:patientId` | Get patient's co-pay amount for current active case |
| POST | `/api/insurance/co-pay/pay` | Record co-pay payment (creates payment item) |
| GET | `/api/insurance/co-pay/history/:patientId` | Co-pay payment history for patient |

### Reports
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/insurance/reports/utilization` | Service utilization by type and period |
| GET | `/api/insurance/reports/financial` | Billed vs paid summary |
| GET | `/api/insurance/reports/patients` | Per-patient service totals |

### Catalog (for auto-complete)
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/insurance/catalog/lab-tests` | Lab test catalog (read-only) |
| GET | `/api/insurance/catalog/drugs` | Drug catalog (read-only) |
| GET | `/api/insurance/catalog/radiology` | Radiology imaging types (read-only) |

---

## 7. Navigation & Routing

### 7.1 Frontend Auth Guard & Session Handling

The `App.tsx` routing must handle two distinct user types:

```typescript
// Pseudocode for App.tsx routing logic
const user = getCurrentUser(); // from JWT or session storage

if (user?.user_type === 'insurance_staff') {
  // Render InsuranceApp component with /insurance/* routes
  // No access to clinical routes (no /patients, /lab, /pharmacy, etc.)
  <InsuranceApp />
} else if (user?.user_type === 'clinical_staff') {
  // Render existing ClinicalApp with clinical routes
  // Insurance sidebar items are visible based on role (see 7.2)
  <ClinicalApp />
} else {
  // Render Login page
  <LoginPage />
}
```

**Implementation:**
- `Login.tsx` checks login response for `user_type` field
- If `user_type === 'insurance_staff'`, redirect to `/insurance/dashboard` and store insurance-specific session
- If `user_type === 'clinical_staff'`, redirect to existing role-based dashboard
- A new `InsuranceLayout` component wraps all `/insurance/*` routes (separate from clinical `Layout`)
- `InsuranceLayout` has its own sidebar with insurance-specific navigation items
- The `axios` interceptor attaches `Authorization` header for both user types; the `/api/insurance/*` endpoints use `insuranceAuthGuard` middleware server-side

### 7.2 Sidebar Placement for Clinical Staff

For clinical staff users (not insurance staff), the Insurance module appears in the sidebar navigation **only for Admin and Finance roles**:

| Role | Sees Insurance Sidebar Link? | Can View Cases? | Can Edit Cases? | Can Generate Reports? |
|------|:---------------------------:|:---------------:|:---------------:|:--------------------:|
| Admin | ✓ | Read-only | Read-only | ✓ |
| Finance | ✓ | Read-only | Read-only | ✓ |
| Doctor | — | — | — | — |
| Nurse | — | — | — | — |
| Lab Scientist | — | — | — | — |
| Pharmacist | — | — | — | — |
| Records | — | — | — | — |
| Paypoint | — | — | — | — |

**Sidebar link for Admin/Finance (in Admin grouped view):**
```
Insurance:
  /insurance/dashboard          → Insurance Dashboard (read-only stats)
  /insurance/patients           → Patient Insurance Lookup
  /insurance/reports            → HMO Reports
  /insurance/settings           → Provider Settings (Admin only)
```

### 7.3 DashboardRouter Integration

The `DashboardRouter` in the client determines which dashboard a user sees on login:

```typescript
const role = user.role;
const userType = user.user_type;

if (userType === 'insurance_staff') {
  redirect('/insurance/dashboard'); // insurance staff always go here
}

switch (role) {
  case 'Admin':     redirect('/dashboard'); break;
  case 'Finance':   redirect('/finance/dashboard'); break;
  // ... existing roles
}
```

### 7.4 Route Guards

- **Frontend**: A `ProtectedRoute` wrapper checks `user.user_type` for insurance routes vs clinical routes
- **Server-side**: `insuranceAuthGuard` middleware on all `/api/insurance/*` endpoints validates JWT with `user_type: 'insurance_staff'`
- **Clinical-side insurance endpoints** (e.g., co-pay lookup, patient coverage): Protected by existing clinical `authGuard` middleware, not `insuranceAuthGuard`

---

## 8. Key Design Principles

### 8.1 Clinical Records Are Never Modified

Insurance staff service edits only affect `insurance_case_services`. They do NOT create/modify/delete clinical records (encounters, lab orders, prescriptions, radiology orders, admissions). The clinical record stays exactly as the doctor ordered.

### 8.2 Case-Encounter Linking

An insurance case links to an encounter or admission for reference, but does not depend on it. Cases can exist without encounter links (e.g., for capitation/retainership patients). The link enables the Clinical Reference tab to show relevant clinical data read-only.

### 8.3 Provider Isolation & Access Scope

- Staff with `access_scope = 'own'` only see cases for their HMO (`WHERE provider_id = $1`)
- Staff with `access_scope = 'all'` can see all providers, with an optional provider filter dropdown
- Provider filter persists across the session via URL params or local state
- Even with `access_scope = 'all'`, the audit trail records which staff user made changes

### 8.4 Auto-Case Creation

Cases can be auto-created when:
- A patient with `insurance` set to an HMO/NHIA is checked in via triage
- A clinical encounter is saved for a patient with active insurance
- An admission is created for an insured patient
- Configurable per provider: some HMOs require manual case creation only

### 8.5 Pre-Authorization Workflow

Auth codes are critical for HMO billing. The workflow ensures cases are properly authorized before services are submitted for billing.

**Auth status flow:**
```
requested → submitted_to_hmo → approved (with auth_code) → linked_to_case
                                 → denied (with reason) → patient_notified
                                 → expired → re_requested
```

**Steps:**
1. Hospital staff (clinical or insurance) creates an **authorization request** with: patient, provider, requested services, clinical justification, estimated cost
2. System assigns a request reference number: `AUTH-YYYY-XXXXX`
3. Insurance staff submits the request to the HMO (via phone/portal/email — out of system)
4. Insurance staff records the HMO's response in the system:
   - **Approved**: Enter auth code, validity period, authorized amount → case can be created
   - **Denied**: Enter denial reason, optionally re-submit with modifications
   - **Partial**: Enter auth code + authorized amount + list of approved services only
5. Auth code flows into `insurance_cases.auth_code` when creating the case from an approved auth
6. **Auto-expiry**: Auth codes with a validity end date auto-expire. Cases linked to expired auth codes get flagged for re-authorization

**UI for auth requests:**
- The Auth Requests page (5.10) is the central management interface
- Insurance case detail shows the auth code + validity period + link to the original auth request
- When creating a case (5.5), staff can search approved auth requests by patient and auto-fill auth details
- Dashboard shows "Pending Auth" count as a stats card
- Sidebar badge (insurance staff only): count of pending auth requests needing HMO response

### 8.6 Co-Pay Calculation & Handling

Co-pay is the portion of the bill that the patient must pay out-of-pocket. The HMO covers the rest.

**Co-pay calculation methods (configurable per provider in Provider Settings):**

| Method | Description | Example |
|--------|-------------|---------|
| `percentage` | Fixed % of total bill | 10% of ₦65,900 = ₦6,590 |
| `fixed_per_visit` | Fixed amount per case/visit | ₦5,000 per admission |
| `fixed_per_service` | Fixed amount per service line | ₦500 per lab test, ₥1,000 per consultation |
| `tiered` | % based on service type | 5% for drugs, 10% for labs, 0% for admission |
| `none` | No co-pay (full HMO cover) | ₦0 |

**Provider Settings UI:**
```
┌──────────────────────────────────────────────┐
│ Co-Pay Configuration — Greenfield HMO        │
├──────────────────────────────────────────────┤
│ ○ Percentage-based    [10] %                 │
│ ○ Fixed per visit     [_____] ₦             │
│ ○ Fixed per service   [_____] ₦             │
│ ○ Tiered              [Configure Tiers →]    │
│ ○ No co-pay                                   │
├──────────────────────────────────────────────┤
│ [Save Configuration]                         │
└──────────────────────────────────────────────┘
```

**Integration with Paypoint:**
- When a patient with an active insurance case is selected at Paypoint, the system calculates the co-pay amount based on the provider's configuration
- The Paypoint checkout shows two sections:
  1. **Insurance-covered amount** (greyed out, informational) — "Covered by Greenfield HMO"
  2. **Patient co-pay** (actionable) — the amount the patient must pay
- Co-pay payment follows the same flow as existing Paypoint payments: creates a `payment` record with `payment_items`, marks the co-pay as paid
- `insurance_case_services` tracks which services have co-pay collected: `co_pay_collected BOOLEAN DEFAULT false`
- Receipt shows co-pay separately from insurance-billed amount

**Co-pay table column on `insurance_cases`:**
```sql
ALTER TABLE insurance_cases ADD COLUMN IF NOT EXISTS co_pay_collected DECIMAL(12,2) DEFAULT 0;
```

**Reporting:**
- Co-pay collected vs outstanding per case
- Co-pay totals per provider (monthly/quarterly)
- Co-pay waiver tracking (admin overrides)

### 8.7 Invoice Generation Flow

1. Insurance staff selects date range (e.g., July 1–31, 2026)
2. System queries all `insurance_cases` with `status = 'closed'` in that range
3. Groups services by case, calculates totals
4. Creates `insurance_invoice` with `insurance_invoice_items` from aggregated data
5. Invoice status is `draft` → staff can review → mark as `sent`
6. When HMO pays, mark as `paid` with amount
7. **Payment reconciliation**: When marking an invoice as `paid`, optionally link to existing `payments` table record (if the HMO paid via bank transfer that was already logged in Paypoint)

### 8.8 Claim Submission Tracking

Invoices double as claims. Additional tracking fields are needed for HMO claim processing:

```sql
ALTER TABLE insurance_invoices ADD COLUMN IF NOT EXISTS claim_submitted_at TIMESTAMPTZ;
ALTER TABLE insurance_invoices ADD COLUMN IF NOT EXISTS claim_acknowledged_at TIMESTAMPTZ;
ALTER TABLE insurance_invoices ADD COLUMN IF NOT EXISTS claim_reference VARCHAR(100);
ALTER TABLE insurance_invoices ADD COLUMN IF NOT EXISTS expected_payment_date DATE;
```

**Claim status flow:**
```
draft → sent (submitted to HMO) → acknowledged (HMO confirms receipt) 
      → partially_paid → paid → disputed
      → rejected (with reason) → re-submitted
```

### 8.9 Coordination of Benefits (Multiple Insurance)

When a patient has both primary and secondary insurance:

1. Primary insurance case is billed first (all services → primary provider)
2. System calculates the balance remaining (total - primary coverage)
3. Secondary insurance case is created for the uncovered balance
4. Remaining patient co-pay is calculated from secondary policy's co-pay rules
5. Each policy's `coverage_type` determines the order: primary → secondary → tertiary
6. Paypoint shows the combined patient responsibility (primary co-pay + secondary co-pay)

---

## 9. Clinical Integration

### 9.1 Patient Chart — Insurance Tab

A dedicated **Insurance** tab in the Patient Chart (`/patient/:patientId`) visible to all clinical roles (Doctor, Nurse, Admin, Records). Shows the patient's complete insurance picture in one place.

**Tab layout:**

```
┌────────────────────────────────────────────────────────────┐
│  Insurance Summary                                         │
│  ┌──────────────────────┐  ┌─────────────────────────────┐ │
│  │ Active Policies       │  │ Active Cases                │ │
│  │ NHIS (Primary) ✓     │  │ GPH-2026-0042 ● Active      │ │
│  │ Greenfield (Secondary)│  │ Auth: AUTH-7891             │ │
│  └──────────────────────┘  │ Co-pay: ₦6,590              │ │
│                            └─────────────────────────────┘ │
├────────────────────────────────────────────────────────────┤
│  [All Insurance Cases]                [New Case Request →]  │
│                                                             │
│  ┌──────────────────────────────────────────────────┐      │
│  │ Case #GPH-2026-0042  │ Greenfield HMO │ Active  │      │
│  │ Auth: AUTH-7891      │ ₦65,900 billed │ ✓ Auth'd│      │
│  │ Coverage: Jul 1–31   │ Co-pay: ₦6,590 │         │      │
│  ├──────────────────────────────────────────────────┤      │
│  │ Case #NHIS-2026-0012 │ NHIS           │ Closed  │      │
│  │ Auth: NHIS-5544      │ ₦32,000 billed │ ✓ Paid  │      │
│  └──────────────────────────────────────────────────┘      │
│                                                             │
│  Services for GPH-2026-0042:                                │
│  ┌───────────────────────────────────────────┬──────────┐  │
│  │ Service                   Qty    Price    │ Total    │  │
│  ├───────────────────────────────────────────┼──────────┤  │
│  │ 🧪 Lab — Malaria Rapid Test  1    3,500  │ ₦3,500   │  │
│  │ 💊 Pharm — Amoxicillin 500mg 14     550  │ ₦7,700   │  │
│  │ 🏥 Admission — General Ward   5    8,000  │ ₦40,000  │  │
│  ├───────────────────────────────────────────┼──────────┤  │
│  │                                     Total │ ₦65,900  │  │
│  └───────────────────────────────────────────┴──────────┘  │
└────────────────────────────────────────────────────────────┘
```

**Sections:**
1. **Summary Cards** at top: Active policy count, Active cases, Pending co-pay amount
2. **Active Policies** section: Lists all `patient_insurance_policies` with provider name, policy number, coverage type (primary/secondary), validity dates
3. **Active Cases** section: Current active insurance cases with status, auth code, total billed, co-pay due
4. **All Cases History**: Expandable list of past cases (closed, disputed, voided)
5. **Case Detail Drill-down**: Clicking a case opens a modal showing all services, billing summary, invoice references
6. **New Case Request** button: For clinical staff to request an insurance case be created (sends notification to insurance staff)

**Tab visibility:**
- Always visible for all clinical roles (Doctor, Nurse, Admin, Records, Finance)
- Shows "No insurance information on file" empty state for uninsured patients
- If patient has no active policies but has historical data, shows historical cases only

### 9.2 Doctor Consultation — Insurance Banner

A persistent info banner in `DoctorConsultation.tsx` (similar to the Maternity info banner) showing the patient's active insurance coverage:

```
┌──────────────────────────────────────────────────────────────┐
│  🛡️ Insurance: Greenfield HMO (Primary)                     │
│  Policy: GPH-78901  |  Auth: AUTH-7891  |  Co-pay: 10%      │
│  Coverage: Jul 1 – Jul 31, 2026         [View Full Details →]│
└──────────────────────────────────────────────────────────────┘
```

**What the doctor sees:**
- Insurance provider name and policy type (primary/secondary)
- Active auth code (if one exists for current encounter/admission)
- Co-pay percentage/amount (so doctor knows what the patient will pay out-of-pocket)
- Coverage validity dates
- "View Full Details" link → opens Insurance Case modal or navigates to Patient Chart Insurance tab
- If no active insurance case: "No active insurance coverage" banner (subtle, grey)

**Data source:** Fetched alongside patient data on consultation load via a new endpoint: `GET /api/insurance/patient-coverage/:patientId` — returns active policies + active case + auth info in one call.

### 9.3 Admissions Integration

When a patient with active insurance is admitted:
- The existing `/api/admissions` POST endpoint reads `patients.insurance` and auto-links the admission to an active insurance case if one exists
- Admission fee is flagged as "bill to HMO" if an active case covers it
- Discharge summary includes insurance info: provider, case number, auth code, co-pay status
- Bed assignment is not blocked by payment check if the patient's insurance case covers admission fees (configurable per provider)

### 9.4 Triage Integration

In the triage station, when a patient is checked in:
- The triage queue shows an `🛡️ Insured` badge if the patient has an active insurance policy
- If `auto_case_creation` is enabled for the patient's provider, a case is auto-created on triage check-in
- The triage vitals form shows insurance info at the top (provider name, co-pay info)

---

## 10. Paypoint Integration — Co-Pay Collection Flow

### 10.1 Insured Patient at Paypoint

When a patient with active insurance is selected at Paypoint:

```
┌─────────────────────────────────────────────────────────┐
│  Patient: Chisom Okafor  (H#: H-2026-0042)             │
│  🛡️ Insurance: Greenfield HMO  |  Case: GPH-2026-0042  │
│  Co-pay: 10%  |  Covered: 90%  |  Auth: AUTH-7891      │
├─────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────┐   │
│  │  Unpaid Items                                     │   │
│  ├──────────────────────────────────────────────────┤   │
│  │  □ Folder Activation         ₦5,000  │ Patient   │   │
│  │  □ Admission (Gen. Ward)     ₦40,000 │ Insurance:│   │
│  │  □ Lab — Malaria Rapid Test  ₦3,500  │  90% cov. │   │
│  │  □ Pharm — Amoxicillin       ₦7,700  │  ₦46,080  │   │
│  ├──────────────────────────────────────────────────┤   │
│  │  Total: ₦56,200                                  │   │
│  │  🛡️ Insurance covers: ₦46,080 (82%)              │   │
│  │  💰 Patient co-pay:    ₦10,120 (18%)              │   │
│  └──────────────────────────────────────────────────┘   │
│                                                         │
│  [Charge Patient ₦10,120]  [Bill Insurance ₦46,080]    │
└─────────────────────────────────────────────────────────┘
```

**How it works:**
1. Paypoint fetches all unpaid items for the patient (standard flow)
2. Additional endpoint `GET /api/insurance/co-pay/:patientId` returns the patient's co-pay configuration + active case
3. System calculates which services are covered by insurance vs patient responsibility:
   - Services present in `insurance_case_services` → bill to HMO
   - Services NOT in `insurance_case_services` → patient pays fully
   - Co-pay = (total covered services) × (co-pay percentage from provider config)
4. Paypoint shows **split checkout**: insurance portion and patient portion
5. Staff collects co-pay from patient → processes as standard payment (creates `payments` + `payment_items`)
6. Co-pay amount is recorded on the `insurance_case` (`co_pay_collected` field)
7. Receipt shows: "Paid: ₦10,120 (co-pay for Greenfield HMO Case #GPH-2026-0042)"

### 10.2 Co-Pay Payment Endpoint

```
POST /api/insurance/co-pay/pay
Body: { patientId, caseId, amount, paymentMethod }
Response: { payment, receipt, case }
```

Logic:
1. Validates the active insurance case
2. Calculates expected co-pay based on provider config
3. Creates `payments` record (type = `co_pay`, references `insurance_case_id`)
4. Creates `payment_items` with service breakdown
5. Updates `insurance_cases.co_pay_collected`
6. Returns receipt + updated case data

### 10.3 Paypoint Receipt for Insured Patients

Receipt shows two sections:
1. **Patient Payment**: Co-pay amount, method, date
2. **Insurance Summary**: Provider name, case number, auth code, total billed to HMO
3. Footer: "This receipt covers patient co-pay only. The balance will be invoiced to Greenfield HMO."

### 10.4 Exempt Services

Some services may be excluded from insurance coverage (e.g., cosmetics, specific procedures):
- Provider settings include an **excluded services** list
- Services in the excluded list are always patient-responsibility (100% co-pay)
- Paypoint shows these as "Not covered by insurance" with no insurance portion
- Configurable per provider via Provider Settings page

---

## 11. Seed Data

Pre-populate common Nigerian HMOs as seed data in the migration:

```sql
INSERT INTO insurance_providers (id, tenant_id, name, code) VALUES
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'NHIS', 'NHIS'),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'Greenfield HMO', 'GPHMO'),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'Reliance HMO', 'RLHMO'),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'AXA Mansard Health', 'AXAHMO'),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'Leadway Health', 'LWHMO'),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'Hygeia HMO', 'HYGHMO'),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'Total Health Trust', 'THTHMO'),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'Precious Healthcare', 'PCHMO'),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'Clearline HMO', 'CLHMO'),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'Multi-Shield HMO', 'MSHMO');
```

These are tenant-agnostic seed records. Each tenant that enables the insurance module can clone or reference them.

---

## 12. Implementation Order

### Phase 1: Foundation (Core Tables + Auth)
- **Migration files**: `028_insurance_providers.sql`, `029_insurance_staff_users.sql`, `030_insurance_cases.sql`, `031_insurance_case_services.sql`, `032_insurance_invoices.sql`, `033_insurance_invoice_items.sql`
- **Seed data file**: `034_insurance_seed_providers.sql`
- **Migration file**: `035_insurance_patient_policies.sql` (patient_insurance_policies table)
- **Migration file**: `036_insurance_auth_requests.sql` (authorization requests table)
- **Migration file**: `037_insurance_co_pay.sql` (co_pay_collected column + co-pay config)

1. Run all new migration files (028–037)
2. Implement insurance staff login (separate from clinical staff)
3. Build insurance provider management (Super Admin UI)
4. Insurance staff CRUD
5. Seed common Nigerian HMO providers
6. Run existing `custom_insurance_types` migration script (backfill data from old table)
7. Build frontend auth routing (InsuranceApp vs ClinicalApp split)
8. Build InsuranceLayout with sidebar

### Phase 2: Case Management
9. Insurance case creation (manual + auto from patient registration)
10. Insurance case detail page (4-tab layout: Info, Services, Clinical Ref, Billing)
11. Insurance case services CRUD
12. Create case from approved authorization request
13. Pre-authorization request management (CRUD + status workflow)
14. Patient insurance policies management (multiple policies per patient)
15. Clinical reference (read-only view)
16. Void/cancel workflows (void case, cancel invoice, credit note)

### Phase 3: Clinical & Paypoint Integration
17. Patient Chart Insurance tab (summary + case history + drill-down)
18. Doctor Consultation insurance banner
19. Admissions integration (insurance-aware bed assignment)
20. Triage integration (insured badge + auto-case creation)
21. Paypoint co-pay collection flow (split checkout, co-pay calculation)
22. Co-pay receipt generation
23. Co-pay payment endpoint + payment_items integration

### Phase 4: Billing & Reporting
24. Invoice generation engine (period-based, aggregate from cases)
25. Claim submission tracking (submitted → acknowledged → paid)
26. Invoice list and detail pages
27. Invoice PDF export
28. Reports (Utilization, Financial, Patient, Provider Comparison)
29. Dashboard with stats + sidebar badges
30. Coordination of benefits (primary → secondary insurance)

### Phase 5: Advanced Features
31. Auto-create cases on patient check-in (configurable per provider)
32. Service catalog integration (pull prices from inventory)
33. Email notifications for invoice/claim status changes
34. Bulk service import from clinical orders
35. Audit log for all insurance case changes
36. Deprecate and remove old `/api/insurance-types` endpoints
37. Excluded services list per provider
38. Co-pay waiver workflow (admin override with reason)

---

## 13. UI Route Structure

### Insurance Staff Routes
```
/insurance/login
/insurance/dashboard
/insurance/patients
/insurance/patients/:patientId
/insurance/cases/new
/insurance/cases/:id
/insurance/invoices
/insurance/invoices/:id
/insurance/reports
/insurance/reports/utilization
/insurance/reports/financial
/insurance/reports/patients
/insurance/auth-requests
/insurance/policies/:patientId
/insurance/staff
/insurance/settings
```

### Clinical Staff Routes (Patient Chart)
```
/patient/:patientId              → Insurance tab (section)
```

### Clinical Staff Routes (Admin/Finance)
```
/insurance/dashboard              → Read-only stats
/insurance/patients               → Patient insurance lookup
/insurance/reports                → HMO reports
/insurance/settings               → Provider management
```

---

## 14. Existing `FinanceHMO.tsx` — Deprecation Plan

The `Master Guide Plan.md` references a `FinanceHMO.tsx` component (Module 8) with basic HMO batch invoice features. This component's functionality is superseded by the new Insurance/HMO module.

**Migration strategy:**
1. **Phase 1–2**: `FinanceHMO.tsx` remains active alongside the new insurance module
2. **Phase 3**: New insurance module's invoicing and reporting features reach parity with `FinanceHMO.tsx`
3. **Phase 4**: `FinanceHMO.tsx` is marked deprecated with a banner: "This page has been replaced by the new Insurance Module. Visit `/insurance/dashboard`"
4. **Phase 5**: `FinanceHMO.tsx` component and its routes are removed from the codebase
5. **Sidebar**: Finance role's sidebar link redirects from old `/finance/hmo` to new `/insurance/dashboard` after Phase 4

---

## 15. Mockup Sketches

### Insurance Dashboard
```
┌─────────────────────────────────────────────────────────┐
│  🏥 Greenfield HMO                    Jane Doe [Logout] │
├─────────────────────────────────────────────────────────┤
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────┐ │
│  │ Active   │ │ Open     │ │ Pending  │ │ This Month │ │
│  │ Cases    │ │ Invoices │ │ Auth     │ │ Billed     │ │
│  │   42     │ │    3     │ │    12    │ │  ₦2.4M     │ │
│  └──────────┘ └──────────┘ └──────────┘ └────────────┘ │
│                                                         │
│  🔍 [Search patient by name or hospital #...]           │
│                                                         │
│  Recent Cases                     [View All →]          │
│  ┌────────────────────────────────────────────────┐     │
│  │ Chisom Okafor  │ GPH-2026-0042 │ Active  │ ○   │     │
│  │ Amina Bello    │ GPH-2026-0041 │ Closed  │ ✓   │     │
│  │ ...            │               │         │     │     │
│  └────────────────────────────────────────────────┘     │
│                                                         │
│  Pending Invoices                          [View All →]  │
│  ┌────────────────────────────────────────────────┐     │
│  │ INV-2026-003  │ Jul 2026 │ ₦840,000 │ Draft   │     │
│  └────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────┘
```

### Case Detail — Services Tab
```
┌─────────────────────────────────────────────────────────┐
│  ← Cases  ›  Chisom Okafor  ›  GPH-2026-0042           │
├─────────────────────────────────────────────────────────┤
│  Case #GPH-2026-0042  │  Auth: AUTH-7891  │  ● Active  │
├──────┬──────┬───────┬──────┬────────────────────────────┤
│ Info │●Serv.│Clin. │Billing│                           │
│      │ ices │Ref    │       │                            │
├──────┴──────┴───────┴──────┴────────────────────────────┤
│  [+ Add Service]                                        │
│                                                         │
│  ┌──────────────────────────────────────────────┬──────┐│
│  │  Service                         Qty   Price │Total ││
│  ├──────────────────────────────────────────────┼──────┤│
│  │  🧪 Lab — Malaria Rapid Test      1   3,500  │3,500 ││
│  │  💊 Pharm — Amoxicillin 500mg     14    550  │7,700 ││
│  │  🔬 Lab — Blood Culture           1  12,000  │12,000││
│  │  🏥 Admission — General Ward      5   8,000  │40,000││
│  │  💊 Pharm — Paracetamol 1g         6    450  │2,700 ││
│  ├──────────────────────────────────────────────┼──────┤│
│  │                                       Total  │65,900││
│  └──────────────────────────────────────────────┴──────┘│
│                                                         │
│  Note: Adding services here does not affect the         │
│  patient's clinical chart. These are for HMO billing.   │
└─────────────────────────────────────────────────────────┘
```

---

## 16. Security & Access Control

- Insurance staff login is **completely separate** from clinical staff
- JWT token includes `user_type: 'insurance_staff'` and `provider_id`
- All insurance API endpoints require `insuranceAuthGuard` middleware
- Provider isolation enforced at query level: `WHERE provider_id = $1`
- Super Admin role can impersonate any provider for support
- Audit trail: all service additions/edits/deletions log `added_by` (insurance staff user ID)
- Clinical data is read-only via separate endpoints that use `SELECT` only
