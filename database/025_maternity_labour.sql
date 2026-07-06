-- Maternity Labour Tables: Deliveries, Partograph, Newborns

-- MATERNITY DELIVERIES: Labour admission to delivery record
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
  delivery_type VARCHAR(50),
  delivery_place VARCHAR(50),

  -- Perineum and placenta
  perineum_status VARCHAR(50),
  placenta_delivery VARCHAR(50),
  placenta_delivery_time TIME,
  blood_loss_ml INT,

  -- Interventions
  oxytocin_given BOOLEAN DEFAULT false,

  -- Complications
  complication VARCHAR(100),
  complication_notes TEXT,

  -- Staff
  delivered_by UUID REFERENCES staff_users(id),

  -- Outcome
  outcome VARCHAR(20) DEFAULT 'live_birth',
  status VARCHAR(20) DEFAULT 'active',
  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  is_synced BOOLEAN DEFAULT false,
  last_synced_at TIMESTAMPTZ
);

CREATE TRIGGER update_maternity_deliveries_updated_at
  BEFORE UPDATE ON maternity_deliveries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- PARTOGRAPH DATA: Time-series cervical dilation monitoring
CREATE TABLE IF NOT EXISTS maternity_partograph (
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id UUID REFERENCES maternity_deliveries(id) ON DELETE CASCADE NOT NULL,

  recorded_at TIMESTAMPTZ NOT NULL,

  -- Cervical assessment
  cervical_dilation DECIMAL(4,1),
  descent DECIMAL(4,1),

  -- Contractions
  contractions_frequency INT,
  contractions_duration INT,

  -- Fetal monitoring
  fetal_heart_rate INT,

  -- Maternal vitals
  maternal_pulse INT,
  systolic_bp INT,
  diastolic_bp INT,
  temperature DECIMAL(5,2),

  -- Urine
  urine_volume INT,
  urine_ketones VARCHAR(20),

  -- Interventions
  drugs_given TEXT,

  -- Membranes and moulding
  membranes VARCHAR(20),
  moulding VARCHAR(10),
  caput VARCHAR(10),

  notes TEXT,
  recorded_by UUID REFERENCES staff_users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- NEWBORNS: Supports twins, triplets
CREATE TABLE IF NOT EXISTS maternity_newborns (
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id UUID REFERENCES maternity_deliveries(id) ON DELETE CASCADE NOT NULL,

  baby_number INT DEFAULT 1,
  baby_name VARCHAR(255),
  baby_sex VARCHAR(10),

  -- Anthropometrics
  birth_weight DECIMAL(5,2),
  birth_length DECIMAL(5,2),
  head_circumference DECIMAL(5,2),

  -- APGAR scores
  apgar_1min INT,
  apgar_5min INT,
  apgar_10min INT,

  -- Resuscitation
  resuscitation VARCHAR(100),
  delivery_to_cry_seconds INT,

  -- Immediate care
  vitamin_k_given BOOLEAN DEFAULT false,
  immunizations_given TEXT,

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
