import pool from '../db/pool';

export async function autoSyncClinicalServices(caseId: string, patientId: string, tenantId: string): Promise<void> {
  const tenant = tenantId;

  async function ensureService(serviceType: string, serviceName: string, quantity: number, unitPrice: number, sourceType: string, sourceId: string): Promise<void> {
    const exists = await pool.query(
      `SELECT id FROM insurance_case_services WHERE case_id = $1 AND source_type = $2 AND source_id = $3`,
      [caseId, sourceType, sourceId]
    );
    if (exists.rows.length > 0) return;

    const total = quantity * unitPrice;
    await pool.query(
      `INSERT INTO insurance_case_services (id, tenant_id, case_id, service_type, service_name, quantity, unit_price, total_price, source_type, source_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [crypto.randomUUID(), tenant, caseId, serviceType, serviceName, quantity, unitPrice, total, sourceType, sourceId]
    );
  }

  // 1. Completed lab results (join: lab_results -> lab_orders -> encounters -> patients)
  const labResults = await pool.query(
    `SELECT lr.id, lo.test_name, lr.analyte_name, lr.value, lr.created_at
     FROM lab_results lr
     JOIN lab_orders lo ON lr.lab_order_id = lo.id
     JOIN encounters e ON lo.encounter_id = e.id
     WHERE e.patient_id = $1 AND lr.status = 'completed'`,
    [patientId]
  );
  for (const r of labResults.rows) {
    const name = r.test_name ? `${r.test_name} - ${r.analyte_name}` : r.analyte_name;
    await ensureService('lab', name, 1, 0, 'lab_result', r.id);
  }

  // 2. Completed radiology orders (join: radiology_orders -> encounters -> patients)
  const radOrders = await pool.query(
    `SELECT ro.id, ro.imaging_type, ro.report_text, ro.created_at
     FROM radiology_orders ro
     JOIN encounters e ON ro.encounter_id = e.id
     WHERE e.patient_id = $1 AND ro.status = 'completed'`,
    [patientId]
  );
  for (const r of radOrders.rows) {
    await ensureService('radiology', r.imaging_type, 1, 0, 'radiology', r.id);
  }

  // 3. Dispensed prescriptions (join: prescriptions -> encounters -> patients)
  const prescriptions = await pool.query(
    `SELECT p.id, p.drug_name, p.quantity
     FROM prescriptions p
     JOIN encounters e ON p.encounter_id = e.id
     WHERE e.patient_id = $1 AND p.status = 'dispensed'`,
    [patientId]
  );
  for (const p of prescriptions.rows) {
    await ensureService('pharmacy', p.drug_name, parseInt(p.quantity) || 1, 0, 'prescription', p.id);
  }

  // 4. Admissions (have patient_id directly)
  const admissions = await pool.query(
    `SELECT a.id, a.bed_number, a.admitted_at, a.discharged_at, a.status, w.name as ward_name
     FROM admissions a LEFT JOIN wards w ON a.ward_id = w.id
     WHERE a.patient_id = $1 AND a.status IN ('active', 'discharged')`,
    [patientId]
  );
  for (const a of admissions.rows) {
    const start = new Date(a.admitted_at);
    const end = a.discharged_at ? new Date(a.discharged_at) : new Date();
    const days = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
    const wardName = a.ward_name || 'Unknown Ward';
    await ensureService('admission', `Admission - ${wardName}${a.bed_number ? ` (Bed ${a.bed_number})` : ''}`, days, 0, 'admission', a.id);
  }

  // 5. Encounters (consultations)
  const encounters = await pool.query(
    `SELECT e.id, e.created_at, s.name as doctor_name FROM encounters e LEFT JOIN staff_users s ON e.staff_id = s.id WHERE e.patient_id = $1`,
    [patientId]
  );
  for (const e of encounters.rows) {
    const dateStr = new Date(e.created_at).toISOString().slice(0, 10);
    await ensureService('consultation', `Consultation - ${e.doctor_name || 'Doctor'} (${dateStr})`, 1, 0, 'encounter', e.id);
  }

  // 6. Treatments (completed)
  const treatments = await pool.query(
    `SELECT id, treatment, created_at FROM treatments WHERE patient_id = $1 AND status = 'completed'`,
    [patientId]
  );
  for (const t of treatments.rows) {
    await ensureService('treatment', t.treatment, 1, 0, 'treatment', t.id);
  }

  // 7. Fluid balance entries (bill only fluid INTAKE — output is not billable)
  const fluidEntries = await pool.query(
    `SELECT id, fluid_type, intake_ml, route, recorded_at
     FROM fluid_balance WHERE patient_id = $1 AND intake_ml > 0 ORDER BY recorded_at`,
    [patientId]
  );
  for (const f of fluidEntries.rows) {
    const dateStr = f.recorded_at ? new Date(f.recorded_at).toISOString().slice(0, 16).replace('T', ' ') : '';
    const qty = parseInt(f.intake_ml || 0);
    const details = `${f.fluid_type}${f.route ? ` (${f.route})` : ''}${dateStr ? ` @ ${dateStr}` : ''}`;
    await ensureService('fluid', details, Math.max(1, qty), 0, 'fluid_balance', f.id);
  }

  // 8. Maternity ANC visits (via maternity_patients)
  const ancVisits = await pool.query(
    `SELECT a.id, a.visit_date, m.patient_id
     FROM antenatal_visits a
     JOIN maternity_patients m ON a.maternity_patient_id = m.id
     WHERE m.patient_id = $1`,
    [patientId]
  );
  for (const v of ancVisits.rows) {
    const dateStr = v.visit_date ? v.visit_date.slice(0, 10) : '';
    await ensureService('maternity', `ANC Visit${dateStr ? ` - ${dateStr}` : ''}`, 1, 0, 'anc_visit', v.id);
  }

  // 9. Maternity deliveries
  const deliveries = await pool.query(
    `SELECT d.id, d.delivery_date, m.patient_id
     FROM maternity_deliveries d
     JOIN maternity_patients m ON d.maternity_patient_id = m.id
     WHERE m.patient_id = $1`,
    [patientId]
  );
  for (const d of deliveries.rows) {
    const dateStr = d.delivery_date ? d.delivery_date.slice(0, 10) : '';
    await ensureService('maternity', `Delivery${dateStr ? ` - ${dateStr}` : ''}`, 1, 0, 'delivery', d.id);
  }

  // 10. Postnatal visits
  const postnatalVisits = await pool.query(
    `SELECT p.id, p.visit_date, m.patient_id
     FROM postnatal_visits p
     JOIN maternity_deliveries d ON p.delivery_id = d.id
     JOIN maternity_patients m ON d.maternity_patient_id = m.id
     WHERE m.patient_id = $1`,
    [patientId]
  );
  for (const v of postnatalVisits.rows) {
    const dateStr = v.visit_date ? v.visit_date.slice(0, 10) : '';
    await ensureService('maternity', `Postnatal Visit${dateStr ? ` - ${dateStr}` : ''}`, 1, 0, 'postnatal', v.id);
  }

  // Refresh case billing totals
  await pool.query(
    `UPDATE insurance_cases SET
       total_billed = (SELECT COALESCE(SUM(total_price),0) FROM insurance_case_services WHERE case_id = $1 AND status != 'removed'),
       total_invoiced = (SELECT COALESCE(SUM(total_price),0) FROM insurance_case_services WHERE case_id = $1 AND status = 'invoiced'),
       total_uninvoiced = (SELECT COALESCE(SUM(total_price),0) FROM insurance_case_services WHERE case_id = $1 AND status = 'pending')
     WHERE id = $1`,
    [caseId]
  );
}
