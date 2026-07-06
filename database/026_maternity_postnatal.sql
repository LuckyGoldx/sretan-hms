-- Maternity Postnatal Tables: Mother follow-up visits

CREATE TABLE IF NOT EXISTS postnatal_visits (
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id UUID REFERENCES maternity_deliveries(id) ON DELETE CASCADE NOT NULL,

  visit_date DATE NOT NULL,
  visit_number INT NOT NULL,

  -- Uterine involution
  fundal_height_cm DECIMAL(5,2),

  -- Lochia
  lochia VARCHAR(100),

  -- Maternal vitals
  systolic_bp INT,
  diastolic_bp INT,
  pulse INT,
  temperature DECIMAL(5,2),

  -- Breastfeeding
  breastfeeding_status VARCHAR(50),
  breast_engorged BOOLEAN DEFAULT false,
  breast_mastitis BOOLEAN DEFAULT false,

  -- Wound assessment
  perineal_wound VARCHAR(50),
  c_section_wound VARCHAR(50),

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
