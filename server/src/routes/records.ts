import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import pool from '../db/pool';

const DOCUMENTS_DIR = 'C:/hms/assets/documents';
if (!fs.existsSync(DOCUMENTS_DIR)) fs.mkdirSync(DOCUMENTS_DIR, { recursive: true });

var storage = multer.diskStorage({
  destination: function(_req, _file, cb) { cb(null, DOCUMENTS_DIR); },
  filename: function(_req, file, cb) {
    var uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    var ext = path.extname(file.originalname);
    cb(null, uniqueSuffix + ext);
  },
});
var upload = multer({ storage: storage, limits: { fileSize: 20 * 1024 * 1024 } });


const router = Router();

// --- Patient Documents ---

router.get('/api/patients/:patientId/documents', async (req: Request, res: Response) => {
  try {
    const { patientId } = req.params;
    const result = await pool.query(
      `SELECT d.*, s.name as uploaded_by_name FROM patient_documents d
       LEFT JOIN staff_users s ON s.id = d.uploaded_by
       WHERE d.patient_id = $1 ORDER BY d.created_at DESC`,
      [patientId]
    );
    res.json(result.rows);
  } catch (err: any) { res.status(500).json({ error: true, message: err.message }); }
});

router.post('/api/patients/:patientId/documents', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const { patientId } = req.params;
    const { document_type, notes, uploaded_by } = req.body;
    if (!document_type) {
      res.status(400).json({ error: true, message: 'document_type is required' });
      return;
    }
    var file = req.file;
    var fileName = file ? file.originalname : (req.body.file_name || 'unnamed');
    var fileSize = file ? file.size : null;
    var filePath = file ? file.filename : null;
    var id = uuidv4();
    const result = await pool.query(
      'INSERT INTO patient_documents (id, patient_id, document_type, file_name, file_size, file_path, notes, uploaded_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
      [id, patientId, document_type, fileName, fileSize, filePath, notes || null, uploaded_by || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err: any) { res.status(500).json({ error: true, message: err.message }); }
});

router.put('/api/patients/:patientId/documents/:docId/meta', async (req: Request, res: Response) => {
  try {
    const { docId } = req.params;
    const { file_name, notes } = req.body;
    const result = await pool.query(
      'UPDATE patient_documents SET file_name = COALESCE($1, file_name), notes = COALESCE($2, notes) WHERE id = $3 RETURNING *',
      [file_name || null, notes || null, docId]
    );
    if (result.rows.length === 0) { res.status(404).json({ error: true, message: 'Document not found' }); return; }
    res.json(result.rows[0]);
  } catch (err: any) { res.status(500).json({ error: true, message: err.message }); }
});

router.delete('/api/patients/:patientId/documents/:docId', async (req: Request, res: Response) => {
  try {
    const { docId } = req.params;
    const result = await pool.query('DELETE FROM patient_documents WHERE id = $1 RETURNING *', [docId]);
    if (result.rows.length === 0) { res.status(404).json({ error: true, message: 'Document not found' }); return; }
    res.json({ success: true, deleted: result.rows[0] });
  } catch (err: any) { res.status(500).json({ error: true, message: err.message }); }
});

// --- Record Requests ---

router.get('/api/record-requests', async (req: Request, res: Response) => {
  try {
    const { status } = req.query;
    let query = `SELECT r.*, p.full_name as patient_name, p.hospital_number, s.name as approved_by_name
                 FROM record_requests r
                 JOIN patients p ON p.id = r.patient_id
                 LEFT JOIN staff_users s ON s.id = r.approved_by
                 WHERE 1=1`;
    const params: any[] = [];
    if (status) { query += ' AND r.status = $1'; params.push(status); }
    query += ' ORDER BY r.created_at DESC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err: any) { res.status(500).json({ error: true, message: err.message }); }
});

router.post('/api/record-requests', async (req: Request, res: Response) => {
  try {
    const { patient_id, requester_name, requester_contact, purpose, notes } = req.body;
    if (!patient_id || !requester_name) {
      res.status(400).json({ error: true, message: 'patient_id and requester_name are required' });
      return;
    }
    const id = uuidv4();
    const result = await pool.query(
      `INSERT INTO record_requests (id, patient_id, requester_name, requester_contact, purpose, notes)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [id, patient_id, requester_name, requester_contact || null, purpose || null, notes || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err: any) { res.status(500).json({ error: true, message: err.message }); }
});

router.put('/api/record-requests/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status, approved_by, notes } = req.body;
    const fulfilled = status === 'fulfilled' ? new Date().toISOString() : null;
    const result = await pool.query(
      `UPDATE record_requests SET status = COALESCE($1, status), approved_by = COALESCE($2, approved_by), fulfilled_at = COALESCE($3, fulfilled_at), notes = COALESCE($4, notes) WHERE id = $5 RETURNING *`,
      [status || null, approved_by || null, fulfilled, notes || null, id]
    );
    if (result.rows.length === 0) { res.status(404).json({ error: true, message: 'Request not found' }); return; }
    res.json(result.rows[0]);
  } catch (err: any) { res.status(500).json({ error: true, message: err.message }); }
});

// --- Patient Search ---

router.get('/api/patients/search', async (req: Request, res: Response) => {
  try {
    const { q } = req.query;
    if (!q) { res.json([]); return; }
    const searchTerm = `%${q}%`;
    const result = await pool.query(
      `SELECT id, full_name, hospital_number, sex, dob, phone, status, blood_type
       FROM patients
       WHERE full_name ILIKE $1 OR hospital_number ILIKE $1 OR phone ILIKE $1
       ORDER BY full_name LIMIT 20`,
      [searchTerm]
    );
    res.json(result.rows);
  } catch (err: any) { res.status(500).json({ error: true, message: err.message }); }
});



router.get('/api/patients/:patientId/audit', async (req: Request, res: Response) => {
  try {
    const { patientId } = req.params;
    const result = await pool.query(
      `SELECT a.*, s.name as performed_by_name FROM audit_logs a
       LEFT JOIN staff_users s ON s.id = a.performed_by
       WHERE a.record_id = $1 AND a.table_name = 'patients'
       ORDER BY a.created_at DESC LIMIT 50`,
      [patientId]
    );
    res.json(result.rows);
  } catch (err: any) { res.status(500).json({ error: true, message: err.message }); }
});



router.get('/api/documents/:filename', async (req: Request, res: Response) => {
  try {
    var filePath = path.join(DOCUMENTS_DIR, req.params.filename);
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: true, message: 'File not found' });
      return;
    }
    res.sendFile(filePath);
  } catch (err: any) { res.status(500).json({ error: true, message: err.message }); }
});



// --- Custom Insurance Types ---

router.get('/api/insurance-types', async (req: Request, res: Response) => {
  try {
    const { provider } = req.query;
    let query = 'SELECT * FROM custom_insurance_types';
    var params: any[] = [];
    if (provider) { query += ' WHERE provider = $1'; params.push(provider); }
    query += ' ORDER BY type_name';
    var result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err: any) { res.status(500).json({ error: true, message: err.message }); }
});

router.post('/api/insurance-types', async (req: Request, res: Response) => {
  try {
    const { provider, type_name, created_by } = req.body;
    if (!provider || !type_name) { res.status(400).json({ error: true, message: 'provider and type_name are required' }); return; }
    var id = uuidv4();
    var result = await pool.query('INSERT INTO custom_insurance_types (id, provider, type_name, created_by) VALUES ($1, $2, $3, $4) RETURNING *', [id, provider, type_name, created_by || null]);
    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    if (err.code === '23505') { res.status(409).json({ error: true, message: 'Type already exists for this provider' }); return; }
    res.status(500).json({ error: true, message: err.message });
  }
});

router.delete('/api/insurance-types/:id', async (req: Request, res: Response) => {
  try {
    var result = await pool.query('DELETE FROM custom_insurance_types WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) { res.status(404).json({ error: true, message: 'Type not found' }); return; }
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: true, message: err.message }); }
});

export default router;
