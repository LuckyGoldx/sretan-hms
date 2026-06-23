-- Seed inventory: 20 pharmacy items + 20 lab items with full data
-- Tenant: 411d6eb9-5885-4abf-a815-46c5387f4d6a

DELETE FROM inventory_items;

-- ── Pharmacy Items ──
INSERT INTO inventory_items (id, tenant_id, drug_name, batch_number, stock_count, reorder_level, expiry_date, supplier, category, price, cost_price, amount_type) VALUES
(gen_random_uuid(), '411d6eb9-5885-4abf-a815-46c5387f4d6a', 'Amoxicillin 500mg', 'AMX-0626-A01', 450, 80, '2027-06-01', 'PharmaCorp Ltd', 'pharmacy', 500.00, 350.00, 'units'),
(gen_random_uuid(), '411d6eb9-5885-4abf-a815-46c5387f4d6a', 'Paracetamol 500mg', 'PAR-0626-B02', 800, 150, '2027-05-15', 'MediSupply Co', 'pharmacy', 200.00, 120.00, 'units'),
(gen_random_uuid(), '411d6eb9-5885-4abf-a815-46c5387f4d6a', 'Diclofenac 50mg', 'DIC-0626-C03', 300, 60, '2026-12-20', 'PharmaCorp Ltd', 'pharmacy', 400.00, 250.00, 'units'),
(gen_random_uuid(), '411d6eb9-5885-4abf-a815-46c5387f4d6a', 'Metformin 850mg', 'MTF-0626-D04', 250, 50, '2027-03-10', 'HealthFirst Pharma', 'pharmacy', 300.00, 180.00, 'units'),
(gen_random_uuid(), '411d6eb9-5885-4abf-a815-46c5387f4d6a', 'Omeprazole 20mg', 'OME-0626-E05', 500, 100, '2027-08-22', 'MediSupply Co', 'pharmacy', 450.00, 280.00, 'units'),
(gen_random_uuid(), '411d6eb9-5885-4abf-a815-46c5387f4d6a', 'Ciprofloxacin 500mg', 'CIP-0626-F06', 180, 40, '2026-11-05', 'GlobalMed Distributors', 'pharmacy', 600.00, 400.00, 'units'),
(gen_random_uuid(), '411d6eb9-5885-4abf-a815-46c5387f4d6a', 'Artemether/Lumefantrine 80/480mg', 'AL-0626-G07', 120, 30, '2027-01-18', 'GlobalMed Distributors', 'pharmacy', 800.00, 550.00, 'units'),
(gen_random_uuid(), '411d6eb9-5885-4abf-a815-46c5387f4d6a', 'Amlodipine 5mg', 'AML-0626-H08', 350, 70, '2027-07-02', 'HealthFirst Pharma', 'pharmacy', 350.00, 200.00, 'units'),
(gen_random_uuid(), '411d6eb9-5885-4abf-a815-46c5387f4d6a', 'Atorvastatin 10mg', 'ATV-0626-I09', 220, 45, '2027-04-14', 'PharmaCorp Ltd', 'pharmacy', 500.00, 320.00, 'units'),
(gen_random_uuid(), '411d6eb9-5885-4abf-a815-46c5387f4d6a', 'Losartan 50mg', 'LOS-0626-J10', 280, 55, '2027-09-30', 'MediSupply Co', 'pharmacy', 400.00, 250.00, 'units'),
(gen_random_uuid(), '411d6eb9-5885-4abf-a815-46c5387f4d6a', 'Ibuprofen 400mg', 'IBU-0626-K11', 600, 120, '2027-02-10', 'HealthFirst Pharma', 'pharmacy', 250.00, 150.00, 'units'),
(gen_random_uuid(), '411d6eb9-5885-4abf-a815-46c5387f4d6a', 'Ceftriaxone 1g Injection', 'CTX-0626-L12', 90, 25, '2026-10-15', 'GlobalMed Distributors', 'pharmacy', 1200.00, 850.00, 'units'),
(gen_random_uuid(), '411d6eb9-5885-4abf-a815-46c5387f4d6a', 'Metronidazole 200mg', 'MTZ-0626-M13', 400, 80, '2027-06-28', 'PharmaCorp Ltd', 'pharmacy', 300.00, 180.00, 'units'),
(gen_random_uuid(), '411d6eb9-5885-4abf-a815-46c5387f4d6a', 'Salbutamol Inhaler 100mcg', 'SAL-0626-N14', 65, 20, '2026-12-01', 'MediSupply Co', 'pharmacy', 2500.00, 1800.00, 'units'),
(gen_random_uuid(), '411d6eb9-5885-4abf-a815-46c5387f4d6a', 'Insulin Glargine 100IU/mL', 'INS-0626-O15', 40, 10, '2027-03-05', 'GlobalMed Distributors', 'pharmacy', 5000.00, 3800.00, 'mL'),
(gen_random_uuid(), '411d6eb9-5885-4abf-a815-46c5387f4d6a', 'Furosemide 40mg', 'FUR-0626-P16', 320, 60, '2027-05-20', 'HealthFirst Pharma', 'pharmacy', 350.00, 200.00, 'units'),
(gen_random_uuid(), '411d6eb9-5885-4abf-a815-46c5387f4d6a', 'Digoxin 0.25mg', 'DGX-0626-Q17', 150, 30, '2026-09-18', 'PharmaCorp Ltd', 'pharmacy', 400.00, 280.00, 'units'),
(gen_random_uuid(), '411d6eb9-5885-4abf-a815-46c5387f4d6a', 'Warfarin 5mg', 'WRF-0626-R18', 200, 40, '2027-08-12', 'MediSupply Co', 'pharmacy', 450.00, 300.00, 'units'),
(gen_random_uuid(), '411d6eb9-5885-4abf-a815-46c5387f4d6a', 'Clopidogrel 75mg', 'CLP-0626-S19', 170, 35, '2027-01-25', 'HealthFirst Pharma', 'pharmacy', 600.00, 420.00, 'units'),
(gen_random_uuid(), '411d6eb9-5885-4abf-a815-46c5387f4d6a', 'Prednisolone 5mg', 'PRD-0626-T20', 380, 75, '2027-04-08', 'GlobalMed Distributors', 'pharmacy', 250.00, 150.00, 'units');

-- ── Lab Items ──
INSERT INTO inventory_items (id, tenant_id, drug_name, batch_number, stock_count, reorder_level, expiry_date, supplier, category, price, cost_price, amount_type) VALUES
(gen_random_uuid(), '411d6eb9-5885-4abf-a815-46c5387f4d6a', 'CBC Reagent Kit', 'CBC-LAB-001', 25, 10, '2027-02-15', 'DiagLab Supplies Ltd', 'lab', 15000.00, 10000.00, 'tests'),
(gen_random_uuid(), '411d6eb9-5885-4abf-a815-46c5387f4d6a', 'Malaria RDT Cassettes (25pk)', 'MAL-LAB-002', 40, 20, '2026-12-10', 'Global Health Supply', 'lab', 8000.00, 5500.00, 'units'),
(gen_random_uuid(), '411d6eb9-5885-4abf-a815-46c5387f4d6a', 'Urine Dipsticks (100pk)', 'URN-LAB-003', 15, 10, '2027-05-20', 'LabTech Corporation', 'lab', 12000.00, 8500.00, 'units'),
(gen_random_uuid(), '411d6eb9-5885-4abf-a815-46c5387f4d6a', 'Blood Lancets (200pk)', 'LAN-LAB-004', 50, 15, '2026-11-05', 'MedLab Supplies Inc', 'lab', 5000.00, 3200.00, 'units'),
(gen_random_uuid(), '411d6eb9-5885-4abf-a815-46c5387f4d6a', 'Microscope Slides (box of 50)', 'SLD-LAB-005', 22, 10, '2027-08-30', 'OptiLab Instruments', 'lab', 4000.00, 2500.00, 'units'),
(gen_random_uuid(), '411d6eb9-5885-4abf-a815-46c5387f4d6a', 'EDTA Tubes (100pk)', 'EDTA-LAB-006', 35, 15, '2027-03-12', 'BioMed Supplies Co', 'lab', 6000.00, 4200.00, 'units'),
(gen_random_uuid(), '411d6eb9-5885-4abf-a815-46c5387f4d6a', 'HIV Test Kits (50pk)', 'HIV-LAB-007', 18, 12, '2026-10-22', 'Global Health Supply', 'lab', 25000.00, 18000.00, 'units'),
(gen_random_uuid(), '411d6eb9-5885-4abf-a815-46c5387f4d6a', 'Centrifuge Tubes (50pk)', 'CT-LAB-008', 30, 15, '2027-07-15', 'LabTech Corporation', 'lab', 8000.00, 5500.00, 'units'),
(gen_random_uuid(), '411d6eb9-5885-4abf-a815-46c5387f4d6a', 'Nitrile Gloves (box of 100)', 'GLV-LAB-009', 12, 10, '2027-01-28', 'MedLab Supplies Inc', 'lab', 7000.00, 4800.00, 'units'),
(gen_random_uuid(), '411d6eb9-5885-4abf-a815-46c5387f4d6a', 'Control Serum Level 1', 'CS-LAB-010', 8, 5, '2026-09-15', 'DiagLab Supplies Ltd', 'lab', 12000.00, 8500.00, 'mL'),
(gen_random_uuid(), '411d6eb9-5885-4abf-a815-46c5387f4d6a', 'Glucose Test Strips (50pk)', 'GLU-LAB-011', 20, 10, '2027-04-01', 'BioMed Supplies Co', 'lab', 10000.00, 7000.00, 'units'),
(gen_random_uuid(), '411d6eb9-5885-4abf-a815-46c5387f4d6a', 'Cholesterol Test Strips (25pk)', 'CHL-LAB-012', 15, 8, '2026-12-18', 'DiagLab Supplies Ltd', 'lab', 15000.00, 10500.00, 'units'),
(gen_random_uuid(), '411d6eb9-5885-4abf-a815-46c5387f4d6a', 'Urea Nitrogen Reagent 500mL', 'UREA-LAB-013', 10, 5, '2027-06-10', 'OptiLab Instruments', 'lab', 18000.00, 13000.00, 'mL'),
(gen_random_uuid(), '411d6eb9-5885-4abf-a815-46c5387f4d6a', 'Creatinine Reagent Kit', 'CRT-LAB-014', 8, 4, '2027-02-28', 'LabTech Corporation', 'lab', 20000.00, 14500.00, 'tests'),
(gen_random_uuid(), '411d6eb9-5885-4abf-a815-46c5387f4d6a', 'Electrolyte Reagent Pack', 'ELY-LAB-015', 6, 3, '2026-11-10', 'BioMed Supplies Co', 'lab', 25000.00, 18000.00, 'tests'),
(gen_random_uuid(), '411d6eb9-5885-4abf-a815-46c5387f4d6a', 'Coagulation Test Tubes (50pk)', 'COAG-LAB-016', 25, 10, '2027-05-05', 'Global Health Supply', 'lab', 9000.00, 6200.00, 'units'),
(gen_random_uuid(), '411d6eb9-5885-4abf-a815-46c5387f4d6a', 'ESR Test Tubes (100pk)', 'ESR-LAB-017', 20, 10, '2027-09-20', 'MedLab Supplies Inc', 'lab', 5000.00, 3500.00, 'units'),
(gen_random_uuid(), '411d6eb9-5885-4abf-a815-46c5387f4d6a', 'Throat Swab Kits (50pk)', 'SWB-LAB-018', 30, 12, '2027-03-25', 'DiagLab Supplies Ltd', 'lab', 6000.00, 4000.00, 'units'),
(gen_random_uuid(), '411d6eb9-5885-4abf-a815-46c5387f4d6a', 'Sputum Collection Cups (50pk)', 'SPT-LAB-019', 40, 15, '2027-07-08', 'OptiLab Instruments', 'lab', 3000.00, 1800.00, 'units'),
(gen_random_uuid(), '411d6eb9-5885-4abf-a815-46c5387f4d6a', 'Lancets Disposable (100pk)', 'LCN-LAB-020', 35, 15, '2027-01-15', 'LabTech Corporation', 'lab', 4000.00, 2500.00, 'units');
