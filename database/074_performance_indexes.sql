-- 074_performance_indexes.sql
-- Performance indexes for Sretan HMS / EMR.
-- All statements are idempotent (IF NOT EXISTS) and safe to re-run.
--
-- NOTE: migrations are executed one file per query, so this file runs inside a
-- single implicit transaction and cannot use CREATE INDEX CONCURRENTLY. On a
-- large production table, run the equivalent statements manually as
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS ... (autocommit, one at a time)
-- during a maintenance window to avoid long write locks. On a fresh/small
-- database the plain form below is fine.

-- ---------------------------------------------------------------------------
-- Patients
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_patients_tenant_created  ON patients (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_patients_tenant_status   ON patients (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_patients_tenant_folder   ON patients (tenant_id, folder_activated);
CREATE INDEX IF NOT EXISTS idx_patients_trgm_name       ON patients USING gin (full_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_patients_trgm_phone      ON patients USING gin (phone gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- Encounters (the most-joined table)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_encounters_tenant_patient ON encounters (tenant_id, patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_encounters_patient        ON encounters (patient_id);
CREATE INDEX IF NOT EXISTS idx_encounters_staff          ON encounters (staff_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_encounters_tenant_created ON encounters (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_encounters_department     ON encounters (department_id);

-- ---------------------------------------------------------------------------
-- Vitals
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_vitals_encounter   ON vitals (encounter_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vitals_created     ON vitals (created_at);
CREATE INDEX IF NOT EXISTS idx_vitals_recorded_by ON vitals (recorded_by);

-- ---------------------------------------------------------------------------
-- Prescriptions
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_prescriptions_encounter   ON prescriptions (encounter_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_tenant_stat ON prescriptions (tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prescriptions_tenant_paid ON prescriptions (tenant_id, is_paid);

-- ---------------------------------------------------------------------------
-- Lab orders / results
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_lab_orders_encounter      ON lab_orders (encounter_id);
CREATE INDEX IF NOT EXISTS idx_lab_orders_tenant_status  ON lab_orders (tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lab_orders_tenant_paid    ON lab_orders (tenant_id, is_paid);
CREATE INDEX IF NOT EXISTS idx_lab_orders_read           ON lab_orders (doctor_read_at);
CREATE INDEX IF NOT EXISTS idx_lab_results_order         ON lab_results (lab_order_id);
CREATE INDEX IF NOT EXISTS idx_lab_results_tenant_status ON lab_results (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_lab_test_catalog_trgm     ON lab_test_catalog USING gin (name gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- Radiology
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_radiology_orders_enc     ON radiology_orders (encounter_id);
CREATE INDEX IF NOT EXISTS idx_radiology_orders_tenant  ON radiology_orders (tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_radiology_orders_paid    ON radiology_orders (tenant_id, is_paid);

-- ---------------------------------------------------------------------------
-- Admissions / bed charges
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_admissions_tenant_status  ON admissions (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_admissions_patient_status ON admissions (patient_id, status);
CREATE INDEX IF NOT EXISTS idx_admissions_paid           ON admissions (tenant_id, is_paid);

-- ---------------------------------------------------------------------------
-- Inventory (hot fuzzy lookups + exact service keys)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_inventory_tenant_cat ON inventory_items (tenant_id, category, is_active);
CREATE INDEX IF NOT EXISTS idx_inventory_drug_name  ON inventory_items (drug_name);
CREATE INDEX IF NOT EXISTS idx_inventory_trgm_name  ON inventory_items USING gin (drug_name gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- Payments
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_payments_patient_status      ON payments (patient_id, status);
CREATE INDEX IF NOT EXISTS idx_payments_tenant_status_created ON payments (tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_items_convert        ON payment_items (service_type, is_converted);

-- ---------------------------------------------------------------------------
-- Appointments / visits
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_appointments_doctor_date ON appointments (tenant_id, doctor_id, appointment_date, status);
CREATE INDEX IF NOT EXISTS idx_appointments_patient     ON appointments (patient_id);
CREATE INDEX IF NOT EXISTS idx_visits_tenant_patient    ON visits (tenant_id, patient_id, status, created_at DESC);

-- ---------------------------------------------------------------------------
-- Nurse module
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_nurse_notes_patient       ON nurse_notes (patient_id, note_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_treatments_patient        ON treatments (patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_treatment_doses_treatment ON treatment_doses (treatment_id);
CREATE INDEX IF NOT EXISTS idx_treatment_doses_session   ON treatment_doses (session_id);
CREATE INDEX IF NOT EXISTS idx_fluid_balance_patient     ON fluid_balance (patient_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_fluid_balance_session     ON fluid_balance (session_id);

-- ---------------------------------------------------------------------------
-- Audit log
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_audit_logs_record         ON audit_logs (table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_created ON audit_logs (tenant_id, created_at DESC);
