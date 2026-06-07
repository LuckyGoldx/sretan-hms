import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import pool from '../db/pool';
import { readClinicProfile } from '../config/reader';
import { clockGuard } from '../middleware/clockGuard';

const router = Router();

function getTenantId(): string {
  return readClinicProfile().GLOBAL_SAAS_TENANT_ID;
}

router.get('/api/invoices', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const { patient_id, status } = req.query;
    let query = 'SELECT * FROM billing_invoices WHERE tenant_id = $1';
    const params: any[] = [tenantId];
    let paramIndex = 2;

    if (patient_id) {
      query += ` AND patient_id = $${paramIndex}`;
      params.push(patient_id);
      paramIndex++;
    }

    if (status) {
      query += ` AND status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    query += ' ORDER BY created_at DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.post('/api/invoices', async (req: Request, res: Response) => {
  try {
    await clockGuard(pool, 'billing_invoices');

    const tenantId = getTenantId();
    const { patient_id, encounter_id, total_amount, payment_method, payment_ref } = req.body;

    if (!patient_id || total_amount === undefined) {
      res.status(400).json({ error: true, message: 'patient_id and total_amount are required' });
      return;
    }

    const id = uuidv4();
    const result = await pool.query(
      `INSERT INTO billing_invoices (id, tenant_id, patient_id, encounter_id, total_amount, amount_paid, balance, payment_method, payment_ref, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [id, tenantId, patient_id, encounter_id || null, total_amount, 0, total_amount, payment_method || null, payment_ref || null, 'pending']
    );

    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.put('/api/invoices/:id/pay', async (req: Request, res: Response) => {
  try {
    await clockGuard(pool, 'billing_invoices');

    const tenantId = getTenantId();
    const { id } = req.params;
    const { amount, payment_method, payment_ref } = req.body;

    const invoiceResult = await pool.query(
      'SELECT * FROM billing_invoices WHERE id = $1 AND tenant_id = $2',
      [id, tenantId]
    );

    if (invoiceResult.rows.length === 0) {
      res.status(404).json({ error: true, message: 'Invoice not found' });
      return;
    }

    const invoice = invoiceResult.rows[0];
    const paymentAmount = amount || invoice.balance;
    const newAmountPaid = parseFloat(invoice.amount_paid) + parseFloat(paymentAmount);
    const newBalance = parseFloat(invoice.total_amount) - newAmountPaid;
    const newStatus = newBalance <= 0 ? 'paid' : 'partial';

    let paymentMethodStr = invoice.payment_method;
    if (payment_method) {
      if (Array.isArray(payment_method)) {
        paymentMethodStr = JSON.stringify(payment_method);
      } else {
        paymentMethodStr = payment_method;
      }
    }

    const result = await pool.query(
      `UPDATE billing_invoices SET
        amount_paid = $1,
        balance = $2,
        status = $3,
        payment_method = COALESCE($4, payment_method),
        payment_ref = COALESCE($5, payment_ref)
       WHERE id = $6 AND tenant_id = $7
       RETURNING *`,
      [newAmountPaid, newBalance, newStatus, paymentMethodStr, payment_ref || null, id, tenantId]
    );

    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

export default router;
