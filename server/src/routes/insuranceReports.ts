import { Router, Request, Response } from 'express';
import pool from '../db/pool';
import { getInsuranceUser } from '../utils/insuranceAuth';

const router = Router();

// Utilization: service count by type, per provider/period
router.get('/api/insurance/reports/utilization', async (req: Request, res: Response) => {
  try {
    const insuranceUser = getInsuranceUser(req);
    const { provider_id, period_start, period_end } = req.query;
    if (!provider_id || !period_start || !period_end) {
      res.status(400).json({ error: true, message: 'Provider, period_start and period_end are required' });
      return;
    }
    const result = await pool.query(
      `SELECT cs.service_type, COUNT(*)::int as count, SUM(cs.total_price) as total
       FROM insurance_case_services cs
       JOIN insurance_cases c ON cs.case_id = c.id
       WHERE c.provider_id = $1
         AND cs.created_at >= $2 AND cs.created_at <= $3
         ${insuranceUser?.providerId ? 'AND c.provider_id = $4' : ''}
       GROUP BY cs.service_type ORDER BY total DESC`,
      insuranceUser?.providerId
        ? [provider_id, period_start + 'T00:00:00Z', period_end + 'T23:59:59Z', insuranceUser.providerId]
        : [provider_id, period_start + 'T00:00:00Z', period_end + 'T23:59:59Z']
    );
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// Financial: billed vs paid vs invoiced per provider/period
router.get('/api/insurance/reports/financial', async (req: Request, res: Response) => {
  try {
    const insuranceUser = getInsuranceUser(req);
    const { provider_id, period_start, period_end } = req.query;
    if (!period_start || !period_end) {
      res.status(400).json({ error: true, message: 'period_start and period_end are required' });
      return;
    }
    let query = `SELECT pr.id, pr.name as provider_name, pr.code as provider_code,
                        COUNT(DISTINCT cs.case_id)::int as case_count,
                        COALESCE(SUM(cs.total_price),0) as total_billed,
                        COALESCE(SUM(CASE WHEN cs.status = 'invoiced' THEN cs.total_price ELSE 0 END),0) as total_invoiced,
                        COUNT(DISTINCT i.id)::int as invoice_count,
                        COALESCE(SUM(i.paid_amount),0) as total_paid
                 FROM insurance_providers pr
                 LEFT JOIN insurance_case_services cs ON EXISTS (
                   SELECT 1 FROM insurance_cases c
                   WHERE c.provider_id = pr.id AND cs.case_id = c.id
                 )
                 LEFT JOIN insurance_invoices i ON i.provider_id = pr.id
                   AND i.created_at >= $1 AND i.created_at <= $2
                 WHERE cs.id IS NOT NULL`;
    const params: any[] = [period_start + 'T00:00:00Z', period_end + 'T23:59:59Z'];
    let idx = 3;

    if (provider_id) { query += ` AND pr.id = $${idx++}`; params.push(provider_id); }
    if (insuranceUser?.providerId) { query += ` AND pr.id = $${idx++}`; params.push(insuranceUser.providerId); }

    query += ' GROUP BY pr.id ORDER BY total_billed DESC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// Aging: outstanding invoices grouped by age buckets
router.get('/api/insurance/reports/aging', async (req: Request, res: Response) => {
  try {
    const insuranceUser = getInsuranceUser(req);
    const { provider_id } = req.query;
    let query = `SELECT i.*, pr.name as provider_name, pr.code as provider_code,
                        DATE_PART('day', NOW() - i.created_at)::int as days_outstanding
                 FROM insurance_invoices i
                 LEFT JOIN insurance_providers pr ON i.provider_id = pr.id
                 WHERE i.status IN ('sent', 'draft')
                 AND i.total_amount > COALESCE(i.paid_amount, 0)`;
    const params: any[] = [];
    let idx = 1;

    if (provider_id) { query += ` AND i.provider_id = $${idx++}`; params.push(provider_id); }
    if (insuranceUser?.providerId) { query += ` AND i.provider_id = $${idx++}`; params.push(insuranceUser.providerId); }

    query += ' ORDER BY i.created_at ASC';
    const result = await pool.query(query, params);

    const aging = { '0-30': { count: 0, total: 0 }, '31-60': { count: 0, total: 0 }, '61-90': { count: 0, total: 0 }, '90+': { count: 0, total: 0 } };
    result.rows.forEach((inv: any) => {
      const days = inv.days_outstanding || 0;
      const balance = Math.max(0, Number(inv.total_amount || 0) - Number(inv.paid_amount || 0));
      const bucket = days <= 30 ? '0-30' : days <= 60 ? '31-60' : days <= 90 ? '61-90' : '90+';
      aging[bucket].count++;
      aging[bucket].total += balance;
    });

    res.json({
      buckets: aging,
      items: result.rows.slice(0, 100),
      total_items: result.rows.length,
      total_outstanding: result.rows.reduce((s: number, i: any) => s + Math.max(0, Number(i.total_amount || 0) - Number(i.paid_amount || 0)), 0),
    });
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

export default router;
