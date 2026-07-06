-- Maternity Core Tables: Pregnancy Profile + Antenatal Visits

-- MATERNITY PATIENTS: Pregnancy profile / booking
CREATE TABLE IF NOT EXISTS maternity_patients (
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES patients(id) ON DELETE CASCADE UNIQUE NOT NULL,

  -- Pregnancy dating
  lmp DATE,
  edd DATE,
  booking_gestational_age INT,

  -- Obstetric history
  gravida INT DEFAULT 1,
  para INT DEFAULT 0,
  living_children INT DEFAULT 0,

  -- Laboratory
  blood_group VARCHAR(5),
  genotype VARCHAR(5),
  rh_factor VARCHAR(10),
  hiv_status VARCHAR(20),
  hbv_status VARCHAR(20),

  -- Risk assessment
  risk_level VARCHAR(20) DEFAULT 'low',
  risk_factors TEXT,

  -- Status tracking
  status VARCHAR(20) DEFAULT 'active',
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

-- ANTENATAL VISITS: Each scheduled check-up
CREATE TABLE IF NOT EXISTS antenatal_visits (
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  maternity_patient_id UUID REFERENCES maternity_patients(id) ON DELETE CASCADE NOT NULL,

  visit_number INT NOT NULL,
  visit_date DATE NOT NULL,
  gestational_age_weeks INT,

  -- Anthropometrics
  weight DECIMAL(5,2),

  -- Vital signs
  systolic_bp INT,
  diastolic_bp INT,

  -- Obstetric examination
  fundal_height DECIMAL(5,2),
  fetal_presentation VARCHAR(50),
  fetal_heart_rate INT,
  fetal_heart_sound VARCHAR(50),

  -- Urine dipstick
  urine_protein VARCHAR(20),
  urine_glucose VARCHAR(20),

  -- Hematology
  hemoglobin DECIMAL(5,2),
  pcv DECIMAL(5,2),

  -- Preventive care
  tt_dose VARCHAR(20),
  iycf_given BOOLEAN DEFAULT false,

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
