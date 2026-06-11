import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import pool from '../db/pool';
import { readClinicProfile } from '../config/reader';
import { clockGuard } from '../middleware/clockGuard';

const router = Router();

function getTenantId(): string {
  return readClinicProfile().GLOBAL_SAAS_TENANT_ID;
}

router.get('/api/patients', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const { status, search, doctor_id } = req.query;
    let query = 'SELECT DISTINCT p.* FROM patients p';
    const params: any[] = [tenantId];
    let paramIndex = 2;

    if (doctor_id) {
      query += ` JOIN encounters e ON e.patient_id = p.id AND e.staff_id = $${paramIndex}`;
      params.push(doctor_id);
      paramIndex++;
    }

    query += ' WHERE p.tenant_id = $1';

    if (status) {
      query += ` AND p.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (search) {
      query += ` AND (p.full_name ILIKE $${paramIndex} OR p.hospital_number::text ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    query += ' ORDER BY p.created_at DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.get('/api/patients/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const { id } = req.params;

    const patientResult = await pool.query(
      'SELECT * FROM patients WHERE id = $1 AND tenant_id = $2',
      [id, tenantId]
    );

    if (patientResult.rows.length === 0) {
      res.status(404).json({ error: true, message: 'Patient not found' });
      return;
    }

    const encountersResult = await pool.query(
      'SELECT * FROM encounters WHERE patient_id = $1 AND tenant_id = $2 ORDER BY created_at DESC',
      [id, tenantId]
    );

    res.json({
      ...patientResult.rows[0],
      encounters: encountersResult.rows,
    });
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.post('/api/patients', async (req: Request, res: Response) => {
  try {
    await clockGuard(pool, 'patients');

    const tenantId = getTenantId();
    

    if (!full_name || !dob || !sex) {
      res.status(400).json({ error: true, message: 'Required fields: full_name, dob, sex' });
      return;
    }

    const id = uuidv4();
    const seqResult = await pool.query("SELECT COALESCE(MAX(SUBSTRING(hospital_number FROM 'SRT-2026-(\\d+)')::int), 0) + 1 AS next_num FROM patients WHERE hospital_number ~ '^SRT-2026-'");
    const nextNum = seqResult.rows[0]?.next_num || 1;
    const hospitalNumber = `SRT-2026-${String(nextNum).padStart(5, '0')}`;
    const result = await pool.query(
      `INSERT INTO patients (id, tenant_id, hospital_number, full_name, dob, sex, phone, next_of_kin, insurance, blood_type, status, email, address, emergency_contact_name, emergency_contact_phone, occupation, marital_status, nationality, state_of_origin, lga, next_of_kin_address, relationship, insurance_type, insurance_sub_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)
       RETURNING *`,
      [id, tenantId, hospitalNumber, full_name, dob, sex, phone || null, next_of_kin || null, insurance || null, blood_type || null, status || 'checked_in', email || null, address || null, emergency_contact_name || null, emergency_contact_phone || null, occupation || null, marital_status || null, nationality || null, state_of_origin || null, lga || null, next_of_kin_address || null, relationship || null, insurance_type || null, insurance_sub_type || null]
    );

    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.put('/api/patients/:id', async (req: Request, res: Response) => {
  try {
    await clockGuard(pool, 'patients');

    const tenantId = getTenantId();
    const { id } = req.params;
    const { full_name, dob, sex, phone, next_of_kin, insurance, blood_type, status, email, address, emergency_contact_name, emergency_contact_phone, occupation, marital_status, nationality, state_of_origin, lga, next_of_kin_address, relationship, insurance_type, insurance_sub_type } = req.body;

    const existing = await pool.query(
      'SELECT * FROM patients WHERE id = $1 AND tenant_id = $2',
      [id, tenantId]
    );

    if (existing.rows.length === 0) {
      res.status(404).json({ error: true, message: 'Patient not found' });
      return;
    }

    const result = await pool.query(
      `UPDATE patients SET
        full_name = COALESCE($1, full_name),
        dob = COALESCE($2, dob),
        sex = COALESCE($3, sex),
        phone = COALESCE($4, phone),
        next_of_kin = COALESCE($5, next_of_kin),
        insurance = COALESCE($6, insurance),
        blood_type = COALESCE($7, blood_type),
        status = COALESCE($8, status),
        email = COALESCE($9, email),
        address = COALESCE($10, address),
        emergency_contact_name = COALESCE($11, emergency_contact_name),
        emergency_contact_phone = COALESCE($12, emergency_contact_phone),
        occupation = COALESCE($13, occupation),
        marital_status = COALESCE($14, marital_status),
        nationality = COALESCE($15, nationality)
       WHERE id = $16 AND tenant_id = $17
       RETURNING *`,
      [full_name, dob, sex, phone, next_of_kin, insurance, blood_type, status, id, tenantId]
    );

    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.delete('/api/patients/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const { id } = req.params;

    const result = await pool.query(
      `UPDATE patients SET status = 'discharged' WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [id, tenantId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: true, message: 'Patient not found' });
      return;
    }

    res.json({ message: 'Patient discharged', patient: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

export default router;
