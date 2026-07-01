-- Treatment Sessions: one drug can have multiple sessions (dosage changes, route changes, etc.)
CREATE TABLE IF NOT EXISTS treatment_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  treatment_id UUID REFERENCES treatments(id) ON DELETE CASCADE,
  staff_id UUID REFERENCES staff_users(id),
  dosage VARCHAR(100),
  route VARCHAR(50),
  frequency VARCHAR(100),
  times TEXT,
  notes TEXT,
  status VARCHAR(20) DEFAULT 'active',
  start_date TIMESTAMPTZ DEFAULT NOW(),
  end_date TIMESTAMPTZ,
  ended_by UUID REFERENCES staff_users(id),
  end_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add session_id to treatment_doses
ALTER TABLE treatment_doses ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES treatment_sessions(id) ON DELETE CASCADE;

-- Track dosage/route changes per session
ALTER TABLE treatment_sessions ADD COLUMN IF NOT EXISTS change_log JSONB DEFAULT '[]'::jsonb;

-- Backfill: create a default session for each existing treatment, link its doses
DO $$
DECLARE
  t RECORD;
  sess_id UUID;
BEGIN
  FOR t IN SELECT * FROM treatments WHERE id NOT IN (SELECT DISTINCT treatment_id FROM treatment_sessions) LOOP
    sess_id := gen_random_uuid();
    INSERT INTO treatment_sessions (id, tenant_id, treatment_id, staff_id, dosage, route, frequency, times, notes, status, start_date, end_date, ended_by, end_reason)
    VALUES (sess_id, t.tenant_id, t.id, t.staff_id, t.dosage, t.route, t.frequency, t.times, t.notes, COALESCE(t.status, 'active'), t.administered_at, t.end_date, t.ended_by, t.end_reason);
    UPDATE treatment_doses SET session_id = sess_id WHERE treatment_id = t.id AND session_id IS NULL;
  END LOOP;
END $$;
