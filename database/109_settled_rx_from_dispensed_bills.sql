-- ============================================================
-- 109: Finish prescriptions settled by bills that were already dispensed
--
-- 107/108 handled bills still in 'paid'. A bill can move to 'dispensed' before
-- the backfill ran, leaving its prescription paid but with a NULL quantity and
-- still 'pending' — so it lingered on the dispensing screen with a blank
-- "quantified quantity". Copy the quantity from paid OR dispensed bill lines,
-- and mark a prescription dispensed when its bill was already dispensed.
-- Idempotent.
-- ============================================================

-- 1) Copy the quantified quantity from any settled bill line (paid or dispensed).
UPDATE prescriptions pr
   SET quantity = src.quantity
  FROM (
    SELECT DISTINCT ON (pr2.id) pr2.id, pbi.quantity
      FROM prescriptions pr2
      JOIN pharmacy_bill_items pbi ON lower(trim(pbi.drug_name)) = lower(trim(pr2.drug_name))
      JOIN pharmacy_bills pb ON pb.id = pbi.bill_id AND pb.status IN ('paid', 'dispensed')
      JOIN encounters e ON e.id = pr2.encounter_id AND e.patient_id = pb.patient_id
     WHERE COALESCE(pr2.quantity, 0) = 0
     ORDER BY pr2.id, pbi.quantity DESC
  ) src
 WHERE pr.id = src.id;

-- 2) A prescription whose bill is already dispensed is dispensed itself.
UPDATE prescriptions pr
   SET status = 'dispensed'
 WHERE pr.status <> 'dispensed'
   AND COALESCE(pr.is_paid, false) = true
   AND EXISTS (
     SELECT 1
       FROM pharmacy_bill_items pbi
       JOIN pharmacy_bills pb ON pb.id = pbi.bill_id AND pb.status = 'dispensed'
      WHERE lower(trim(pbi.drug_name)) = lower(trim(pr.drug_name))
        AND pr.encounter_id IN (SELECT e.id FROM encounters e WHERE e.patient_id = pb.patient_id)
   );
