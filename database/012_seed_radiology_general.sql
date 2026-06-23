-- Seed radiology and general/services inventory
-- Tenant: 411d6eb9-5885-4abf-a815-46c5387f4d6a

-- ── Radiology Items ──
INSERT INTO inventory_items (id, tenant_id, drug_name, batch_number, stock_count, reorder_level, expiry_date, supplier, category, price, cost_price, amount_type) VALUES
(gen_random_uuid(), '411d6eb9-5885-4abf-a815-46c5387f4d6a', 'X-Ray Contrast Medium (Iohexol)', 'XR-CM-001', 15, 5, '2027-04-15', 'RadSupply Co', 'radiology', 25000.00, 18000.00, 'mL'),
(gen_random_uuid(), '411d6eb9-5885-4abf-a815-46c5387f4d6a', 'X-Ray Film 14x17 (100pk)', 'XR-FLM-002', 10, 5, '2027-06-20', 'MediRad Ltd', 'radiology', 35000.00, 25000.00, 'units'),
(gen_random_uuid(), '411d6eb9-5885-4abf-a815-46c5387f4d6a', 'MRI Contrast Agent (Gadolinium)', 'MRI-CA-003', 8, 3, '2026-11-10', 'RadSupply Co', 'radiology', 55000.00, 42000.00, 'mL'),
(gen_random_uuid(), '411d6eb9-5885-4abf-a815-46c5387f4d6a', 'Ultrasound Gel (5L)', 'US-GEL-004', 20, 5, '2027-08-30', 'DiagRad Supplies', 'radiology', 8000.00, 5000.00, 'L'),
(gen_random_uuid(), '411d6eb9-5885-4abf-a815-46c5387f4d6a', 'ECG Electrodes (50pk)', 'ECG-EL-005', 25, 10, '2027-02-28', 'MediRad Ltd', 'radiology', 6000.00, 3800.00, 'units'),
(gen_random_uuid(), '411d6eb9-5885-4abf-a815-46c5387f4d6a', 'ECG Paper Roll (100pk)', 'ECG-PR-006', 12, 5, '2027-05-15', 'DiagRad Supplies', 'radiology', 12000.00, 8500.00, 'units'),
(gen_random_uuid(), '411d6eb9-5885-4abf-a815-46c5387f4d6a', 'CT Scan Contrast (Iopamidol)', 'CT-CON-007', 10, 3, '2026-12-20', 'RadSupply Co', 'radiology', 45000.00, 32000.00, 'mL'),
(gen_random_uuid(), '411d6eb9-5885-4abf-a815-46c5387f4d6a', 'Barium Sulphate Suspension', 'BAR-SS-008', 18, 6, '2027-07-10', 'MediRad Ltd', 'radiology', 15000.00, 10500.00, 'L'),
(gen_random_uuid(), '411d6eb9-5885-4abf-a815-46c5387f4d6a', 'Radiology Cassette (CR)', 'CR-CAS-009', 6, 3, '2027-09-05', 'DiagRad Supplies', 'radiology', 80000.00, 60000.00, 'units'),
(gen_random_uuid(), '411d6eb9-5885-4abf-a815-46c5387f4d6a', 'Lead Apron (Diagnostic)', 'LD-APR-010', 4, 2, '2027-10-01', 'SafetyMed Ltd', 'radiology', 95000.00, 75000.00, 'units'),
(gen_random_uuid(), '411d6eb9-5885-4abf-a815-46c5387f4d6a', 'X-Ray Developer Solution (5L)', 'XR-DEV-011', 8, 3, '2026-10-15', 'MediRad Ltd', 'radiology', 18000.00, 12500.00, 'L'),
(gen_random_uuid(), '411d6eb9-5885-4abf-a815-46c5387f4d6a', 'X-Ray Fixer Solution (5L)', 'XR-FIX-012', 8, 3, '2026-10-15', 'MediRad Ltd', 'radiology', 16000.00, 11000.00, 'L'),
(gen_random_uuid(), '411d6eb9-5885-4abf-a815-46c5387f4d6a', 'Ultrasound Probe Cover (100pk)', 'US-PC-013', 30, 10, '2027-03-20', 'DiagRad Supplies', 'radiology', 5000.00, 3000.00, 'units'),
(gen_random_uuid(), '411d6eb9-5885-4abf-a815-46c5387f4d6a', 'ECG Lead Wires Set', 'ECG-LW-014', 10, 5, '2027-01-30', 'MediRad Ltd', 'radiology', 22000.00, 16000.00, 'units'),
(gen_random_uuid(), '411d6eb9-5885-4abf-a815-46c5387f4d6a', 'CT Scan Sedation Kit', 'CT-SED-015', 15, 5, '2026-09-25', 'RadSupply Co', 'radiology', 30000.00, 22000.00, 'units'),
(gen_random_uuid(), '411d6eb9-5885-4abf-a815-46c5387f4d6a', 'Mammography Compression Paddle', 'MMG-CP-016', 3, 2, '2027-11-10', 'DiagRad Supplies', 'radiology', 65000.00, 48000.00, 'units'),
(gen_random_uuid(), '411d6eb9-5885-4abf-a815-46c5387f4d6a', 'Fluoroscopy Contrast Medium', 'FLU-CM-017', 12, 4, '2027-04-01', 'RadSupply Co', 'radiology', 38000.00, 28000.00, 'mL'),
(gen_random_uuid(), '411d6eb9-5885-4abf-a815-46c5387f4d6a', 'C-Arm Sterile Drape (25pk)', 'CA-DRP-018', 20, 8, '2027-05-18', 'SafetyMed Ltd', 'radiology', 7500.00, 5000.00, 'units'),
(gen_random_uuid(), '411d6eb9-5885-4abf-a815-46c5387f4d6a', 'Radiology CD/DVD Media (50pk)', 'RAD-CD-019', 15, 5, '2027-12-01', 'MediRad Ltd', 'radiology', 4000.00, 2500.00, 'units'),
(gen_random_uuid(), '411d6eb9-5885-4abf-a815-46c5387f4d6a', 'PET-CT Tracer (FDG)', 'PET-FDG-020', 5, 2, '2026-08-15', 'RadSupply Co', 'radiology', 120000.00, 95000.00, 'mL');

-- ── General / Services Items (consultation, procedures, maternity, admission, miscellaneous) ──
INSERT INTO inventory_items (id, tenant_id, drug_name, batch_number, stock_count, reorder_level, expiry_date, supplier, category, price, cost_price, amount_type) VALUES
(gen_random_uuid(), '411d6eb9-5885-4abf-a815-46c5387f4d6a', 'General Consultation (New)', 'N/A', 9999, 100, NULL, 'Consultation', 'general', 5000.00, 2000.00, 'consultation'),
(gen_random_uuid(), '411d6eb9-5885-4abf-a815-46c5387f4d6a', 'General Consultation (Follow-up)', 'N/A', 9999, 100, NULL, 'Consultation', 'general', 3000.00, 1000.00, 'consultation'),
(gen_random_uuid(), '411d6eb9-5885-4abf-a815-46c5387f4d6a', 'Specialist Consultation', 'N/A', 9999, 100, NULL, 'Consultation', 'general', 10000.00, 5000.00, 'consultation'),
(gen_random_uuid(), '411d6eb9-5885-4abf-a815-46c5387f4d6a', 'Surgical Procedure (Minor)', 'N/A', 999, 50, NULL, 'Procedures', 'general', 50000.00, 30000.00, 'procedure'),
(gen_random_uuid(), '411d6eb9-5885-4abf-a815-46c5387f4d6a', 'Surgical Procedure (Major)', 'N/A', 999, 50, NULL, 'Procedures', 'general', 200000.00, 120000.00, 'procedure'),
(gen_random_uuid(), '411d6eb9-5885-4abf-a815-46c5387f4d6a', 'Wound Dressing', 'N/A', 9999, 100, NULL, 'Procedures', 'general', 8000.00, 4000.00, 'procedure'),
(gen_random_uuid(), '411d6eb9-5885-4abf-a815-46c5387f4d6a', 'Plaster Cast Application', 'N/A', 9999, 50, NULL, 'Procedures', 'general', 15000.00, 8000.00, 'procedure'),
(gen_random_uuid(), '411d6eb9-5885-4abf-a815-46c5387f4d6a', 'Antenatal Care (Booking)', 'N/A', 9999, 100, NULL, 'Maternity', 'general', 15000.00, 8000.00, 'maternity'),
(gen_random_uuid(), '411d6eb9-5885-4abf-a815-46c5387f4d6a', 'Antenatal Care (Follow-up)', 'N/A', 9999, 100, NULL, 'Maternity', 'general', 5000.00, 2000.00, 'maternity'),
(gen_random_uuid(), '411d6eb9-5885-4abf-a815-46c5387f4d6a', 'Normal Delivery', 'N/A', 999, 50, NULL, 'Maternity', 'general', 80000.00, 50000.00, 'maternity'),
(gen_random_uuid(), '411d6eb9-5885-4abf-a815-46c5387f4d6a', 'Caesarean Section', 'N/A', 999, 30, NULL, 'Maternity', 'general', 250000.00, 150000.00, 'maternity'),
(gen_random_uuid(), '411d6eb9-5885-4abf-a815-46c5387f4d6a', 'Maternity Ward (Per Night)', 'N/A', 9999, 100, NULL, 'Maternity', 'general', 15000.00, 8000.00, 'maternity'),
(gen_random_uuid(), '411d6eb9-5885-4abf-a815-46c5387f4d6a', 'General Ward Admission (Per Night)', 'N/A', 9999, 100, NULL, 'Admission', 'general', 10000.00, 5000.00, 'admission'),
(gen_random_uuid(), '411d6eb9-5885-4abf-a815-46c5387f4d6a', 'Private Ward Admission (Per Night)', 'N/A', 9999, 100, NULL, 'Admission', 'general', 25000.00, 15000.00, 'admission'),
(gen_random_uuid(), '411d6eb9-5885-4abf-a815-46c5387f4d6a', 'ICU Admission (Per Night)', 'N/A', 9999, 50, NULL, 'Admission', 'general', 50000.00, 30000.00, 'admission'),
(gen_random_uuid(), '411d6eb9-5885-4abf-a815-46c5387f4d6a', 'Folder Activation Fee', 'N/A', 9999, 100, NULL, 'Miscellaneous', 'general', 5000.00, 500.00, 'miscellaneous'),
(gen_random_uuid(), '411d6eb9-5885-4abf-a815-46c5387f4d6a', 'Medical Report', 'N/A', 9999, 100, NULL, 'Miscellaneous', 'general', 10000.00, 2000.00, 'miscellaneous'),
(gen_random_uuid(), '411d6eb9-5885-4abf-a815-46c5387f4d6a', 'ECG Service', 'N/A', 9999, 50, NULL, 'Procedures', 'general', 15000.00, 8000.00, 'procedure'),
(gen_random_uuid(), '411d6eb9-5885-4abf-a815-46c5387f4d6a', 'Nebulization Treatment', 'N/A', 9999, 100, NULL, 'Procedures', 'general', 5000.00, 2000.00, 'procedure'),
(gen_random_uuid(), '411d6eb9-5885-4abf-a815-46c5387f4d6a', 'Immunization Service', 'N/A', 9999, 100, NULL, 'Miscellaneous', 'general', 8000.00, 4000.00, 'miscellaneous');
