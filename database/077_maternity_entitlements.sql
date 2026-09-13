-- Maternity / antenatal entitlement
--
-- One paid "Antenatal Care (Booking)" service at Paypoint (self-pay or billed to
-- insurance) unlocks pregnancy booking. Booking consumes the entitlement
-- permanently; after delivery the patient must pay again for the next pregnancy.
--
-- Maternity-tagged consultations (the Maternity Dashboard flow) are not billed
-- because the booking fee already covers them. Lab orders and prescriptions are
-- always billed. Normal consultations are always billed.

CREATE TABLE IF NOT EXISTS maternity_entitlements (
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES patients(id) ON DELETE CASCADE NOT NULL,
  payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,
  payment_item_id UUID REFERENCES payment_items(id) ON DELETE SET NULL,
  -- paid      -> collected, awaiting a pregnancy booking
  -- consumed  -> already used to book a pregnancy (permanent)
  status VARCHAR(20) NOT NULL DEFAULT 'paid',
  maternity_patient_id UUID REFERENCES maternity_patients(id) ON DELETE SET NULL,
  consumed_at TIMESTAMPTZ,
  source VARCHAR(20) NOT NULL DEFAULT 'paypoint',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  is_synced BOOLEAN DEFAULT false,
  last_synced_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_maternity_entitlements_patient
  ON maternity_entitlements(patient_id, status);
CREATE INDEX IF NOT EXISTS idx_maternity_entitlements_pregnancy
  ON maternity_entitlements(maternity_patient_id);

-- A patient may hold at most one unused (paid) entitlement at a time.
CREATE UNIQUE INDEX IF NOT EXISTS uq_maternity_entitlement_paid
  ON maternity_entitlements(patient_id) WHERE status = 'paid';

CREATE TRIGGER update_maternity_entitlements_updated_at
  BEFORE UPDATE ON maternity_entitlements
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Identify the service that unlocks maternity booking and the sex it may be
-- sold to. Handled server-side; the Paypoint UI reads these flags to disable
-- the item for ineligible patients.
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS unlocks_maternity BOOLEAN DEFAULT FALSE;
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS gender_restriction VARCHAR(20);

UPDATE inventory_items
   SET unlocks_maternity = TRUE,
       gender_restriction = 'Female'
 WHERE amount_type = 'maternity'
   AND drug_name ILIKE 'Antenatal Care (Booking)%';

-- Grandfather existing pregnancies: every pregnancy that already exists was
-- booked under the old rules, so mark it consumed. Its maternity-tagged
-- consultations therefore stay free, and the patient cannot re-book without a
-- fresh Paypoint payment.
INSERT INTO maternity_entitlements (tenant_id, patient_id, maternity_patient_id, status, source, consumed_at, created_at)
SELECT mp.tenant_id, mp.patient_id, mp.id, 'consumed', 'migration', COALESCE(mp.booked_at, mp.created_at), COALESCE(mp.booked_at, mp.created_at)
  FROM maternity_patients mp
 WHERE NOT EXISTS (
   SELECT 1 FROM maternity_entitlements me WHERE me.maternity_patient_id = mp.id
 );
