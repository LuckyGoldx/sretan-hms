-- ============================================================
-- 107: Settle prescriptions covered by already-paid pharmacy bills
--
-- Bills created before pharmacy_bill_items.prescription_id existed (106) have
-- lines with no prescription link, so paying them never marked the source
-- prescription paid and it kept reappearing in the pharmacy queue. Settle any
-- unpaid prescription that matches a PAID bill line by patient + drug name.
-- Idempotent: safe to run on every server boot.
-- ============================================================

UPDATE prescriptions pr
   SET is_paid = true
  FROM pharmacy_bill_items pbi
  JOIN pharmacy_bills pb ON pb.id = pbi.bill_id
 WHERE pb.status = 'paid'
   AND COALESCE(pr.is_paid, false) = false
   AND pr.status <> 'cancelled'
   AND lower(trim(pr.drug_name)) = lower(trim(pbi.drug_name))
   AND pr.encounter_id IN (SELECT e.id FROM encounters e WHERE e.patient_id = pb.patient_id);
