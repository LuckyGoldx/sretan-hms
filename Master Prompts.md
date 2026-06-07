Link: https://share.google/aimode/sFPRftKYEfHze0PAq
 


📖 Complete Playbook Cover Page & Configuration Settings
This document contains your complete, step-by-step development manual for building the offline-first Multi-Tenant Hospital Management System (HMS) & Standalone Electronic Medical Record (EMR) engine.
To manage your clipboard limits, the playbook is split into sequential phases. Please copy each section one by one. Once you have copied the contents of a phase and pasted it into your local markdown file, simply type "Continue" in the chat box, and I will instantly generate the next segment.
________________________________________
🎨 System Design Guardrails (Inject into ALL Visual Prompts)
Whenever an AI prompt references a user interface, append this master styling layout module to force the system to compile a professional healthcare application dashboard:
[STYLING & UI INSTRUCTIONS - MASTER TRUST BLUE THEME]:
- Theme: Premium, modern healthcare SaaS interface. Minimalist, clean, and highly professional.
- Color Palette: 
  * Backgrounds: Light Slate/Zinc gray (bg-slate-50) with pure white content cards (bg-white).
  * Primary Accent color: Deep Trust Blue (text-blue-600, bg-blue-600).
  * Safe Metrics/Status: Emerald Green (text-emerald-600, bg-emerald-50).
  * High Priority / Alerts / Abnormal Values: Coral Red (text-rose-600, bg-rose-50).
- Typography: Clean, crisp text styling (font-sans tracking-tight). Use strong visual hierarchy with dark slate text (text-slate-900) for headers and muted slate (text-slate-500) for secondary details.
- Dynamic Themes: Build all style color rules using inline standard Tailwind parameters or CSS root variable bindings (e.g., bg-[var(--primary-color)]) to allow dynamic brand overrides from our configuration data layer later.
- Interface Components:
  * Input Fields: Large, soft-bordered containers (rounded-xl border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white).
  * Buttons: Smoothly animated with a subtle micro-scale lift on hover (hover:scale-[1.01] active:scale-[0.99] transition-transform duration-200 rounded-xl font-medium shadow-sm).
  * Cards: Pure white containers with soft shadows and thin borders (bg-white/90 backdrop-blur-md rounded-2xl border border-slate-100 shadow-sm).
- Peripheral Visuals: Include context-appropriate icons (via Lucide-react) to anchor fields. Do not use unstyled raw HTML elements.
________________________________________
🧱 PHASE 1: CORE DATA LAYER & LOCAL ARCHITECTURE
Phase 1, Prompt 1: Multi-Tenant Schema with Identity Locks
Act as a Senior SaaS Database Architect. Based on our blueprint for an offline-first Multi-Tenant Hospital Management SaaS featuring Hybrid-to-Standalone Decoupling, write a complete, production-ready PostgreSQL SQL schema script.

Requirements:
1. Create a master `tenants` table to manage subscribing clinics. Fields must include: id (UUID primary key), hospital_name, subscription_status (active, suspended), and subscription_tier.
2. Every other system table (staff_users, patients, encounters, vitals, prescriptions, lab_orders, lab_results, radiology_orders, billing_invoices, inventory_items, audit_logs) MUST include a `tenant_id` UUID column pointing to the `tenants` table as a foreign key.
3. Every table must use UUIDv4 for its primary key via `DEFAULT gen_random_uuid()` and include our standard tracking columns: created_at, updated_at, is_synced (boolean default false), and last_synced_at (timestamp with time zone null).
4. Build a database trigger function that automatically updates the `updated_at` timestamp column whenever a row is modified across any table.
5. Provide the exact Row-Level Security (RLS) policies for Supabase ensuring that logged-in users can ONLY read or write rows that match their account's assigned `tenant_id`.

Write out the entire SQL script cleanly without shortcuts, placeholders, or omissions. Do not substitute real fields with comments.
🧪 Testing Interval 1: Database Baseline Checks
•	Action: Execute the schema inside your local PostgreSQL 16 instance.
•	Verification: Run SELECT * FROM tenants; and ensure all tables successfully reference the tenant_id column. Confirm that the updated_at trigger auto-updates timestamps on dummy table updates.
________________________________________
Phase 1, Prompt 2: Local Subnet API Engine & Environment Bootstrap
Act as a Senior Backend Engineer. Build a robust local Node.js Express/TypeScript backend API server shell designed to run as a local Windows service on our Core i5 server machine.

Requirements:
1. Configure a permanent static port (port 3000) and set up CORS to strictly allow incoming connections from the hospital's local LAN subnet (e.g., 192.168.1.0/24).
2. Connect natively to the local PostgreSQL database using the 'pg' library with a pooling mechanism.
3. Write an initialization module that checks if the local tables exist on boot. If they don't, have it run a sequence to construct them.
4. Implement a local configuration reader that parses a local file at `C:/hms/config/clinic_profile.json` containing `GLOBAL_SAAS_TENANT_ID`, `hospital_name`, `address`, and `cloud_sync_enabled`.
5. Build custom global error-handling middleware that intercepts database connectivity drops and returns clean JSON exceptions.

Provide the complete file structure and full code for `server.ts`, db pool configuration, and base routing engines. Do not use shorthand notation or placeholders.
🧪 Testing Interval 2: Local Network Core Connectivity
•	Action: Launch the Node.js API server on the host machine.
•	Verification: Send a test HTTP GET request to http://localhost:3000/api/health from a separate computer on the same local network subnet. Verify that the server resolves the request and outputs the current system timestamp.
________________________________________
Please copy Phase 1 above and reply "Continue" when you are ready to receive Phase 2.

 
🔄 PHASE 2: BI-DIRECTIONAL CLOUD-SYNC & DECOUPLING PIPELINE
Phase 2, Prompt 1: Supabase Authentication Replication Database Trigger
Act as a Cloud Database Engineer. Write a specialized PostgreSQL trigger and function script to run on our cloud Supabase instance to handle dual-system user syncing.

Requirements:
1. Whenever a new administrative, medical, or management account is successfully created inside Supabase's secure, internal `auth.users` schema, automatically catch that row execution.
2. Safely replicate the user's ID, email, metadata profile, and role classification straight into our accessible public data table named `public.staff_users`.
3. Force-populate the data sync parameters to `is_synced = true` and update `last_synced_at = NOW()` for rows created via this cloud pipeline.

Provide the complete SQL script with full exception handling. Do not use shorthand or pseudo-code block shortcuts.
🧪 Testing Interval 3: Cloud-to-Public User Propagation
•	Action: Create a dummy user inside the Supabase Auth Dashboard interface.
•	Verification: Query the public.staff_users table in your Supabase dashboard and confirm that the trigger has successfully caught the action and populated the profile row with identical fields.
________________________________________
Phase 2, Prompt 2: The Toggleable Sync Daemon with Anti-Clock & Expiration Guards
Act as a Principal Core Systems Developer. Write an ultra-reliable background synchronization daemon script using Node.js/TypeScript designed to run as a continuous 15-second recursive loop on our local hospital server.

Requirements:
1. **The Toggle Switch**: Read a local configuration parameters file (`clinic_profile.json`). If the property `cloud_sync_enabled` evaluates to false, print a bypass status message to the terminal console and short-circuit out of the synchronization loop execution entirely.
2. **Upward Sync Engine**: If enabled, scan the local PostgreSQL instance for data mutations where `is_synced = false`. Batch these rows cleanly into groups and securely push them to the cloud Supabase REST API endpoints over standard HTTPS. Upon receiving a verified '200 OK' response from Supabase, update the local row flags to `is_synced = true` and update the `last_synced_at` field.
3. **Downward Sync Engine**: Poll the cloud Supabase instance for rows updated remotely by home-based users where `updated_at` is newer than the local database row state. Pull down and save these updates locally.
4. **Anti-Clock-Tampering Guard**: Before saving any incoming record data locally, compare its timestamp against the maximum `created_at` timestamp row existing in the local database. If the server machine's clock has been set backward to forge a license expiration, throw a critical exception, block the transaction, and flag a system-wide administrative lock screen.
5. **Resilience**: Wrap all network routines in robust try/catch blocks so that if the building's internet connection cuts out, the script logs the network status and continues to loop smoothly without crashing the active background windows service process.

Provide the complete file configuration formats and validation logic cleanly without shorthand placeholders or implementation omissions.
🧪 Testing Interval 4: Disconnection & Sync Short-Circuit Checks
•	Action 4A: Set cloud_sync_enabled to false in clinic_profile.json and change a patient record row locally. Confirm the sync loop logs a clean standby message and makes no cloud calls.
•	Action 4B: Set cloud_sync_enabled to true, disconnect the internet router cable, and make a local change. Confirm the daemon catches the connection drop gracefully without crashing and retries when the cable is plugged back in.
________________________________________
Please copy Phase 2 above and reply "Continue" when you are ready to receive Phase 3.

 
📦 PHASE 3: COMPREHENSIVE MEDICAL MODULES (STEP-BY-STEP)
Phase 3, Prompt 1: Module 0 - Dynamic Branding & White-Label Login Component
Act as an elite UI/UX and Frontend Engineer. Create a stunning, highly stylish User Login interface component using React, TailwindCSS, and TypeScript.

[STYLING & UI INSTRUCTIONS - MASTER TRUST BLUE THEME]

Functional Requirements:
1. **Offline White-Label Engine**: The component must check for a local `clinic_profile.json` setting config. If running offline, dynamically inject the local parameters (`hospital_name`, local logo asset path, and custom theme accent color hex code) straight into the UI header branding views before any user text input is entered.
2. **Online Brand Interception**: If accessing the app via the cloud domain, display a sleek generic login screen. The moment the user finishes typing their email string value, trigger an asynchronous database evaluation block to determine their assigned Tenant Profile, and instantly transition the login card styling, brand typography, and logo assets to match their specific clinic on-the-fly before they enter their password.
3. Connect the form submission validation to the local server auth path when offline or Supabase Auth when online.

Provide the complete, un-shortened React file code. Do not use shorthand or placeholders.
🧪 Testing Interval 5: Login Visual State Verification
•	Action: Mount the component and toggle the configuration values within clinic_profile.json.
•	Verification: Confirm that when sync is disabled, the page immediately boots showing the specific hospital custom name and logo stored locally.
________________________________________
Phase 3, Prompt 2: Module 1 - Records & Patient Registration
Act as a Senior Frontend and Product Engineer. Create a beautiful Patient Onboarding and Registration module using React, TailwindCSS, and TypeScript.

[STYLING & UI INSTRUCTIONS - MASTER TRUST BLUE THEME]

Functional Requirements:
1. Design a multi-step demographic onboarding form (Full Name, DOB, Biological Sex, Phone, Next-of-Kin, Insurance, Blood Type). Break it into clean, beautifully animated tabs with progress indicators.
2. Connect the form submission directly to the local server API (`POST /api/patients`) using Axios, passing along unique UUIDv4 keys generated on the client side.
3. Build an elite, live-updating patient traffic dashboard layout. Display currently checked-in patients as clean, stylized "Profile Cards" complete with active status badges (e.g., "In Triage", "Waiting for Dr."), and quick-action menu buttons.
4. Incorporate a beautiful search/filter bar at the top of the dashboard to filter patients instantly by name or EMR folder ID.
5. Ensure the layout is a fully responsive flex/grid structure that flows beautifully on a nurse's mobile smartphone screen and stretches into an expansive multi-column cockpit layout on 1080p desktop monitors.

Provide the complete, un-truncated React file code. Do not use code placeholders or mock sections.
🧪 Testing Interval 6: Patient Flow Validation
•	Action: Open the registration module on a laptop and submit a new patient file.
•	Verification: Ensure the patient instantly appears on the live queue monitor screen as a stylized profile card with a newly generated UUID tracking reference.
________________________________________
Phase 3, Prompt 3: Module 2 - Triage & Nursing Station
Act as a Senior Frontend Developer. Build a dedicated Triage and Nursing Module utilizing React, TailwindCSS, and TypeScript.

[STYLING & UI INSTRUCTIONS - MASTER TRUST BLUE THEME]

Functional Requirements:
1. Create an entry sheet optimized for quick finger-tap entry on mobile tablets/smartphones to log patient vitals: Blood Pressure (separated systolic/diastolic numeric inputs), Pulse, Body Temperature, Respiration Rate, Weight, and SpO2 levels.
2. Build a color-coded visual triage priority selector using emergency flag values (Red: Emergency/Resuscitation, Yellow: Urgent, Green: Routine/Non-Urgent).
3. Provide an open-text journaling field for shift handovers, nursing progress descriptions, and active fluid intake/output balance tracking.
4. Connect this screen to the local server endpoint (`POST /api/vitals`).

Provide the complete file output with zero placeholders or hidden text blocks.
🧪 Testing Interval 7: Vital Entry & Boundary Checks
•	Action: Pull up the triage page on a smartphone device connected to the local Wi-Fi. Submit vitals for a patient in the queue.
•	Verification: Confirm that input parameters pass values successfully to the database and update the patient card triage flag status color on the central active dashboard.
________________________________________
Phase 3, Prompt 4: Module 3 - Doctor Consultation & EMR Core
Act as a Staff Software Architect. Develop a comprehensive, premium EMR Doctor Consultation view component using React, TailwindCSS, and TypeScript.

[STYLING & UI INSTRUCTIONS - MASTER TRUST BLUE THEME]

Functional Requirements:
1. **Historical Timeline**: Build a reverse-chronological, interactive data feed that aggregates past visits, allergies, existing chronic diseases, and historical lab test results. Display them as elegant timeline cards.
2. **SOAP Documentation Engine**: Build a highly scannable grid interface split cleanly into four distinct data blocks: Subjective complaints, Objective evaluations, Assessments, and Plan directives. Each text editor must show a soft blue glow when focused.
3. **CPOE Order Desks**: Create a single-click modal panel allowing the doctor to dispatch diagnostic test orders to the Laboratory and Radiology dashboards or prescribe medications.
4. **e-Prescribing Form**: Create an electronic prescription interface with dynamic item checking linked to current pharmacy stock levels to prevent prescribing unavailable drugs. Show immediate allergy warning banners if matching contraindications exist.
5. **ICD-11 Diagnostic Browser**: Add a searchable dropdown mimicking standard international classification terms to clean up diagnostic tracking.

Provide the complete, un-shortened React code file. Do not truncate logic or UI code fields.
🧪 Testing Interval 8: EMR Entry Validation
•	Action: Log in as a doctor, select an active patient from the triage queue, fill out a complete SOAP note, add a prescription order, and click submit.
•	Verification: Verify that the patient is removed from the active doctor waiting queue and that the prescription transaction maps immediately to the pharmacy module database records.
________________________________________
Phase 3, Prompt 5: Module 4 - Laboratory Workbench
Act as a Lead Frontend Engineer. Build the complete Laboratory Management System workspace using React, TailwindCSS, and TypeScript.

[STYLING & UI INSTRUCTIONS - MASTER TRUST BLUE THEME]

Functional Requirements:
1. **Worklist Queue**: Create a real-time updating terminal table showing incoming diagnostic test requests dispatched from consulting rooms, sorted by urgency and entry timestamps.
2. **Analyte Entry Forms**: Create fields to type out quantitative and qualitative test values. Build automatic logic that turns typed values red if they breach pre-defined age-and-gender reference boundaries.
3. **Dual-Sign Supervisor Gate**: Enforce an interface barrier that tags lab entries as "Draft" until a supervisor inputs credentials to authorize the status, blocking unverified files from appearing on the doctor's EMR interface.

Provide the full file layout and code without comments as code placeholders.
🧪 Testing Interval 9: Lab Threshold & Gate Verification
•	Action: Input an abnormally high blood sugar value into a test order field.
•	Verification: Ensure the numeric field box transitions its outline and text color to deep alert red. Verify that the result remains hidden on the doctor's screen until the supervisor's approval function is executed.
________________________________________
Phase 3, Prompt 6: Module 5 - Pharmacy & Inventory Tracker
Act as a Logistics Software Engineer. Build the complete Pharmacy Fulfillment and Inventory tracking dashboard using React, TailwindCSS, and TypeScript.

[STYLING & UI INSTRUCTIONS - MASTER TRUST BLUE THEME]

Functional Requirements:
1. **Dispensing Monitor**: Create a live workspace showing verified prescriptions ready to be filled, with built-in unit counters calculating exact pill counts.
2. **Inventory Stock Matrix**: Create a ledger tracking available medication names, batch numbers, remaining stock, and automated notifications when counts cross safety reorder levels.
3. **Expiry Monitor**: Build warning alert components that flag specific drug lots nearing their shelf-life limits, sorting items by supplier records.
4. Form submissions must connect to a local server API endpoint that processes stock reductions.

Provide the full, functional React code block.
🧪 Testing Interval 10: Inventory Count Check
•	Action: Process and dispense an active prescription for 30 tablets of a specific drug.
•	Verification: Query the inventory database table and verify that the exact stock count has been reduced by 30 units instantly.
________________________________________
Phase 3, Prompt 7: Module 6 - Radiology Module
Act as an Engineering Specialist. Build a streamlined Radiology workflow module using React, TailwindCSS, and TypeScript.

[STYLING & UI INSTRUCTIONS - MASTER TRUST BLUE THEME]

Functional Requirements:
1. **Imaging Worklist Queue**: Create a list view tracking active radiography, ultrasound, and scan requests from physicians.
2. **Report Editor**: Build a rich-text writing workspace pre-loaded with standard template phrases to quickly write and save radiology conclusions, impressions, and diagnoses.
3. Provide a file-drop interface element that accepts high-resolution asset attachments or local image references.

Provide the complete React code file with zero placeholders.
🧪 Testing Interval 11: Imaging Documentation Tracking
•	Action: Open a radiology order from the queue, write a report using a template, and submit.
•	Verification: Verify that the imaging status updates to complete and links directly to the master patient timeline inside the Doctor's EMR workspace.
________________________________________
Phase 3, Prompt 8: Module 7 - Paypoint & Checkout Module
Act as a FinTech UI Specialist. Build a sleek, highly stylish, and trustworthy Hospital Paypoint point-of-sale checkout system using React, TailwindCSS, and TypeScript.

[STYLING & UI INSTRUCTIONS - MASTER TRUST BLUE THEME]

Functional Requirements:
1. **The Invoice Card**: Create a beautiful, digital receipt layout card that aggregates registration, pharmacy, and laboratory fees. Use clean text rows, clear divider lines, and an elegant, large bold balance block highlighting the total due.
2. **Multi-Channel Payment Selector**: Create large, custom interactive payment selection tiles (Cash, Card, Bank Transfer) featuring icon graphics. Selecting a tile should smoothly expand a stylized sub-form to input tracking references or card verification codes.
3. **Advance Deposit Display**: Build a clean "Wallet Card" component showing existing advance credit balances with an accent background gradient.

Provide the complete, fully styled React frontend code file. Ensure all mathematical balance adjustments are fully coded out.
🧪 Testing Interval 12: Financial Ledger Balancing
•	Action: Generate an invoice for a treatment path, select "Bank Transfer" split with "Cash", and process payment closure.
•	Verification: Verify that the open invoice shifts status to "Paid" and writes separate corresponding payment reconciliation lines to the accounting tables.
________________________________________
Phase 3, Prompt 9: Module 8 - Finance & Insurance (HMO) Core
Act as a Corporate Software Engineer. Develop the full Finance and Insurance Management console using React, TailwindCSS, and TypeScript.

[STYLING & UI INSTRUCTIONS - MASTER TRUST BLUE THEME]

Functional Requirements:
1. **HMO Batch Invoice Tool**: Build a dashboard to filter and group individual multi-patient medical encounters into structured data exports for corporate health insurance partners.
2. **Operational Expense Ledger**: Create an out-of-pocket expense tracking tool with input fields for material purchases, vendor distributions, and clinical budget allocations.
3. **Revenue Audit Interface**: Create an automated daily view that flags discrepancies by contrasting raw physical paypoint cash collections with recorded medical treatment histories.

Provide the full code file without any shorthand comments.
🧪 Testing Interval 13: HMO Batch Compilation
•	Action: Compile an insurance claim batch containing 3 separate patient file encounters under the same HMO provider flag.
•	Verification: Ensure the system builds a single unified claim invoice listing items correctly with their corresponding authorization clearance parameters.
________________________________________
Phase 3, Prompt 10: Module 9 - HR & Staff Management
Act as an Enterprise Product Developer. Build the complete HR and Rostering module using React, TailwindCSS, and TypeScript.

[STYLING & UI INSTRUCTIONS - MASTER TRUST BLUE THEME]

Functional Requirements:
1. **Personnel Master Directory**: Create list views displaying hospital staff profiles, emergency contacts, contract parameters, and basic salary properties.
2. **Duty Roster Grid**: Create an interactive weekly calendar grid to easily schedule and map shifts for doctors, nurses, and administrative technicians.
3. **License Expiry Engine**: Build an internal tracking panel with automatic alerts flagging near-term license expirations for clinical staff.

Provide the complete, un-shortened React code file.
🧪 Testing Interval 14: Roster Assignment Test
•	Action: Add a doctor account to a custom night-shift block on the calendar grid view.
•	Verification: Ensure the updated entry persists in the database and updates their account availability status during scheduling operations.
________________________________________
Please copy Phase 3 above and reply "Continue" when you are ready to receive Phase 4 and Phase 5.

 
🖥️ PHASE 4: CLIENT PACKAGING & DESKTOP ANCHORING
Phase 4, Prompt 1: Tauri Native Windows Desktop Client Wrapper Configuration
Act as a Desktop App Engineer. We want to wrap our single React/Next.js frontend application codebase into a fast, native Windows desktop executable wrapper using Tauri.

Requirements:
1. Write a complete, syntactically correct `tauri.conf.json` file.
2. Configure the window properties so it launches as a frameless, native desktop view with default boundaries optimized for standard 1920x1080 display screens.
3. In-Hospital Config: Ensure the production window build routes its default network actions straight to our local server's internal network IP address (e.g., `http://192.168.1.200:3000`).
4. Include security parameters that prevent unauthorized terminal window inspection actions (like disabling developer tools shortcuts in production).

Provide the entire text payload for `tauri.conf.json`.
🧪 Testing Interval 15: Windows Binary Build Output
•	Action: Compile your application frontend project directory using the Tauri toolchain engine (npm run tauri build).
•	Verification: Launch the generated .exe file on a separate client Windows desktop machine. Ensure it renders the localized hospital login layout screens correctly over the LAN.
________________________________________
Phase 4, Prompt 2: Windows Background Service Installation Manifest
Act as a Windows Systems Administration scripting expert. Write a clean automation batch and configuration sequence utilizing `node-windows` or standard `NSSM` (Non-Sucking Service Manager) commands to anchor our local server API executable.

Requirements:
1. Write a robust installation script file (`install_service.bat`) that safely hooks our compiled Node.js backend server instance into the internal Windows Service Registry.
2. Define the execution variables: Set the service name to "Hospital_EMR_Local_Core", configure the Startup Type parameter property to Automatic (Delayed Start to ensure native PostgreSQL services load first), and activate automated crash recovery processing guidelines (Restart service on failure after 10 seconds).
3. Append standard logging pipelines that direct runtime output logs directly to an isolated system file path at `C:/hms/logs/server_runtime.log`.

Provide the clean, absolute script files with zero placeholders.
🧪 Testing Interval 16: Core Operating Installation Checks
•	Action: Execute the service installation file on the host machine and trigger a manual computer reboot cycle.
•	Verification: Once Windows finishes reloading, open the standard services.msc manager window panel. Verify that "Hospital_EMR_Local_Core" reads as running automatically in the background without needing a user login session open.
________________________________________
🖥️ PHASE 5: CENTRAL SAAS SUPERADMIN & DEPLOYMENT MANAGEMENT PORTAL
Phase 5, Prompt 1: Superadmin Multi-Tier Deployment Database Schema
Act as a Senior SaaS Database Architect. Expand our existing PostgreSQL schema to support a centralized visual configuration system, customizable UI themes, and advanced architectural deployment migrations.

Requirements:
1. Build a `tenant_configurations` table linked via foreign key to our master `tenants` table. It must include these explicit columns:
   - `id` UUID PRIMARY KEY DEFAULT gen_random_uuid()
   - `tenant_id` UUID REFERENCES tenants(id) ON DELETE CASCADE
   - `hospital_name` VARCHAR(255) NOT NULL
   - `address` TEXT NOT NULL
   - `phone_number` VARCHAR(50)
   - `logo_url` TEXT 
   - `currency_symbol` VARCHAR(10) DEFAULT '₦'
   - `primary_brand_color` VARCHAR(30) DEFAULT '#2563eb' -- Hex code for Trust Blue
   - `secondary_brand_color` VARCHAR(30) DEFAULT '#10b981' -- Hex code for Emerald Green
   - `ui_theme_class` VARCHAR(50) DEFAULT 'theme-trust-blue'
   - `deployment_mode` VARCHAR(50) DEFAULT 'CLOUD_SAAS' -- ('CLOUD_SAAS', 'OFFLINE_STANDALONE', 'PRIVATE_SUPABASE')
   - `cloud_sync_enabled` BOOLEAN DEFAULT TRUE
   - `private_supabase_url` TEXT DEFAULT NULL
   - `private_supabase_anon_key` TEXT DEFAULT NULL
   - `module_records` BOOLEAN DEFAULT TRUE
   - `module_triage` BOOLEAN DEFAULT TRUE
   - `module_consultation` BOOLEAN DEFAULT TRUE
   - `module_laboratory` BOOLEAN DEFAULT FALSE
   - `module_pharmacy` BOOLEAN DEFAULT FALSE
   - `module_radiology` BOOLEAN DEFAULT FALSE
   - `module_finance_hmo` BOOLEAN DEFAULT FALSE
   - `license_expiration_date` TIMESTAMP WITH TIME ZONE
   - `updated_at` TIMESTAMP WITH TIME ZONE DEFAULT NOW()
2. Write a secure view configuration and row security policy ensuring that only users with the specific metadata role of 'superadmin' inside Supabase Auth can write, delete, or update this table.

Provide the complete SQL script cleanly with zero code shortcuts or omissions. Do not substitute real fields with comments.
🧪 Testing Interval 17: Deployment & Theme Database Validation
•	Action: Run the schema expansion script in your cloud Supabase workspace.
•	Verification: Confirm the primary_brand_color and deployment_mode columns default correctly and accept text updates via SQL testing commands.
________________________________________
Phase 5, Prompt 2: High-Style Superadmin Migration, Custom Theme & Control Portal
Act as an elite UI/UX and Frontend Engineer. Create a stunning, premium SaaS Superadmin Control Dashboard using React, TailwindCSS, and TypeScript.

[STYLING & UI INSTRUCTIONS - TRUST BLUE MASTER THEME]:
- Palette: Backgrounds use light slate (`bg-slate-50`) with pure white floating cards (`bg-white`). Accents use Deep Trust Blue (`bg-blue-600`, `text-blue-600`) and soft zinc details.
- Interactive Elements: Large, soft-bordered containers (`rounded-xl border-slate-200 focus:ring-2 focus:ring-blue-500 transition-all`). Toggles use smoothly animated pills (active: `bg-blue-600` switch mechanics).

Functional Requirements:
1. **Hospital Directory Grid**: Display a master list of all client hospitals, showing their current custom branding, active modules, license countdown timers, and current `Deployment Mode` badge.
2. **Visual Migration Control Deck**: Inside the hospital configuration panel, build a sleek segmented control switch or dropdown titled "Deployment Tier & Routing Architecture":
   - **Option A: Cloud SaaS Mode**: Automatically toggles `cloud_sync_enabled = true` and routes synchronization streams to our master cloud infrastructure.
   - **Option B: Convert to Offline Standalone (One-Off)**: Instantly sets `cloud_sync_enabled = false`, disables remote web portal tracking routes for this tenant, and marks the software license state as permanent offline.
   - **Option C: Migrate to Private Cloud (Unique Supabase)**: Displays two secure input text fields ("Private Project URL" and "Private Project Anon Key"). Saving this mode updates the system configuration coordinates so that this clinic's data daemon routes exclusively to their own dedicated cloud database.
3. **Dynamic Theme Customizer**: Add an input section containing:
   - A color picker/text input for `primary_brand_color` (e.g., #2563eb).
   - A dropdown for predefined UI theme classes (`theme-trust-blue`, `theme-emerald-green`, `theme-charcoal-clinical`, `theme-royal-purple`).
4. **Modular Feature Customizer**: Add interactive toggle pills to turn feature modules (`Laboratory`, `Pharmacy`, `Radiology`, etc.) on or off instantly.
5. Connect all input fields to save data changes directly to the cloud Supabase database backend.

Provide the complete, un-shortened React code file with full styling implementations.
🧪 Testing Interval 18: Visual Architecture & Theme Switching Test
•	Action: Open your cloud Superadmin panel, select a test hospital, choose "Convert to Offline Standalone", update the primary_brand_color to a purple hex value (#7c3aed), and save.
•	Verification: Query the tenant_configurations table in your database and verify that cloud_sync_enabled drops to false, the color string parses as #7c3aed, and the deployment_mode updates to OFFLINE_STANDALONE.
________________________________________
Phase 5, Prompt 3: Sync Daemon Downward Architectural & Theme Migration Listener
Act as a Principal Backend Core Developer. Update our local server's background synchronization script (`syncDaemon.ts`) to intercept architectural state modifications and theme customization profiles downloaded from the cloud panel.

Requirements:
1. The sync loop must query the central `tenant_configurations` workspace using its local hardcoded `GLOBAL_SAAS_TENANT_ID`.
2. **SaaS to Offline Pivot Handling**: If the downloaded configuration shows `deployment_mode` has been changed to `OFFLINE_STANDALONE`, the script must write the new settings to `C:/hms/config/clinic_profile.json` locally, flip its internal runtime sync flag to false, gracefully terminate cloud synchronization threads, and print a warning message log to the local server console interface.
3. **Private Cloud Migration Handling**: If the downloaded configuration shows `deployment_mode` is now `PRIVATE_SUPABASE`, the script must update the local JSON config file variables with the new `private_supabase_url` and `private_supabase_anon_key` fields. It must then execute a local database transaction to set `is_synced = false` across all historical rows, forcing the background sync worker to securely re-sync the hospital's entire database archive up to their new, unique cloud project.
4. **Dynamic Theme Value Caching**: Ensure the script pulls down the modified `primary_brand_color`, `secondary_brand_color`, and `ui_theme_class` parameters, overwriting the dynamic theme properties in `C:/hms/config/clinic_profile.json` so they load into client desktop views instantly offline.

Provide the complete file configuration formats and validation logic cleanly without shorthand placeholders or implementation omissions.
🧪 Testing Interval 19: Cloud-Triggered Architectural Decoupling & Theme Cache Test
•	Action: Toggle a test clinic from "SaaS" to "Offline Standalone" and change their theme to a wine color code (#9d174d) using your central cloud Superadmin portal. Wait 30 seconds for the local server to ping the network.
•	Verification: Confirm that the local server terminal prints an isolation alert, updates the clinic_profile.json file block with the color code #9d174d, shuts down its own upload loops, and cuts off remote browser logins immediately.
________________________________________
Phase 5, Prompt 4: Local Offline Configuration Console (For On-Site Setups)
Act as a Senior System Integration Developer and Security Engineer. Build an isolated, secure Local Administrative Setup Console built directly into our local Node.js/Express backend server executable. This tool allows us to onboard, configure, and customize styling themes for a new hospital completely offline when setting up their Core i5 computer inside their building without internet access.

Requirements:
1. **The Secure Offline Access Gate**: When the local server boots up in "Initial Unconfigured Mode" (meaning no valid `clinic_profile.json` file exists on disk), serve a clean, local web-based login screen accessible over the LAN via `http://localhost:3000/setup` or `http://192.168.1`.
2. **Master Token Verification**: Allow a technician to unlock this setup view completely offline by entering a hardcoded Master Superadmin Passphrase or checking an offline cryptographic registration string key.
3. **The On-Premise Customization Form**: Once unlocked, render a local, beautiful HTML configuration form (matching our universal styling system rules) allowing the technician to manually enter:
   - Hospital Custom Identity: Name, Address, Contact Phone, and Local Base Currency Symbol.
   - Branding Image Upload: A file input tool that accepts a `.png` logo file directly from a USB flash drive and writes it natively to the server's local hard drive path at `C:/hms/assets/logo.png`.
   - Feature Module Checkboxes: Explicit checkboxes to activate or deactivate the local sidebar visibility parameters (`Laboratory`, `Pharmacy`, etc.) completely offline.
   - Custom Theme Values: Native color picker inputs and dropdown configuration fields to define the hospital's specific `primary_brand_color` and `ui_theme_class` locally without an internet connection.
   - Initial Architecture Tier Status: A selector to choose whether this machine runs as a pure standalone offline system (`cloud_sync_enabled: false`) or as a connected cloud client (`cloud_sync_enabled: true`).
4. **Local Configuration Compilation**: Upon form submission, compile these parameters into a valid structure and save them locally to `C:/hms/config/clinic_profile.json`. Run an internal database procedure to build and optimize all local PostgreSQL tables immediately completely offline.

Provide the complete file creation frameworks, form layouts, and file system writing operations cleanly without using shorthand code shortcuts or placeholders.
🧪 Testing Interval 20: Pure Offline Deployment & Theme Validation
•	Action: Disconnect the server machine from the internet entirely. Wipe the local config file clinic_profile.json to simulate a brand-new setup. Navigate a browser to http://localhost:3000/setup.
•	Verification: Verify that the system opens the local setup console. Authenticate using your master passphrase, configure "Apex Clinic", set Pharmacy Module = True, Cloud Sync = False, choose an amber theme palette (#d97706), upload a sample image file from a flash drive, and click Save. Confirm that the system builds the file on disk, initializes the local PostgreSQL tables, and immediately locks into displaying only "Apex Clinic" styled with your selected amber branding completely offline.
________________________________________
Please copy Phase 4 and Phase 5 above and reply "Continue" when you are ready to receive the final section (Phase 6 and Phase 7).

 
🛡️ PHASE 6: PRODUCTION HARDENING & SECURITY SYSTEMS
Phase 6, Prompt 1: Anti-Clock-Tampering Guard Middleware
Act as a Senior Backend Security Engineer. Implement the programmatic runtime data interceptor to prevent system clock fraud inside our local hospital server environment.

Requirements:
1. Write a reusable helper function or middleware block for our Node.js PostgreSQL pool that executes immediately before any `INSERT` or `UPDATE` action hitting patient, encounter, clinical log, or checkout billing records.
2. The controller must fetch the maximum `created_at` or `updated_at` timestamp currently recorded in that table's history log.
3. Compare the server hardware's live runtime clock against this maximum historic value. If the server machine's clock reads a time that is earlier than past entries (indicating an operator modified the Windows system date manually backwards to forge an offline license key expiration timeline), immediately block the transaction.
4. Flag a global internal safety state variable to active, freeze all standard UI processing pathways, and trigger a permanent administrative intercept overlay screen across all client desktops reading: "CRITICAL SECURITY EXCEPTION: System Clock Manipulation Detected. Terminal Locked."

Provide the full, functional logic implementation with strict transactional database queries and zero shorthand comments.
🧪 Testing Interval 21: Clock Tampering Defenses
•	Action: Explicitly write a test encounter row into the local database dated June 6, 2026. Manually change your host Windows operating system clock parameters backward to January 1, 2025. Attempt to save a new triage vitals record payload.
•	Verification: Confirm that the local server intercepts the action, rejects the database update block, and logs a severe operational integrity alarm in the terminal instance.
________________________________________
Phase 6, Prompt 2: Database Migration & Schema Alterations Engine
Act as a Devops Automation Engineer. Write a background database migration framework inside our local node server system to safely deploy schema structural changes completely code-free.

Requirements:
1. Build an internal system checker module that targets an isolated, centralized tracking dictionary hosted on our cloud Supabase platform or distributed via an administrative update array.
2. On every successful connection sync run, evaluate the local system's version key schema against the remote requirements model.
3. If a version mismatch is identified (e.g., your master SaaS architecture introduces a new configuration field like a `middle_name` row element or a new billing tax parameter variable), download the corresponding raw SQL schema string payload.
4. Execute an automated execution block running programmatic `ALTER TABLE` commands directly against the local on-premise PostgreSQL database pool instance inside a safe isolation wrapper.
5. Update the local system version cache tracking variables upon successful execution to ensure that upcoming operational processing sequences run smoothly without crashing due to table mismatches.

Provide the complete automation code.
🧪 Testing Interval 22: Code-Free Schema Field Deployment
•	Action: Add a test column addition command to your master tracking node schema string parameters via the cloud dashboard profile.
•	Verification: Ensure that within its automated sync pass, the local server terminal pulls down the query configuration details, runs the alteration transaction natively against your local Postgres installation, and adds the new column completely unassisted.
________________________________________
🖥️ PHASE 7: PRODUCTION COMPILATION & PACKAGING
Phase 7, Prompt 1: Electron Desktop Production Packaging Script
Act as an Expert Systems Packager. If using Electron as an alternative client presentation wrapper for our shared React application build, write a complete, production-ready packaging script.

Requirements:
1. Write a complete, syntactically correct `electron-builder.yml` configuration manifest file.
2. Target native Windows distribution environments, outputting both a lightweight setup binary (`.exe`) and an unpackaged portable directory build.
3. Embed parameters ensuring that the desktop frontend execution window launches with hardware acceleration parameters active, disables default context right-click debugging panels, and enforces direct network route targeting to our local host machine's API port (`http://192.168.1.200:3000`).

Provide the complete text payload code cleanly.
________________________________________
Phase 7, Prompt 2: Windows Background Service Installation Manifest
Act as a Windows Systems Administration scripting expert. Write a clean automation batch and configuration sequence utilizing `node-windows` or standard `NSSM` (Non-Sucking Service Manager) commands to anchor our local server API executable.

Requirements:
1. Write a robust installation script file (`install_service.bat`) that safely hooks our compiled Node.js backend server instance into the internal Windows Service Registry.
2. Define the execution variables: Set the service name to "Hospital_EMR_Local_Core", configure the Startup Type parameter property to Automatic (Delayed Start to ensure native PostgreSQL services load first), and activate automated crash recovery processing guidelines (Restart service on failure after 10 seconds).
3. Append standard logging pipelines that direct runtime output logs directly to an isolated system file path at `C:/hms/logs/server_runtime.log`.

Provide the clean, absolute script files with zero placeholders.
🧪 Testing Interval 23: Core Operating Installation Checks
•	Action: Execute the service installation file on the host machine and trigger a manual computer reboot cycle.
•	Verification: Once Windows finishes reloading, open the standard services.msc manager window panel. Verify that "Hospital_EMR_Local_Core" reads as running automatically in the background without needing a user login session open.
________________________________________
Your comprehensive playbook is now completely compiled. You can save these components directly into your local workspace.
How would you like to handle your very first runtime verification using your database schema files [INDEX]?

 
 
