import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import pool from '../db/pool';
import { readClinicProfile } from '../config/reader';

const router = Router();

function getTenantId(): string {
  return readClinicProfile().GLOBAL_SAAS_TENANT_ID;
}

// ── Maternity Patients ──

router.get('/api/maternity-patients', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const { status, search, patient_id, edd_before, edd_after, risk_level, available_female, page, limit } = req.query;
    let query = `
      SELECT mp.*, p.full_name, p.hospital_number, p.dob, p.phone, p.sex,
        (SELECT COUNT(*) FROM antenatal_visits WHERE maternity_patient_id = mp.id) as visit_count,
        (SELECT MAX(visit_date) FROM antenatal_visits WHERE maternity_patient_id = mp.id) as last_visit_date,
        (SELECT MAX(next_appointment_date) FROM antenatal_visits WHERE maternity_patient_id = mp.id) as next_appointment_date
      FROM maternity_patients mp
      JOIN patients p ON p.id = mp.patient_id
      WHERE mp.tenant_id = $1
    `;
    const params: any[] = [tenantId];
    let idx = 2;

    if (available_female === 'true') {
      let afQuery = `
        SELECT p.id, p.full_name, p.hospital_number, p.dob, p.phone, p.sex, p.marital_status,
          p.blood_type, p.occupation, p.address, p.next_of_kin, p.emergency_contact_phone,
          p.insurance, p.insurance_type
        FROM patients p
        WHERE p.tenant_id = $1
          AND p.sex = 'Female'
          AND p.folder_activated IS DISTINCT FROM false
          AND NOT EXISTS (SELECT 1 FROM maternity_patients mp2 WHERE mp2.patient_id = p.id AND mp2.status != 'anc_lost')
      `;
      const afParams: any[] = [tenantId];
      let afIdx = 2;
      if (search) {
        afQuery += ` AND (p.full_name ILIKE $${afIdx} OR p.hospital_number ILIKE $${afIdx} OR p.phone ILIKE $${afIdx})`;
        afParams.push(`%${search}%`);
        afIdx++;
      }
      afQuery += ` ORDER BY p.full_name`;
      if (page) {
        const countRes = await pool.query(afQuery.replace(/SELECT .*? FROM/, 'SELECT COUNT(*) as total FROM'), afParams);
        const afTotal = parseInt(countRes.rows[0]?.total) || 0;
        const afPageNum = parseInt(page as string) || 1;
        const afLimitNum = parseInt(limit as string) || 25;
        const afOffset = (afPageNum - 1) * afLimitNum;
        afQuery += ` LIMIT $${afIdx++} OFFSET $${afIdx++}`;
        afParams.push(afLimitNum, afOffset);
        const result = await pool.query(afQuery, afParams);
        res.json({ rows: result.rows, total: afTotal, page: afPageNum, limit: afLimitNum });
      } else {
        const result = await pool.query(afQuery, afParams);
        res.json(result.rows);
      }
      return;
    }

    if (patient_id) {
      query += ` AND mp.patient_id = $${idx++}`;
      params.push(patient_id);
    }
    if (status) {
      query += ` AND mp.status = $${idx++}`;
      params.push(status);
    }
    if (risk_level) {
      query += ` AND mp.risk_level = $${idx++}`;
      params.push(risk_level);
    }
    if (edd_before) {
      query += ` AND mp.edd <= $${idx++}`;
      params.push(edd_before);
    }
    if (edd_after) {
      query += ` AND mp.edd >= $${idx++}`;
      params.push(edd_after);
    }
    if (search) {
      query += ` AND (p.full_name ILIKE $${idx} OR p.hospital_number ILIKE $${idx} OR p.phone ILIKE $${idx})`;
      params.push(`%${search}%`);
      idx++;
    }
    query += ' ORDER BY mp.created_at DESC';

    // Pagination (only when page param is provided)
    if (page) {
      const countQuery = query.replace(/SELECT .*? FROM/, 'SELECT COUNT(*) as total FROM');
      const countResult = await pool.query(countQuery, params);
      const total = parseInt(countResult.rows[0]?.total) || 0;
      const pageNum = parseInt(page as string) || 1;
      const limitNum = parseInt(limit as string) || 25;
      const offset = (pageNum - 1) * limitNum;
      query += ` LIMIT $${idx++} OFFSET $${idx++}`;
      params.push(limitNum, offset);
      const result = await pool.query(query, params);
      res.json({ rows: result.rows, total, page: pageNum, limit: limitNum });
    } else {
      const result = await pool.query(query, params);
      res.json(result.rows);
    }
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.get('/api/maternity-patients/stats', async (_req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    let activePregnancies = 0, deliveriesToday = 0, dueThisWeek = 0, overdueAnc = 0;
    let deliveriesThisMonth = 0, totalDeliveries = 0, highRiskPregnancies = 0;
    let dueThisWeekList: any[] = [], overdueAncList: any[] = [], recentDeliveries: any[] = [];

    try {
      const activeRes = await pool.query(
        "SELECT COUNT(*) as count FROM maternity_patients WHERE tenant_id = $1 AND status = 'active'", [tenantId]
      );
      activePregnancies = parseInt(activeRes.rows[0].count) || 0;
    } catch {}

    try {
      const deliveredRes = await pool.query(
        "SELECT COUNT(*) as count FROM maternity_deliveries md JOIN maternity_patients mp ON mp.id = md.maternity_patient_id WHERE mp.tenant_id = $1 AND md.delivery_date = CURRENT_DATE", [tenantId]
      );
      deliveriesToday = parseInt(deliveredRes.rows[0].count) || 0;
    } catch {}

    try {
      const dueWeekRes = await pool.query(
        "SELECT COUNT(*) as count FROM maternity_patients WHERE tenant_id = $1 AND status = 'active' AND edd BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'", [tenantId]
      );
      dueThisWeek = parseInt(dueWeekRes.rows[0].count) || 0;
    } catch {}

    try {
      const overdueRes = await pool.query(
        "SELECT COUNT(*) as count FROM maternity_patients mp WHERE mp.tenant_id = $1 AND mp.status = 'active' AND (SELECT MAX(next_appointment_date) FROM antenatal_visits WHERE maternity_patient_id = mp.id) < CURRENT_DATE", [tenantId]
      );
      overdueAnc = parseInt(overdueRes.rows[0].count) || 0;
    } catch {}

    try {
      const monthRes = await pool.query(
        "SELECT COUNT(*) as count FROM maternity_deliveries md JOIN maternity_patients mp ON mp.id = md.maternity_patient_id WHERE mp.tenant_id = $1 AND md.delivery_date >= DATE_TRUNC('month', CURRENT_DATE)", [tenantId]
      );
      deliveriesThisMonth = parseInt(monthRes.rows[0].count) || 0;
    } catch {}

    try {
      const totalDelRes = await pool.query(
        "SELECT COUNT(*) as count FROM maternity_deliveries md JOIN maternity_patients mp ON mp.id = md.maternity_patient_id WHERE mp.tenant_id = $1", [tenantId]
      );
      totalDeliveries = parseInt(totalDelRes.rows[0].count) || 0;
    } catch {}

    try {
      const highRiskRes = await pool.query(
        "SELECT COUNT(*) as count FROM maternity_patients WHERE tenant_id = $1 AND status = 'active' AND risk_level = 'high'", [tenantId]
      );
      highRiskPregnancies = parseInt(highRiskRes.rows[0].count) || 0;
    } catch {}

    try {
      const dueListRes = await pool.query(`
        SELECT mp.id, mp.edd, p.full_name, p.hospital_number
        FROM maternity_patients mp
        JOIN patients p ON p.id = mp.patient_id
        WHERE mp.tenant_id = $1 AND mp.status = 'active' AND mp.edd BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'
        ORDER BY mp.edd ASC`, [tenantId]);
      dueThisWeekList = dueListRes.rows;
    } catch {}

    try {
      const overdueListRes = await pool.query(`
        SELECT mp.id, p.full_name, p.hospital_number,
          (SELECT MAX(next_appointment_date) FROM antenatal_visits WHERE maternity_patient_id = mp.id) as last_appointment
        FROM maternity_patients mp
        JOIN patients p ON p.id = mp.patient_id
        WHERE mp.tenant_id = $1 AND mp.status = 'active'
          AND (SELECT MAX(next_appointment_date) FROM antenatal_visits WHERE maternity_patient_id = mp.id) < CURRENT_DATE
        ORDER BY last_appointment ASC NULLS LAST`, [tenantId]);
      overdueAncList = overdueListRes.rows;
    } catch {}

    try {
      const recentDelRes = await pool.query(`
        SELECT md.delivery_date, md.delivery_type, md.outcome, md.status as delivery_status,
          p.full_name, p.hospital_number, mp.id as maternity_patient_id
        FROM maternity_deliveries md
        JOIN maternity_patients mp ON mp.id = md.maternity_patient_id
        JOIN patients p ON p.id = mp.patient_id
        WHERE mp.tenant_id = $1
        ORDER BY md.created_at DESC LIMIT 5`, [tenantId]);
      recentDeliveries = recentDelRes.rows;
    } catch {}

    res.json({
      active_pregnancies: activePregnancies,
      deliveries_today: deliveriesToday,
      due_this_week: dueThisWeek,
      overdue_anc: overdueAnc,
      deliveries_this_month: deliveriesThisMonth,
      total_deliveries: totalDeliveries,
      high_risk_pregnancies: highRiskPregnancies,
      due_this_week_list: dueThisWeekList,
      overdue_anc_list: overdueAncList,
      recent_deliveries: recentDeliveries,
    });
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.post('/api/maternity-patients', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const { patient_id, lmp, edd, booking_gestational_age, gravida, para, living_children,
      miscarriages, baby_alive,
      blood_group, genotype, rh_factor, hiv_status, hbv_status, risk_level, risk_factors, booked_by } = req.body;

    if (!patient_id) {
      res.status(400).json({ error: true, message: 'patient_id is required' });
      return;
    }

    const patCheck = await pool.query('SELECT id, sex FROM patients WHERE id = $1', [patient_id]);
    if (patCheck.rows.length === 0) {
      res.status(404).json({ error: true, message: 'Patient not found' });
      return;
    }
    if (patCheck.rows[0].sex !== 'Female') {
      res.status(400).json({ error: true, message: 'Only female patients can be booked for maternity' });
      return;
    }

    const activeCheck = await pool.query(
      "SELECT id FROM maternity_patients WHERE patient_id = $1 AND status IN ('active', 'delivered')", [patient_id]
    );
    if (activeCheck.rows.length > 0) {
      res.status(409).json({ error: true, message: 'Patient already has a maternity record' });
      return;
    }

    const id = uuidv4();
    const result = await pool.query(
      `INSERT INTO maternity_patients (id, tenant_id, patient_id, lmp, edd, booking_gestational_age,
        gravida, para, living_children, miscarriages, baby_alive,
        blood_group, genotype, rh_factor, hiv_status, hbv_status,
        risk_level, risk_factors, booked_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19) RETURNING *`,
      [id, tenantId, patient_id, lmp || null, edd || null, booking_gestational_age || null,
       gravida || 1, para || 0, living_children || 0, miscarriages || 0, baby_alive || 0,
       blood_group || null, genotype || null, rh_factor || null, hiv_status || null, hbv_status || null,
       risk_level || 'low', risk_factors || null, booked_by || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.get('/api/maternity-patients/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT mp.*, p.full_name, p.hospital_number, p.dob, p.phone, p.sex,
        (SELECT COUNT(*) FROM antenatal_visits WHERE maternity_patient_id = mp.id) as visit_count,
        (SELECT MAX(visit_date) FROM antenatal_visits WHERE maternity_patient_id = mp.id) as last_visit_date,
        (SELECT MAX(next_appointment_date) FROM antenatal_visits WHERE maternity_patient_id = mp.id) as next_appointment
       FROM maternity_patients mp
       JOIN patients p ON p.id = mp.patient_id
       WHERE mp.id = $1`, [id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: true, message: 'Maternity record not found' });
      return;
    }
    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.put('/api/maternity-patients/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { lmp, edd, gravida, para, living_children, miscarriages, baby_alive,
      blood_group, genotype, rh_factor, hiv_status, hbv_status, risk_level, risk_factors, status } = req.body;
    const result = await pool.query(
      `UPDATE maternity_patients SET
        lmp = COALESCE($1, lmp), edd = COALESCE($2, edd),
        gravida = COALESCE($3, gravida), para = COALESCE($4, para),
        living_children = COALESCE($5, living_children),
        miscarriages = COALESCE($6, miscarriages), baby_alive = COALESCE($7, baby_alive),
        blood_group = COALESCE($8, blood_group), genotype = COALESCE($9, genotype),
        rh_factor = COALESCE($10, rh_factor), hiv_status = COALESCE($11, hiv_status),
        hbv_status = COALESCE($12, hbv_status),
        risk_level = COALESCE($13, risk_level), risk_factors = COALESCE($14, risk_factors),
        status = COALESCE($15, status)
       WHERE id = $16 RETURNING *`,
      [lmp || null, edd || null, gravida || null, para || null, living_children || null,
       miscarriages || 0, baby_alive || 0,
       blood_group || null, genotype || null, rh_factor || null, hiv_status || null, hbv_status || null,
       risk_level || null, risk_factors || null, status || null, id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: true, message: 'Maternity record not found' });
      return;
    }
    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// ── Antenatal Visits ──

router.get('/api/antenatal-visits', async (req: Request, res: Response) => {
  try {
    const { maternity_patient_id, date_from, date_to, limit: limitStr } = req.query;
    let query = `
      SELECT av.*, s.name as staff_name
      FROM antenatal_visits av
      LEFT JOIN staff_users s ON s.id = av.staff_id
      WHERE 1=1
    `;
    const params: any[] = [];
    let idx = 1;

    if (maternity_patient_id) {
      query += ` AND av.maternity_patient_id = $${idx++}`;
      params.push(maternity_patient_id);
    }
    if (date_from) {
      query += ` AND av.visit_date >= $${idx++}`;
      params.push(date_from);
    }
    if (date_to) {
      query += ` AND av.visit_date <= $${idx++}`;
      params.push(date_to);
    }
    query += ' ORDER BY av.visit_date DESC';
    if (limitStr) {
      query += ` LIMIT $${idx++}`;
      params.push(parseInt(limitStr as string));
    }
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.post('/api/antenatal-visits', async (req: Request, res: Response) => {
  try {
    const {
      maternity_patient_id, visit_date, gestational_age_weeks,
      weight, systolic_bp, diastolic_bp, fundal_height, fetal_presentation,
      fetal_heart_rate, fetal_heart_sound, urine_protein, urine_glucose,
      hemoglobin, pcv, tt_dose, iycf_given, next_appointment_date, notes, staff_id
    } = req.body;

    if (!maternity_patient_id) {
      res.status(400).json({ error: true, message: 'maternity_patient_id is required' });
      return;
    }

    const maxVN = await pool.query(
      'SELECT COALESCE(MAX(visit_number), 0) + 1 as next_visit_number FROM antenatal_visits WHERE maternity_patient_id = $1',
      [maternity_patient_id]
    );
    const visitNumber = maxVN.rows[0].next_visit_number;

    const id = uuidv4();
    const result = await pool.query(
      `INSERT INTO antenatal_visits (id, tenant_id, maternity_patient_id, visit_number, visit_date,
        gestational_age_weeks, weight, systolic_bp, diastolic_bp, fundal_height, fetal_presentation,
        fetal_heart_rate, fetal_heart_sound, urine_protein, urine_glucose, hemoglobin, pcv,
        tt_dose, iycf_given, next_appointment_date, notes, staff_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
       RETURNING *`,
      [id, getTenantId(), maternity_patient_id, visitNumber, visit_date || new Date().toISOString().slice(0, 10),
       gestational_age_weeks || null, weight || null, systolic_bp || null, diastolic_bp || null,
       fundal_height || null, fetal_presentation || null, fetal_heart_rate || null, fetal_heart_sound || null,
       urine_protein || null, urine_glucose || null, hemoglobin || null, pcv || null,
       tt_dose || null, iycf_given || false, next_appointment_date || null, notes || null, staff_id || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.put('/api/antenatal-visits/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const fields = req.body;
    const result = await pool.query(
      `UPDATE antenatal_visits SET
        weight = COALESCE($1, weight), systolic_bp = COALESCE($2, systolic_bp),
        diastolic_bp = COALESCE($3, diastolic_bp), fundal_height = COALESCE($4, fundal_height),
        fetal_presentation = COALESCE($5, fetal_presentation),
        fetal_heart_rate = COALESCE($6, fetal_heart_rate),
        fetal_heart_sound = COALESCE($7, fetal_heart_sound),
        urine_protein = COALESCE($8, urine_protein), urine_glucose = COALESCE($9, urine_glucose),
        hemoglobin = COALESCE($10, hemoglobin), pcv = COALESCE($11, pcv),
        tt_dose = COALESCE($12, tt_dose), iycf_given = COALESCE($13, iycf_given),
        next_appointment_date = COALESCE($14, next_appointment_date),
        notes = COALESCE($15, notes)
       WHERE id = $16 RETURNING *`,
      [fields.weight || null, fields.systolic_bp || null, fields.diastolic_bp || null,
       fields.fundal_height || null, fields.fetal_presentation || null, fields.fetal_heart_rate || null,
       fields.fetal_heart_sound || null, fields.urine_protein || null, fields.urine_glucose || null,
       fields.hemoglobin || null, fields.pcv || null, fields.tt_dose || null,
       fields.iycf_given || false, fields.next_appointment_date || null, fields.notes || null, id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: true, message: 'Antenatal visit not found' });
      return;
    }
    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// ── Maternity Deliveries ──

router.get('/api/maternity-deliveries', async (req: Request, res: Response) => {
  try {
    const { maternity_patient_id, date_from, date_to, status: delStatus, outcome, page, limit } = req.query;
    let query = `
      SELECT md.*, p.full_name as patient_name, p.hospital_number, s.name as delivered_by_name,
        mp.patient_id,
        (SELECT COUNT(*) FROM maternity_newborns WHERE delivery_id = md.id) as newborn_count
      FROM maternity_deliveries md
      JOIN maternity_patients mp ON mp.id = md.maternity_patient_id
      JOIN patients p ON p.id = mp.patient_id
      LEFT JOIN staff_users s ON s.id = md.delivered_by
      WHERE 1=1
    `;
    const params: any[] = [];
    let idx = 1;

    if (maternity_patient_id) { query += ` AND md.maternity_patient_id = $${idx++}`; params.push(maternity_patient_id); }
    if (delStatus) { query += ` AND md.status = $${idx++}`; params.push(delStatus); }
    if (outcome) { query += ` AND md.outcome = $${idx++}`; params.push(outcome); }
    if (date_from) { query += ` AND md.delivery_date >= $${idx++}`; params.push(date_from); }
    if (date_to) { query += ` AND md.delivery_date <= $${idx++}`; params.push(date_to); }
    query += ' ORDER BY md.created_at DESC';

    if (page) {
      const countQuery = query.replace(/SELECT .*? FROM/, 'SELECT COUNT(*) as total FROM');
      const countResult = await pool.query(countQuery, params);
      const total = parseInt(countResult.rows[0]?.total) || 0;
      const pageNum = parseInt(page as string) || 1;
      const limitNum = parseInt(limit as string) || 25;
      const offset = (pageNum - 1) * limitNum;
      query += ` LIMIT $${idx++} OFFSET $${idx++}`;
      params.push(limitNum, offset);
      const result = await pool.query(query, params);
      res.json({ rows: result.rows, total, page: pageNum, limit: limitNum });
    } else {
      const result = await pool.query(query, params);
      res.json(result.rows);
    }
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.post('/api/maternity-deliveries', async (req: Request, res: Response) => {
  try {
    const {
      maternity_patient_id, admission_id, admitted_at, labour_onset_at, rupture_of_membranes_at,
      delivery_date, delivery_time, delivery_type, delivery_place, perineum_status,
      placenta_delivery, placenta_delivery_time, blood_loss_ml, oxytocin_given,
      complication, complication_notes, delivered_by, outcome, notes
    } = req.body;

    if (!maternity_patient_id) {
      res.status(400).json({ error: true, message: 'maternity_patient_id is required' });
      return;
    }

    const id = uuidv4();
    const isDeliveryComplete = delivery_type || delivery_date;
    const result = await pool.query(
      `INSERT INTO maternity_deliveries (id, tenant_id, maternity_patient_id, admission_id,
        admitted_at, labour_onset_at, rupture_of_membranes_at, delivery_date, delivery_time,
        delivery_type, delivery_place, perineum_status, placenta_delivery, placenta_delivery_time,
        blood_loss_ml, oxytocin_given, complication, complication_notes, delivered_by, outcome, notes,
        status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
       RETURNING *`,
      [id, getTenantId(), maternity_patient_id, admission_id || null,
       admitted_at || null, labour_onset_at || null, rupture_of_membranes_at || null,
       delivery_date || null, delivery_time || null, delivery_type || null, delivery_place || null,
       perineum_status || null, placenta_delivery || null, placenta_delivery_time || null,
       blood_loss_ml || null, oxytocin_given || false, complication || null, complication_notes || null,
       delivered_by || null, outcome || 'live_birth', notes || null,
       isDeliveryComplete ? 'completed' : 'active']
    );

    // Only update maternity_patients status when delivery is actually complete
    if (isDeliveryComplete) {
      await pool.query(
        "UPDATE maternity_patients SET status = 'delivered' WHERE id = $1", [maternity_patient_id]
      );
    }
    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// Labour admission: creates delivery record + admission record in one call
router.post('/api/maternity-admit-labour', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const { maternity_patient_id, admitted_at, labour_onset_at, rupture_of_membranes_at, admitted_by, notes } = req.body;

    if (!maternity_patient_id) {
      res.status(400).json({ error: true, message: 'maternity_patient_id is required' });
      return;
    }

    // Find the Maternity Ward
    const wardRes = await pool.query("SELECT id FROM wards WHERE code = 'MAT' LIMIT 1");
    if (wardRes.rows.length === 0) {
      res.status(500).json({ error: true, message: 'Maternity ward not found' });
      return;
    }
    const maternityWardId = wardRes.rows[0].id;

    // Get patient_id from maternity_patients
    const mpRes = await pool.query('SELECT patient_id FROM maternity_patients WHERE id = $1', [maternity_patient_id]);
    if (mpRes.rows.length === 0) {
      res.status(404).json({ error: true, message: 'Maternity record not found' });
      return;
    }
    const patientId = mpRes.rows[0].patient_id;

    // Check for existing delivery
    const existing = await pool.query(
      "SELECT id FROM maternity_deliveries WHERE maternity_patient_id = $1 AND status = 'active'", [maternity_patient_id]
    );
    if (existing.rows.length > 0) {
      res.json(existing.rows[0]);
      return;
    }

    // Create admission record
    const admissionId = uuidv4();
    await pool.query(
      `INSERT INTO admissions (id, patient_id, ward_id, notes, admitted_by, status)
       VALUES ($1, $2, $3, $4, $5, 'active')`,
      [admissionId, patientId, maternityWardId, notes || null, admitted_by || null]
    );

    // Create delivery record
    const deliveryId = uuidv4();
    const result = await pool.query(
      `INSERT INTO maternity_deliveries (id, tenant_id, maternity_patient_id, admission_id,
        admitted_at, labour_onset_at, rupture_of_membranes_at, status, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', $8)
       RETURNING *`,
      [deliveryId, tenantId, maternity_patient_id, admissionId,
       admitted_at || new Date().toISOString(), labour_onset_at || null,
       rupture_of_membranes_at || null, notes || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.get('/api/maternity-deliveries/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const deliveryRes = await pool.query(
      `SELECT md.*, p.full_name as patient_name, p.hospital_number, s.name as delivered_by_name,
        mp.patient_id
       FROM maternity_deliveries md
       JOIN maternity_patients mp ON mp.id = md.maternity_patient_id
       JOIN patients p ON p.id = mp.patient_id
       LEFT JOIN staff_users s ON s.id = md.delivered_by
       WHERE md.id = $1`, [id]
    );
    if (deliveryRes.rows.length === 0) {
      res.status(404).json({ error: true, message: 'Delivery not found' });
      return;
    }
    const newborns = await pool.query(
      'SELECT * FROM maternity_newborns WHERE delivery_id = $1 ORDER BY baby_number', [id]
    );
    const partograph = await pool.query(
      'SELECT * FROM maternity_partograph WHERE delivery_id = $1 ORDER BY recorded_at', [id]
    );
    res.json({ ...deliveryRes.rows[0], newborns: newborns.rows, partograph: partograph.rows });
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.put('/api/maternity-deliveries/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const fields = req.body;
    const result = await pool.query(
      `UPDATE maternity_deliveries SET
        delivery_date = COALESCE($1, delivery_date), delivery_time = COALESCE($2, delivery_time),
        delivery_type = COALESCE($3, delivery_type), delivery_place = COALESCE($4, delivery_place),
        perineum_status = COALESCE($5, perineum_status),
        placenta_delivery = COALESCE($6, placenta_delivery),
        blood_loss_ml = COALESCE($7, blood_loss_ml),
        complication = COALESCE($8, complication), complication_notes = COALESCE($9, complication_notes),
        outcome = COALESCE($10, outcome), notes = COALESCE($11, notes),
        status = COALESCE($12, status)
       WHERE id = $13 RETURNING *`,
      [fields.delivery_date || null, fields.delivery_time || null, fields.delivery_type || null,
       fields.delivery_place || null, fields.perineum_status || null, fields.placenta_delivery || null,
       fields.blood_loss_ml || null, fields.complication || null, fields.complication_notes || null,
       fields.outcome || null, fields.notes || null, fields.status || null, id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: true, message: 'Delivery not found' });
      return;
    }
    // If marking as completed, also update maternity_patients
    if (fields.status === 'completed' || fields.delivery_type) {
      const del = result.rows[0];
      await pool.query(
        "UPDATE maternity_patients SET status = 'delivered' WHERE id = $1 AND status != 'delivered'",
        [del.maternity_patient_id]
      );
    }
    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// Complete delivery endpoint: records full delivery + updates status
router.put('/api/maternity-deliveries/:id/complete', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const fields = req.body;
    const result = await pool.query(
      `UPDATE maternity_deliveries SET
        delivery_date = COALESCE($1, delivery_date), delivery_time = COALESCE($2, delivery_time),
        delivery_type = COALESCE($3, delivery_type), delivery_place = COALESCE($4, delivery_place),
        perineum_status = COALESCE($5, perineum_status),
        placenta_delivery = COALESCE($6, placenta_delivery),
        placenta_delivery_time = COALESCE($7, placenta_delivery_time),
        blood_loss_ml = COALESCE($8, blood_loss_ml),
        oxytocin_given = COALESCE($9, oxytocin_given),
        complication = COALESCE($10, complication),
        complication_notes = COALESCE($11, complication_notes),
        delivered_by = COALESCE($12, delivered_by),
        outcome = COALESCE($13, outcome),
        notes = COALESCE($14, notes),
        status = 'completed'
       WHERE id = $15 RETURNING *`,
      [fields.delivery_date || null, fields.delivery_time || null, fields.delivery_type || null,
       fields.delivery_place || null, fields.perineum_status || null, fields.placenta_delivery || null,
       fields.placenta_delivery_time || null, fields.blood_loss_ml || null, fields.oxytocin_given || false,
       fields.complication || null, fields.complication_notes || null, fields.delivered_by || null,
       fields.outcome || 'live_birth', fields.notes || null, id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: true, message: 'Delivery not found' });
      return;
    }
    await pool.query(
      "UPDATE maternity_patients SET status = 'delivered' WHERE id = $1",
      [result.rows[0].maternity_patient_id]
    );
    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// ── Partograph ──

router.get('/api/maternity-partograph', async (req: Request, res: Response) => {
  try {
    const { delivery_id } = req.query;
    let query = 'SELECT mp.*, s.name as recorded_by_name FROM maternity_partograph mp LEFT JOIN staff_users s ON s.id = mp.recorded_by WHERE 1=1';
    const params: any[] = [];
    let idx = 1;
    if (delivery_id) { query += ` AND mp.delivery_id = $${idx++}`; params.push(delivery_id); }
    query += ' ORDER BY mp.recorded_at ASC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.post('/api/maternity-partograph', async (req: Request, res: Response) => {
  try {
    const {
      delivery_id, recorded_at, cervical_dilation, descent,
      contractions_frequency, contractions_duration, fetal_heart_rate,
      maternal_pulse, systolic_bp, diastolic_bp, temperature,
      urine_volume, urine_ketones, drugs_given, membranes, moulding, caput,
      notes, recorded_by
    } = req.body;
    if (!delivery_id) {
      res.status(400).json({ error: true, message: 'delivery_id is required' });
      return;
    }
    const id = uuidv4();
    const result = await pool.query(
      `INSERT INTO maternity_partograph (id, tenant_id, delivery_id, recorded_at,
        cervical_dilation, descent, contractions_frequency, contractions_duration,
        fetal_heart_rate, maternal_pulse, systolic_bp, diastolic_bp, temperature,
        urine_volume, urine_ketones, drugs_given, membranes, moulding, caput,
        notes, recorded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
       RETURNING *`,
      [id, getTenantId(), delivery_id, recorded_at || new Date().toISOString(),
       cervical_dilation || null, descent || null, contractions_frequency || null,
       contractions_duration || null, fetal_heart_rate || null,
       maternal_pulse || null, systolic_bp || null, diastolic_bp || null, temperature || null,
       urine_volume || null, urine_ketones || null, drugs_given || null,
       membranes || null, moulding || null, caput || null, notes || null, recorded_by || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.put('/api/maternity-partograph/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const fields = req.body;
    const result = await pool.query(
      `UPDATE maternity_partograph SET
        cervical_dilation = COALESCE($1, cervical_dilation),
        descent = COALESCE($2, descent),
        contractions_frequency = COALESCE($3, contractions_frequency),
        contractions_duration = COALESCE($4, contractions_duration),
        fetal_heart_rate = COALESCE($5, fetal_heart_rate),
        maternal_pulse = COALESCE($6, maternal_pulse),
        systolic_bp = COALESCE($7, systolic_bp),
        diastolic_bp = COALESCE($8, diastolic_bp),
        temperature = COALESCE($9, temperature),
        urine_volume = COALESCE($10, urine_volume),
        urine_ketones = COALESCE($11, urine_ketones),
        drugs_given = COALESCE($12, drugs_given),
        membranes = COALESCE($13, membranes),
        moulding = COALESCE($14, moulding),
        caput = COALESCE($15, caput),
        notes = COALESCE($16, notes)
       WHERE id = $17 RETURNING *`,
      [fields.cervical_dilation || null, fields.descent || null,
       fields.contractions_frequency || null, fields.contractions_duration || null,
       fields.fetal_heart_rate || null, fields.maternal_pulse || null,
       fields.systolic_bp || null, fields.diastolic_bp || null,
       fields.temperature || null, fields.urine_volume || null,
       fields.urine_ketones || null, fields.drugs_given || null,
       fields.membranes || null, fields.moulding || null,
       fields.caput || null, fields.notes || null, id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: true, message: 'Partograph entry not found' });
      return;
    }
    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.delete('/api/maternity-partograph/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM maternity_partograph WHERE id = $1 RETURNING *', [id]);
    if (result.rows.length === 0) {
      res.status(404).json({ error: true, message: 'Partograph entry not found' });
      return;
    }
    res.json({ success: true, deleted: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// ── Newborns ──

router.post('/api/maternity-newborns', async (req: Request, res: Response) => {
  try {
    const {
      delivery_id, baby_number, baby_name, baby_sex, birth_weight, birth_length,
      head_circumference, apgar_1min, apgar_5min, apgar_10min,
      resuscitation, delivery_to_cry_seconds, vitamin_k_given, immunizations_given, congenital_anomalies
    } = req.body;
    if (!delivery_id) {
      res.status(400).json({ error: true, message: 'delivery_id is required' });
      return;
    }
    const id = uuidv4();
    const result = await pool.query(
      `INSERT INTO maternity_newborns (id, tenant_id, delivery_id, baby_number,
        baby_name, baby_sex, birth_weight, birth_length, head_circumference,
        apgar_1min, apgar_5min, apgar_10min, resuscitation, delivery_to_cry_seconds,
        vitamin_k_given, immunizations_given, congenital_anomalies)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
       RETURNING *`,
      [id, getTenantId(), delivery_id, baby_number || 1,
       baby_name || null, baby_sex || null, birth_weight || null, birth_length || null,
       head_circumference || null, apgar_1min || null, apgar_5min || null, apgar_10min || null,
       resuscitation || null, delivery_to_cry_seconds || null,
       vitamin_k_given || false, immunizations_given || null, congenital_anomalies || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.put('/api/maternity-newborns/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const fields = req.body;
    const result = await pool.query(
      `UPDATE maternity_newborns SET
        baby_name = COALESCE($1, baby_name), baby_sex = COALESCE($2, baby_sex),
        birth_weight = COALESCE($3, birth_weight), birth_length = COALESCE($4, birth_length),
        head_circumference = COALESCE($5, head_circumference),
        apgar_1min = COALESCE($6, apgar_1min), apgar_5min = COALESCE($7, apgar_5min),
        apgar_10min = COALESCE($8, apgar_10min), resuscitation = COALESCE($9, resuscitation),
        vitamin_k_given = COALESCE($10, vitamin_k_given),
        immunizations_given = COALESCE($11, immunizations_given),
        congenital_anomalies = COALESCE($12, congenital_anomalies)
       WHERE id = $13 RETURNING *`,
      [fields.baby_name || null, fields.baby_sex || null, fields.birth_weight || null,
       fields.birth_length || null, fields.head_circumference || null, fields.apgar_1min || null,
       fields.apgar_5min || null, fields.apgar_10min || null, fields.resuscitation || null,
       fields.vitamin_k_given ?? null, fields.immunizations_given || null, fields.congenital_anomalies || null, id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: true, message: 'Newborn record not found' });
      return;
    }
    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.delete('/api/maternity-newborns/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM maternity_newborns WHERE id = $1 RETURNING *', [id]);
    if (result.rows.length === 0) {
      res.status(404).json({ error: true, message: 'Newborn record not found' });
      return;
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// ── Postnatal Visits ──

router.get('/api/postnatal-visits', async (req: Request, res: Response) => {
  try {
    const { delivery_id, maternity_patient_id } = req.query;
    let query = `
      SELECT pv.*, s.name as staff_name
      FROM postnatal_visits pv
      LEFT JOIN staff_users s ON s.id = pv.staff_id
      WHERE 1=1
    `;
    const params: any[] = [];
    let idx = 1;
    if (delivery_id) { query += ` AND pv.delivery_id = $${idx++}`; params.push(delivery_id); }
    query += ' ORDER BY pv.visit_date DESC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.post('/api/postnatal-visits', async (req: Request, res: Response) => {
  try {
    const {
      delivery_id, visit_date, visit_number, fundal_height_cm, lochia,
      systolic_bp, diastolic_bp, pulse, temperature,
      breastfeeding_status, breast_engorged, breast_mastitis,
      perineal_wound, c_section_wound,
      family_planning_discussed, family_planning_method,
      complications, notes, staff_id
    } = req.body;
    if (!delivery_id) {
      res.status(400).json({ error: true, message: 'delivery_id is required' });
      return;
    }
    const id = uuidv4();
    const vn = visit_number || 1;
    const result = await pool.query(
      `INSERT INTO postnatal_visits (id, tenant_id, delivery_id, visit_date, visit_number,
        fundal_height_cm, lochia, systolic_bp, diastolic_bp, pulse, temperature,
        breastfeeding_status, breast_engorged, breast_mastitis,
        perineal_wound, c_section_wound, family_planning_discussed, family_planning_method,
        complications, notes, staff_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
       RETURNING *`,
      [id, getTenantId(), delivery_id, visit_date || new Date().toISOString().slice(0, 10), vn,
       fundal_height_cm || null, lochia || null, systolic_bp || null, diastolic_bp || null,
       pulse || null, temperature || null, breastfeeding_status || null,
       breast_engorged || false, breast_mastitis || false,
       perineal_wound || null, c_section_wound || null,
       family_planning_discussed || false, family_planning_method || null,
       complications || null, notes || null, staff_id || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.put('/api/postnatal-visits/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const fields = req.body;
    const result = await pool.query(
      `UPDATE postnatal_visits SET
        fundal_height_cm = COALESCE($1, fundal_height_cm), lochia = COALESCE($2, lochia),
        systolic_bp = COALESCE($3, systolic_bp), diastolic_bp = COALESCE($4, diastolic_bp),
        pulse = COALESCE($5, pulse), temperature = COALESCE($6, temperature),
        breastfeeding_status = COALESCE($7, breastfeeding_status),
        breast_engorged = COALESCE($8, breast_engorged), breast_mastitis = COALESCE($9, breast_mastitis),
        perineal_wound = COALESCE($10, perineal_wound), c_section_wound = COALESCE($11, c_section_wound),
        family_planning_discussed = COALESCE($12, family_planning_discussed),
        family_planning_method = COALESCE($13, family_planning_method),
        complications = COALESCE($14, complications), notes = COALESCE($15, notes)
       WHERE id = $16 RETURNING *`,
      [fields.fundal_height_cm || null, fields.lochia || null, fields.systolic_bp || null,
       fields.diastolic_bp || null, fields.pulse || null, fields.temperature || null,
       fields.breastfeeding_status || null, fields.breast_engorged ?? null, fields.breast_mastitis ?? null,
       fields.perineal_wound || null, fields.c_section_wound || null,
       fields.family_planning_discussed ?? null, fields.family_planning_method || null,
       fields.complications || null, fields.notes || null, id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: true, message: 'Postnatal visit not found' });
      return;
    }
    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

export default router;
