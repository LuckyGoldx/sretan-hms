import { Router, Request, Response } from 'express';
import pool from '../db/pool';
import { getInsuranceUser } from '../utils/insuranceAuth';
import { readClinicProfile } from '../config/reader';

const router = Router();

function getTenantId(): string {
  return readClinicProfile().GLOBAL_SAAS_TENANT_ID;
}

router.get('/api/insurance/invoices', async (req: Request, res: Response) => {
  try {
    const insuranceUser = getInsuranceUser(req);
    const { provider_id, status } = req.query;
    let query = `SELECT i.*, pr.name as provider_name, pr.code as provider_code
                 FROM insurance_invoices i
                 LEFT JOIN insurance_providers pr ON i.provider_id = pr.id
                 WHERE 1=1`;
    const params: any[] = [];
    let idx = 1;

    // Auto-filter by provider scope
    if (insuranceUser && insuranceUser.providerId) {
      query += ` AND i.provider_id = $${idx++}`;
      params.push(insuranceUser.providerId);
    }

    if (provider_id) { query += ` AND i.provider_id = $${idx++}`; params.push(provider_id); }
    if (status) { query += ` AND i.status = $${idx++}`; params.push(status); }
    query += ' ORDER BY i.created_at DESC LIMIT 50';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// Summary of billable (pending) services per provider — used before generating
router.get('/api/insurance/invoices/billable-summary', async (req: Request, res: Response) => {
  try {
    const { provider_id, period_start, period_end } = req.query;
    if (!provider_id || !period_start || !period_end) {
      res.status(400).json({ error: true, message: 'Provider and period are required' });
      return;
    }
    const result = await pool.query(
      `SELECT COUNT(*)::int as item_count,
              COALESCE(SUM(cs.total_price),0) as total_amount,
              COUNT(DISTINCT cs.case_id)::int as case_count
       FROM insurance_case_services cs
       JOIN insurance_cases c ON cs.case_id = c.id
       WHERE c.provider_id = $1
         AND cs.status = 'pending'
         AND cs.created_at >= $2 AND cs.created_at <= $3`,
      [provider_id, period_start + 'T00:00:00Z', period_end + 'T23:59:59Z']
    );
    res.json({
      item_count: result.rows[0].item_count,
      total_amount: result.rows[0].total_amount,
      case_count: result.rows[0].case_count,
    });
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.get('/api/insurance/invoices/:id', async (req: Request, res: Response) => {
  try {
    const invResult = await pool.query(
      `SELECT i.*, pr.name as provider_name, pr.code as provider_code
       FROM insurance_invoices i
       LEFT JOIN insurance_providers pr ON i.provider_id = pr.id
       WHERE i.id = $1`,
      [req.params.id]
    );
    if (invResult.rows.length === 0) { res.status(404).json({ error: true, message: 'Invoice not found' }); return; }

    const itemsResult = await pool.query(
      `SELECT ii.*, c.case_number, p.full_name as patient_name
       FROM insurance_invoice_items ii
       LEFT JOIN insurance_cases c ON ii.case_id = c.id
       LEFT JOIN patients p ON c.patient_id = p.id
       WHERE ii.invoice_id = $1`,
      [req.params.id]
    );
    res.json({ ...invResult.rows[0], items: itemsResult.rows });
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// Get invoices for a specific case
router.get('/api/insurance/cases/:caseId/invoices', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT DISTINCT i.*, pr.name as provider_name, pr.code as provider_code
       FROM insurance_invoices i
       JOIN insurance_invoice_items ii ON ii.invoice_id = i.id
       LEFT JOIN insurance_providers pr ON i.provider_id = pr.id
       WHERE ii.case_id = $1
       ORDER BY i.created_at DESC`,
      [req.params.caseId]
    );
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// Generate invoice for a single case's pending services (used from patient detail)
router.post('/api/insurance/cases/:caseId/generate-invoice', async (req: Request, res: Response) => {
  try {
    const { due_date, generated_by } = req.body;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const caseResult = await client.query(
        `SELECT c.id, c.provider_id, c.tenant_id, pr.code as provider_code
         FROM insurance_cases c
         LEFT JOIN insurance_providers pr ON c.provider_id = pr.id
         WHERE c.id = $1`,
        [req.params.caseId]
      );
      if (caseResult.rows.length === 0) {
        await client.query('ROLLBACK');
        res.status(404).json({ error: true, message: 'Case not found' });
        return;
      }
      const c = caseResult.rows[0];

      // Only pending services for this case
      const servicesResult = await client.query(
        `SELECT id, service_type, service_name, quantity, unit_price, total_price
         FROM insurance_case_services WHERE case_id = $1 AND status = 'pending' ORDER BY created_at`,
        [req.params.caseId]
      );
      if (servicesResult.rows.length === 0) {
        await client.query('ROLLBACK');
        res.status(400).json({ error: true, message: 'No pending services to invoice for this case' });
        return;
      }
      const services = servicesResult.rows;
      const totalAmount = services.reduce((s, r) => s + parseFloat(r.total_price || 0), 0);

      // Invoice number
      const year = new Date().getFullYear();
      const code = c.provider_code || 'INS';
      const countResult = await client.query(
        'SELECT COUNT(*)::int as count FROM insurance_invoices WHERE invoice_number LIKE $1',
        [`INV-${code}-${year}-%`]
      );
      const invNum = `INV-${code}-${year}-${String((countResult.rows[0]?.count || 0) + 1).padStart(4, '0')}`;
      const invoiceId = crypto.randomUUID();
      const today = new Date().toISOString().slice(0, 10);

      await client.query(
        `INSERT INTO insurance_invoices (id, tenant_id, provider_id, invoice_number, period_start, period_end, total_amount, due_date, generated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [invoiceId, c.tenant_id, c.provider_id, invNum, today, today, totalAmount, due_date || null, generated_by || null]
      );

      for (const svc of services) {
        const itemId = crypto.randomUUID();
        await client.query(
          `INSERT INTO insurance_invoice_items (id, invoice_id, case_id, service_type, description, quantity, unit_price, total_price)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [itemId, invoiceId, req.params.caseId, svc.service_type, svc.service_name, svc.quantity, svc.unit_price, svc.total_price]
        );
        await client.query(
          `UPDATE insurance_case_services
           SET status = 'invoiced', invoice_id = $1, invoice_item_id = $2, invoiced_at = NOW()
           WHERE id = $3 AND status = 'pending'`,
          [invoiceId, itemId, svc.id]
        );
      }

      await client.query(
        `UPDATE insurance_cases SET
           total_invoiced = (SELECT COALESCE(SUM(total_price),0) FROM insurance_case_services WHERE case_id = $1 AND status = 'invoiced'),
           total_uninvoiced = (SELECT COALESCE(SUM(total_price),0) FROM insurance_case_services WHERE case_id = $1 AND status = 'pending')
         WHERE id = $1`,
        [req.params.caseId]
      );

      await client.query('COMMIT');

      const result = await pool.query(
        `SELECT i.*, pr.name as provider_name, pr.code as provider_code
         FROM insurance_invoices i LEFT JOIN insurance_providers pr ON i.provider_id = pr.id
         WHERE i.id = $1`, [invoiceId]
      );
      res.status(201).json({
        ...result.rows[0],
        items_count: services.length,
        total_amount: totalAmount,
      });
    } catch (err: any) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.post('/api/insurance/invoices', async (req: Request, res: Response) => {
  try {
    const { provider_id, period_start, period_end, due_date, generated_by } = req.body;
    if (!provider_id || !period_start || !period_end) {
      res.status(400).json({ error: true, message: 'Provider and period are required' });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Only select PENDING services (never re-invoice already-invoiced ones)
      const servicesResult = await client.query(
        `SELECT cs.id, cs.case_id, cs.tenant_id, cs.service_type, cs.service_name,
                cs.quantity, cs.unit_price, cs.total_price
         FROM insurance_case_services cs
         JOIN insurance_cases c ON cs.case_id = c.id
         WHERE c.provider_id = $1
           AND cs.status = 'pending'
           AND cs.created_at >= $2 AND cs.created_at <= $3
         ORDER BY cs.case_id, cs.created_at`,
        [provider_id, period_start + 'T00:00:00Z', period_end + 'T23:59:59Z']
      );

      if (servicesResult.rows.length === 0) {
        await client.query('ROLLBACK');
        res.status(400).json({ error: true, message: 'No new billable (pending) services found in this period' });
        return;
      }

      const services = servicesResult.rows;
      const totalAmount = services.reduce((s, r) => s + parseFloat(r.total_price || 0), 0);
      const caseIds = [...new Set(services.map(s => s.case_id))];

      // Generate invoice number
      const year = new Date().getFullYear();
      const provResult = await client.query('SELECT code FROM insurance_providers WHERE id = $1', [provider_id]);
      const code = provResult.rows[0]?.code || 'INS';
      const countResult = await client.query(
        'SELECT COUNT(*)::int as count FROM insurance_invoices WHERE invoice_number LIKE $1',
        [`INV-${code}-${year}-%`]
      );
      const invNum = `INV-${code}-${year}-${String((countResult.rows[0]?.count || 0) + 1).padStart(4, '0')}`;

      const invoiceId = crypto.randomUUID();
      const tenantId = getTenantId();

      await client.query(
        `INSERT INTO insurance_invoices (id, tenant_id, provider_id, invoice_number, period_start, period_end, total_amount, due_date, generated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [invoiceId, tenantId, provider_id, invNum, period_start, period_end, totalAmount, due_date || null, generated_by || null]
      );

      // Create invoice items AND mark each service as invoiced, atomically
      for (const svc of services) {
        const itemId = crypto.randomUUID();
        await client.query(
          `INSERT INTO insurance_invoice_items (id, invoice_id, case_id, service_type, description, quantity, unit_price, total_price)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [itemId, invoiceId, svc.case_id, svc.service_type, svc.service_name, svc.quantity, svc.unit_price, svc.total_price]
        );
        await client.query(
          `UPDATE insurance_case_services
           SET status = 'invoiced', invoice_id = $1, invoice_item_id = $2, invoiced_at = NOW()
           WHERE id = $3 AND status = 'pending'`,
          [invoiceId, itemId, svc.id]
        );
      }

      // Refresh total_invoiced / total_uninvoiced for affected cases
      for (const cId of caseIds) {
        await client.query(
          `UPDATE insurance_cases SET
             total_invoiced = (SELECT COALESCE(SUM(total_price),0) FROM insurance_case_services WHERE case_id = $1 AND status = 'invoiced'),
             total_uninvoiced = (SELECT COALESCE(SUM(total_price),0) FROM insurance_case_services WHERE case_id = $1 AND status = 'pending')
           WHERE id = $1`,
          [cId]
        );
      }

      await client.query('COMMIT');

      const result = await pool.query(
        `SELECT i.*, pr.name as provider_name, pr.code as provider_code
         FROM insurance_invoices i LEFT JOIN insurance_providers pr ON i.provider_id = pr.id
         WHERE i.id = $1`, [invoiceId]
      );
      res.status(201).json({
        ...result.rows[0],
        items_count: services.length,
        cases_count: caseIds.length,
      });
    } catch (err: any) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.put('/api/insurance/invoices/:id', async (req: Request, res: Response) => {
  try {
    const { status, paid_amount, claim_reference, expected_payment_date } = req.body;
    const updates: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (status) { updates.push(`status = $${idx++}`); params.push(status); }
    if (claim_reference) { updates.push(`claim_reference = $${idx++}`); params.push(claim_reference); }
    if (expected_payment_date) { updates.push(`expected_payment_date = $${idx++}`); params.push(expected_payment_date); }
    if (status === 'sent') { updates.push('claim_submitted_at = NOW()'); }

    // Handle paid_amount once — for 'paid' status, accumulate the received amount
    if (status === 'paid' && paid_amount !== undefined) {
      updates.push(`paid_amount = COALESCE(paid_amount, 0) + $${idx++}`);
      params.push(parseFloat(paid_amount) || 0);
    } else if (paid_amount !== undefined) {
      updates.push(`paid_amount = $${idx++}`);
      params.push(paid_amount);
    }

    if (updates.length === 0) { res.status(400).json({ error: true, message: 'No updates provided' }); return; }

    params.push(req.params.id);
    const result = await pool.query(
      `UPDATE insurance_invoices SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
      params
    );
    if (result.rows.length === 0) { res.status(404).json({ error: true, message: 'Invoice not found' }); return; }
    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// Cancel a draft invoice — reopen its services as pending
router.put('/api/insurance/invoices/:id/cancel', async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `UPDATE insurance_invoices SET status = 'cancelled' WHERE id = $1 AND status = 'draft' RETURNING id, invoice_number, status`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(400).json({ error: true, message: 'Invoice not found or not in draft status' });
      return;
    }

    // Reopen all services that were consumed by this invoice
    const reopened = await client.query(
      `UPDATE insurance_case_services
       SET status = 'pending', invoice_id = NULL, invoice_item_id = NULL, invoiced_at = NULL
       WHERE invoice_id = $1 AND status = 'invoiced'
       RETURNING case_id`,
      [req.params.id]
    );

    // Refresh affected cases' totals
    const caseIds = [...new Set(reopened.rows.map(r => r.case_id))];
    for (const cId of caseIds) {
      await client.query(
        `UPDATE insurance_cases SET
           total_invoiced = (SELECT COALESCE(SUM(total_price),0) FROM insurance_case_services WHERE case_id = $1 AND status = 'invoiced'),
           total_uninvoiced = (SELECT COALESCE(SUM(total_price),0) FROM insurance_case_services WHERE case_id = $1 AND status = 'pending')
         WHERE id = $1`,
        [cId]
      );
    }

    await client.query('COMMIT');
    res.json({
      ...result.rows[0],
      services_reopened: reopened.rowCount,
      message: `Invoice ${result.rows[0].invoice_number} cancelled. ${reopened.rowCount} service(s) reopened for re-billing.`,
    });
  } catch (err: any) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: true, message: err.message });
  } finally {
    client.release();
  }
});

// Void a paid/sent invoice via credit note — reopen services for re-billing
router.put('/api/insurance/invoices/:id/void', async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `UPDATE insurance_invoices SET status = 'voided' WHERE id = $1 AND status IN ('sent', 'paid') RETURNING id, invoice_number, status`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(400).json({ error: true, message: 'Only sent or paid invoices can be voided' });
      return;
    }

    const reopened = await client.query(
      `UPDATE insurance_case_services
       SET status = 'pending', invoice_id = NULL, invoice_item_id = NULL, invoiced_at = NULL
       WHERE invoice_id = $1 AND status = 'invoiced'
       RETURNING case_id`,
      [req.params.id]
    );

    const caseIds = [...new Set(reopened.rows.map(r => r.case_id))];
    for (const cId of caseIds) {
      await client.query(
        `UPDATE insurance_cases SET
           total_invoiced = (SELECT COALESCE(SUM(total_price),0) FROM insurance_case_services WHERE case_id = $1 AND status = 'invoiced'),
           total_uninvoiced = (SELECT COALESCE(SUM(total_price),0) FROM insurance_case_services WHERE case_id = $1 AND status = 'pending')
         WHERE id = $1`,
        [cId]
      );
    }

    await client.query('COMMIT');
    res.json({
      ...result.rows[0],
      services_reopened: reopened.rowCount,
      message: `Invoice ${result.rows[0].invoice_number} voided. ${reopened.rowCount} service(s) reopened for re-billing.`,
    });
  } catch (err: any) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: true, message: err.message });
  } finally {
    client.release();
  }
});

export default router;
