-- ============================================================
-- 108: Copy the quantified quantity onto prescriptions settled by a bill
--
-- 107 settled prescriptions that were paid through a pharmacy bill by matching
-- patient + drug, but left their quantity NULL (the doctor no longer sets one),
-- so the dispensing screen showed a blank "quantified quantity". Copy the
-- bill line's quantity onto the prescription so it is dispensed for the
-- amount the pharmacist quantified. Idempotent.
-- ============================================================

UPDATE prescriptions pr
   SET quantity = src.quantity
  FROM (
    SELECT DISTINCT ON (pr2.id) pr2.id, pbi.quantity
      FROM prescriptions pr2
      JOIN pharmacy_bill_items pbi ON lower(trim(pbi.drug_name)) = lower(trim(pr2.drug_name))
      JOIN pharmacy_bills pb ON pb.id = pbi.bill_id AND pb.status = 'paid'
      JOIN encounters e ON e.id = pr2.encounter_id AND e.patient_id = pb.patient_id
     WHERE COALESCE(pr2.quantity, 0) = 0
     ORDER BY pr2.id, pbi.quantity DESC
  ) src
 WHERE pr.id = src.id;
