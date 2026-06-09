import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import pool from '../db/pool';

const router = Router();

router.get('/api/wards', async (_req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM wards ORDER BY name');
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.get('/api/admissions', async (req: Request, res: Response) => {
  try {
    const { patient_id, status } = req.query;
    let query = `SELECT a.*, w.name as ward_name, s.name as admitted_by_name, sd.name as discharged_by_name,
                 p.full_name as patient_name, p.hospital_number
                 FROM admissions a
                 JOIN wards w ON w.id = a.ward_id
                 JOIN patients p ON p.id = a.patient_id
                 LEFT JOIN staff_users s ON s.id = a.admitted_by
                 LEFT JOIN staff_users sd ON sd.id = a.discharged_by
                 WHERE 1=1`;
    const params: any[] = [];
    let idx = 1;

    if (patient_id) {
      query += ` AND a.patient_id = $${idx}`;
      params.push(patient_id);
      idx++;
    }
    if (status) {
      query += ` AND a.status = $${idx}`;
      params.push(status);
      idx++;
    }

    query += ' ORDER BY a.admitted_at DESC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.post('/api/admissions', async (req: Request, res: Response) => {
  try {
    const { patient_id, ward_id, notes, admitted_by } = req.body;
    if (!patient_id || !ward_id) {
      res.status(400).json({ error: true, message: 'patient_id and ward_id are required' });
      return;
    }
    const active = await pool.query('SELECT id FROM admissions WHERE patient_id = $1 AND status = $2', [patient_id, 'active']);
    if (active.rows.length > 0) {
      res.status(409).json({ error: true, message: 'Patient already has an active admission' });
      return;
    }
    const id = uuidv4();
    const result = await pool.query(
      `INSERT INTO admissions (id, patient_id, ward_id, notes, admitted_by) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [id, patient_id, ward_id, notes || null, admitted_by || null]
    );
    const ward = await pool.query('SELECT name FROM wards WHERE id = $1', [ward_id]);
    let admittedByName = '';
    if (admitted_by) {
      const s = await pool.query('SELECT name FROM staff_users WHERE id = $1', [admitted_by]);
      admittedByName = s.rows[0]?.name || '';
    }
    res.status(201).json({ ...result.rows[0], ward_name: ward.rows[0]?.name || '', admitted_by_name: admittedByName });
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.put('/api/admissions/:id/discharge', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { discharged_by } = req.body;
    const result = await pool.query(
      `UPDATE admissions SET status = 'discharged', discharged_at = NOW(), discharged_by = COALESCE($1, discharged_by) WHERE id = $2 AND status = 'active' RETURNING *`,
      [discharged_by || null, id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: true, message: 'Active admission not found' });
      return;
    }
    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.get('/api/admissions/active', async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT a.*, w.name as ward_name, p.full_name as patient_name, p.hospital_number,
              s.name as admitted_by_name, sd.name as discharged_by_name
       FROM admissions a
       JOIN wards w ON w.id = a.ward_id
       JOIN patients p ON p.id = a.patient_id
       LEFT JOIN staff_users s ON s.id = a.admitted_by
       LEFT JOIN staff_users sd ON sd.id = a.discharged_by
       WHERE a.status = 'active' ORDER BY a.admitted_at DESC`
    );
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});



router.put('/api/admissions/:id/bed', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { bed_number } = req.body;
    // Get the admission first to check ward_id
    const adm = await pool.query('SELECT ward_id FROM admissions WHERE id = $1 AND status = $2', [id, 'active']);
    if (adm.rows.length === 0) {
      res.status(404).json({ error: true, message: 'Active admission not found' });
      return;
    }
    const wardId = adm.rows[0].ward_id;
    // Check no other active admission in same ward has this bed
    const dup = await pool.query('SELECT id FROM admissions WHERE ward_id = $1 AND bed_number = $2 AND status = $3 AND id != $4',
      [wardId, bed_number, 'active', id]);
    if (dup.rows.length > 0) {
      res.status(409).json({ error: true, message: 'Bed already assigned to another patient in this ward' });
      return;
    }
    const result = await pool.query(
      `UPDATE admissions SET bed_number = COALESCE($1, bed_number) WHERE id = $2 AND status = 'active' RETURNING *`,
      [bed_number || null, id]
    );
    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});



router.get('/api/beds', async (req: Request, res: Response) => {
  try {
    const { ward_id } = req.query;
    let query = 'SELECT b.*, CASE WHEN a.id IS NOT NULL THEN true ELSE false END as occupied FROM beds b LEFT JOIN admissions a ON a.bed_number = b.bed_number AND a.ward_id = b.ward_id AND a.status = $1';
    const params: any[] = ['active'];
    if (ward_id) { query += ' AND b.ward_id = $2'; params.push(ward_id); }
    query += ' ORDER BY b.bed_number';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err: any) { res.status(500).json({ error: true, message: err.message }); }
});

router.post('/api/beds', async (req: Request, res: Response) => {
  try {
    const { ward_id, bed_number } = req.body;
    if (!ward_id || !bed_number) { res.status(400).json({ error: true, message: 'ward_id and bed_number are required' }); return; }
    const id = uuidv4();
    const result = await pool.query('INSERT INTO beds (id, ward_id, bed_number) VALUES ($1, $2, $3) RETURNING *', [id, ward_id, bed_number]);
    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    if (err.code === '23505') { res.status(409).json({ error: true, message: 'Bed already exists in this ward' }); return; }
    res.status(500).json({ error: true, message: err.message });
  }
});

export default router;
