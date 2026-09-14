-- ============================================================
-- 100: Seed the "system key" inventory items for every tenant
--
-- Billing resolves some fees by a stable service_key (not by name), so a
-- hospital can rename or reprice them and pricing still works. BED_DAY is
-- created per ward when wards are created; the rest are seeded here for every
-- existing hospital AND stamped onto the matching item that already exists.
--
-- Keys:
--   ADMISSION_FEE           one-time admission (processing) fee
--   FOLDER_ACTIVATION       folder activation / registration fee
--   CONSULTATION_NEW        new-visit consultation fee
--   CONSULTATION_FOLLOWUP   follow-up / review consultation fee
--   SPECIALIST_CONSULTATION specialist / referral fee
--   MATERNITY_BOOKING       antenatal booking fee (unlocks maternity, female)
-- Idempotent: safe to run on every server boot.
-- ============================================================

WITH defaults(drug_name, category, amount_type, price, service_key, unlocks, gender) AS (
  VALUES
    ('Admission Fee',                'general', 'units',         5000,  'ADMISSION_FEE',           false, NULL),
    ('Folder Activation Fee',        'general', 'miscellaneous', 5000,  'FOLDER_ACTIVATION',       false, NULL),
    ('General Consultation (New)',   'general', 'consultation',  5000,  'CONSULTATION_NEW',        false, NULL),
    ('General Consultation (Follow-up)', 'general', 'consultation', 3000, 'CONSULTATION_FOLLOWUP', false, NULL),
    ('Specialist Consultation',      'general', 'consultation',  10000, 'SPECIALIST_CONSULTATION', false, NULL),
    ('Antenatal Care (Booking)',     'general', 'maternity',     15000, 'MATERNITY_BOOKING',       true,  'Female')
)
-- 1) Stamp the key on the item a hospital already has (e.g. from an old seed).
UPDATE inventory_items i
   SET service_key = d.service_key,
       unlocks_maternity = COALESCE(i.unlocks_maternity, d.unlocks),
       gender_restriction = COALESCE(i.gender_restriction, d.gender)
  FROM defaults d
 WHERE i.service_key IS NULL
   AND lower(trim(i.drug_name)) = lower(trim(d.drug_name));

-- 2) Create the key item for every tenant that does not have it yet (by key or name).
WITH defaults(drug_name, category, amount_type, price, service_key, unlocks, gender) AS (
  VALUES
    ('Admission Fee',                'general', 'units',         5000,  'ADMISSION_FEE',           false, NULL),
    ('Folder Activation Fee',        'general', 'miscellaneous', 5000,  'FOLDER_ACTIVATION',       false, NULL),
    ('General Consultation (New)',   'general', 'consultation',  5000,  'CONSULTATION_NEW',        false, NULL),
    ('General Consultation (Follow-up)', 'general', 'consultation', 3000, 'CONSULTATION_FOLLOWUP', false, NULL),
    ('Specialist Consultation',      'general', 'consultation',  10000, 'SPECIALIST_CONSULTATION', false, NULL),
    ('Antenatal Care (Booking)',     'general', 'maternity',     15000, 'MATERNITY_BOOKING',       true,  'Female')
)
INSERT INTO inventory_items (id, tenant_id, drug_name, category, price, cost_price, amount_type, is_active, service_key, unlocks_maternity, gender_restriction)
SELECT gen_random_uuid(), t.id, d.drug_name, d.category, d.price, 0, d.amount_type, true, d.service_key, d.unlocks, d.gender
  FROM tenants t
 CROSS JOIN defaults d
 WHERE NOT EXISTS (
   SELECT 1 FROM inventory_items i
    WHERE i.tenant_id = t.id
      AND (i.service_key = d.service_key OR lower(trim(i.drug_name)) = lower(trim(d.drug_name)))
 );
