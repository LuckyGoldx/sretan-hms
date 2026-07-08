-- Add SOAP notes and encounter link to antenatal visits
ALTER TABLE antenatal_visits ADD COLUMN IF NOT EXISTS soap_notes JSONB;
ALTER TABLE antenatal_visits ADD COLUMN IF NOT EXISTS encounter_id UUID REFERENCES encounters(id) ON DELETE SET NULL;
