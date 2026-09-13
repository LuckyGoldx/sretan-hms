import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import pool from '../db/pool';
import { readClinicProfile } from '../config/reader';
import { generateNumber } from '../utils/numbering';

const router = Router();

function getTenantId(): string {
  return readClinicProfile().GLOBAL_SAAS_TENANT_ID;
}

const APPROVER_ROLES = ['Paypoint', 'Finance', 'Admin'];

async function notify(tenantId: string, recipientId: string | null, title: string, message: string, refId: string, patientId: string | null = null) {
  if (!recipientId) return;
  try {
    await pool.query(
      `INSERT INTO notifications (tenant_id, recipient_id, type, title, message, ref_table, ref_id, patient_id)
       VALUES ($1, $2, 'expense', $3, $4, 'expenses', $5, $6)`,
      [tenantId, recipientId, title, message, refId, patientId]
    );
  } catch {}
}

async function notifyApprovers(tenantId: string, excludeStaffId: string | null, title: string, message: string, refId: string) {
  try {
    const staff = await pool.query(
      `SELECT id FROM staff_users WHERE tenant_id = $1 AND status = 'active' AND role = ANY($2::text[])`,
      [tenantId, APPROVER_ROLES]
    );
    for (const s of staff.rows) {
      if (excludeStaffId && s.id === excludeStaffId) continue;
      await notify(tenantId, s.id, title, message, refId);
    }
  } catch {}
}

function addDateFilter(w: { sql: string; params: any[]; idx: number }, column: string, from: any, to: any) {
  if (from) { w.sql += ` AND ${column} >= $${w.idx}::date`; w.params.push(from); w.idx++; }
  if (to) { w.sql += ` AND ${column} < ($${w.idx}::date + INTERVAL '1 day')`; w.params.push(to); w.idx++; }
}

// ---------------------------------------------------------------- categories

router.get('/api/expense-categories', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const includeInactive = req.query.include_inactive === 'true';
    const result = await pool.query(
      `SELECT * FROM expense_categories WHERE tenant_id = $1 ${includeInactive ? '' : 'AND is_active = true'} ORDER BY name`,
      [tenantId]
    );
    res.json(result.rows);
  } catch (err: any) { res.status(500).json({ error: true, message: err.message }); }
});

router.post('/api/expense-categories', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const { name, created_by, actor_role } = req.body;
    if (actor_role !== 'Admin') { res.status(403).json({ error: true, message: 'Only an administrator can manage expense categories.' }); return; }
    if (!name || !String(name).trim()) { res.status(400).json({ error: true, message: 'Category name is required.' }); return; }
    try {
      const result = await pool.query(
        `INSERT INTO expense_categories (id, tenant_id, name, created_by) VALUES ($1, $2, $3, $4) RETURNING *`,
        [uuidv4(), tenantId, String(name).trim(), created_by || null]
      );
      res.status(201).json(result.rows[0]);
    } catch (e: any) {
      if (e?.code === '23505') { res.status(409).json({ error: true, message: 'That category already exists.' }); return; }
      throw e;
    }
  } catch (err: any) { res.status(500).json({ error: true, message: err.message }); }
});

router.put('/api/expense-categories/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const { name, is_active, actor_role } = req.body;
    if (actor_role !== 'Admin') { res.status(403).json({ error: true, message: 'Only an administrator can manage expense categories.' }); return; }
    const result = await pool.query(
      `UPDATE expense_categories
          SET name = COALESCE($1, name), is_active = COALESCE($2, is_active), updated_at = NOW()
        WHERE id = $3 AND tenant_id = $4 RETURNING *`,
      [name ? String(name).trim() : null, typeof is_active === 'boolean' ? is_active : null, req.params.id, tenantId]
    );
    if (result.rows.length === 0) { res.status(404).json({ error: true, message: 'Category not found' }); return; }
    res.json(result.rows[0]);
  } catch (err: any) {
    if (err?.code === '23505') { res.status(409).json({ error: true, message: 'That category already exists.' }); return; }
    res.status(500).json({ error: true, message: err.message });
  }
});

router.delete('/api/expense-categories/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const actorRole = String(req.query.actor_role || '');
    if (actorRole !== 'Admin') { res.status(403).json({ error: true, message: 'Only an administrator can manage expense categories.' }); return; }
    const used = await pool.query(
      `SELECT COUNT(*)::int AS c FROM expenses WHERE tenant_id = $1 AND category_id = $2`,
      [tenantId, req.params.id]
    );
    if ((used.rows[0]?.c || 0) > 0) {
      res.status(409).json({ error: true, message: 'This category has expenses recorded and cannot be deleted. Deactivate it instead.' });
      return;
    }
    await pool.query(`DELETE FROM expense_categories WHERE id = $1 AND tenant_id = $2`, [req.params.id, tenantId]);
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: true, message: err.message }); }
});

// ----------------------------------------------------------------- list/stats

router.get('/api/expenses', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const { staff_id, scope, viewer_role, status, category_id, category, search, date_from, date_to, page, limit } = req.query;

    const w = { sql: `e.tenant_id = $1`, params: [tenantId] as any[], idx: 2 };
    const canSeeAll = APPROVER_ROLES.includes(String(viewer_role || '')) && scope === 'all';
    if (canSeeAll) {
      if (staff_id) { w.sql += ` AND e.staff_id = $${w.idx}`; w.params.push(staff_id); w.idx++; }
    } else {
      if (!staff_id) { res.status(400).json({ error: true, message: 'staff_id is required' }); return; }
      w.sql += ` AND e.staff_id = $${w.idx}`; w.params.push(staff_id); w.idx++;
    }
    if (status) { w.sql += ` AND e.status = $${w.idx}`; w.params.push(status); w.idx++; }
    if (category_id) { w.sql += ` AND e.category_id = $${w.idx}`; w.params.push(category_id); w.idx++; }
    if (category) { w.sql += ` AND COALESCE(e.category, 'Uncategorised') = $${w.idx}`; w.params.push(category); w.idx++; }
    if (search) {
      w.sql += ` AND (e.description ILIKE $${w.idx} OR e.reference ILIKE $${w.idx} OR e.payee ILIKE $${w.idx} OR s.name ILIKE $${w.idx} OR e.category ILIKE $${w.idx})`;
      w.params.push(`%${search}%`); w.idx++;
    }
    addDateFilter(w, 'e.expense_date', date_from, date_to);

    const from = `FROM expenses e
                  LEFT JOIN staff_users s ON s.id = e.staff_id
                  LEFT JOIN departments dep ON dep.id = s.department_id
                 WHERE ${w.sql}`;
    const select = `SELECT e.*, s.name AS staff_name, s.role AS staff_role, dep.name AS department_name,
                    (SELECT COUNT(*) FROM expense_approvals ea WHERE ea.expense_id = e.id)::int AS history_count`;

    const pageNum = parseInt(page as string) || 0;
    const limitNum = parseInt(limit as string) || 25;
    if (pageNum) {
      const countRes = await pool.query(`SELECT COUNT(*)::int AS total, COALESCE(SUM(e.amount),0) AS total_amount ${from}`, w.params);
      const offset = (pageNum - 1) * limitNum;
      const listRes = await pool.query(`${select} ${from} ORDER BY e.created_at DESC, e.expense_date DESC LIMIT $${w.idx++} OFFSET $${w.idx++}`, [...w.params, limitNum, offset]);
      res.json({ rows: listRes.rows, total: countRes.rows[0]?.total || 0, total_amount: Number(countRes.rows[0]?.total_amount) || 0, page: pageNum, limit: limitNum });
      return;
    }
    const result = await pool.query(`${select} ${from} ORDER BY e.created_at DESC, e.expense_date DESC LIMIT 200`, w.params);
    res.json(result.rows);
  } catch (err: any) { res.status(500).json({ error: true, message: err.message }); }
});

router.get('/api/expenses/stats', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const staffId = req.query.staff_id ? String(req.query.staff_id) : null;
    const scope = req.query.scope;
    const viewerRole = String(req.query.viewer_role || '');
    const canSeeAll = APPROVER_ROLES.includes(viewerRole) && scope === 'all';
    // A non-approver must scope to their own expenses; never expose tenant-wide.
    if (!canSeeAll && !staffId) {
      res.status(400).json({ error: true, message: 'staff_id is required.' });
      return;
    }

    const base = canSeeAll
      ? { sql: `tenant_id = $1`, params: [tenantId] as any[] }
      : { sql: `tenant_id = $1 AND staff_id = $2`, params: [tenantId, staffId] };

    // Category / date filters apply to the pending, approved and rejected
    // cards. "Approved This Month" stays fixed (unfiltered).
    const { category, date_from, date_to } = req.query;
    const f: string[] = [];
    const fparams: any[] = [];
    let idx = base.params.length + 1;
    if (category) { f.push(`COALESCE(category, 'Uncategorised') = $${idx++}`); fparams.push(category); }
    if (date_from) { f.push(`expense_date >= $${idx++}::date`); fparams.push(date_from); }
    if (date_to) { f.push(`expense_date < ($${idx++}::date + INTERVAL '1 day')`); fparams.push(date_to); }
    const filterSql = f.length ? ' AND ' + f.join(' AND ') : '';
    const totalsParams = [...base.params, ...fparams];

    const totals = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'pending'${filterSql})::int AS pending_count,
         COALESCE(SUM(amount) FILTER (WHERE status = 'pending'${filterSql}), 0) AS pending_amount,
         COUNT(*) FILTER (WHERE status = 'approved'${filterSql})::int AS approved_count,
         COALESCE(SUM(amount) FILTER (WHERE status = 'approved'${filterSql}), 0) AS approved_amount,
         COUNT(*) FILTER (WHERE status = 'rejected'${filterSql})::int AS rejected_count,
         COALESCE(SUM(amount) FILTER (WHERE status = 'rejected'${filterSql}), 0) AS rejected_amount,
         COALESCE(SUM(amount) FILTER (WHERE status = 'approved' AND expense_date = CURRENT_DATE), 0) AS today_approved,
         COALESCE(SUM(amount) FILTER (WHERE status = 'approved' AND expense_date >= DATE_TRUNC('month', CURRENT_DATE)), 0) AS month_approved
       FROM expenses WHERE ${base.sql}`,
      totalsParams
    );

    const byCategory = await pool.query(
      `SELECT COALESCE(category, 'Uncategorised') AS category, COALESCE(SUM(amount),0) AS amount, COUNT(*)::int AS count
         FROM expenses WHERE ${base.sql} AND status = 'approved'
        GROUP BY COALESCE(category, 'Uncategorised') ORDER BY amount DESC`,
      base.params
    );

    const byStaff = await pool.query(
      `SELECT e.staff_id, s.name AS staff_name, s.role AS staff_role,
              COUNT(*)::int AS count, COALESCE(SUM(e.amount),0) AS amount
         FROM expenses e LEFT JOIN staff_users s ON s.id = e.staff_id
        WHERE e.tenant_id = $1 ${canSeeAll ? '' : (staffId ? 'AND e.staff_id = $2' : '')} AND e.status = 'approved'
        GROUP BY e.staff_id, s.name, s.role ORDER BY amount DESC LIMIT 50`,
      canSeeAll ? [tenantId] : (staffId ? [tenantId, staffId] : [tenantId])
    );

    res.json({
      ...totals.rows[0],
      by_category: byCategory.rows,
      by_staff: byStaff.rows,
    });
  } catch (err: any) { res.status(500).json({ error: true, message: err.message }); }
});

// Categories that actually have expense records (for the filter dropdowns),
// scoped to the viewer. Newly-used categories appear automatically.
router.get('/api/expenses/categories-in-use', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const staffId = req.query.staff_id ? String(req.query.staff_id) : null;
    const canSeeAll = APPROVER_ROLES.includes(String(req.query.viewer_role || '')) && req.query.scope === 'all';
    if (!canSeeAll && !staffId) { res.status(400).json({ error: true, message: 'staff_id is required.' }); return; }
    const result = await pool.query(
      `SELECT category_id, COALESCE(category, 'Uncategorised') AS category, COUNT(*)::int AS count
         FROM expenses WHERE tenant_id = $1 ${canSeeAll ? '' : 'AND staff_id = $2'}
        GROUP BY category_id, COALESCE(category, 'Uncategorised')
        ORDER BY category`,
      canSeeAll ? [tenantId] : [tenantId, staffId]
    );
    res.json(result.rows);
  } catch (err: any) { res.status(500).json({ error: true, message: err.message }); }
});

// --------------------------------------------------------------- create/edit

router.post('/api/expenses', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const { staff_id, actor_role, category_id, category, description, amount, expense_date, payment_method, payee, receipt_url, id: providedId } = req.body;
    const amt = parseFloat(String(amount));
    if (!staff_id) { res.status(400).json({ error: true, message: 'staff_id is required.' }); return; }
    if (!amt || amt <= 0) { res.status(400).json({ error: true, message: 'A positive amount is required.' }); return; }
    if (!description || !String(description).trim()) { res.status(400).json({ error: true, message: 'A description is required.' }); return; }

    let categoryName = category ? String(category).trim() : null;
    if (category_id) {
      const c = await pool.query(`SELECT name FROM expense_categories WHERE id = $1 AND tenant_id = $2`, [category_id, tenantId]);
      if (c.rows.length > 0) categoryName = c.rows[0].name;
    }

    const id = providedId || uuidv4();
    const reference = await generateNumber(tenantId, 'expense', { prefix: 'EXP' }).catch(() => null);
    // Admin expenses are auto-approved.
    const autoApprove = actor_role === 'Admin';
    const status = autoApprove ? 'approved' : 'pending';

    const result = await pool.query(
      `INSERT INTO expenses (id, tenant_id, reference, staff_id, category_id, category, description, amount, expense_date, payment_method, payee, receipt_url, status, decided_by, decided_at, decision_reason)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
      [id, tenantId, reference, staff_id, category_id || null, categoryName, String(description).trim(), amt,
       expense_date || new Date().toISOString().slice(0, 10), payment_method || 'cash', payee || null, receipt_url || null,
       status, autoApprove ? staff_id : null, autoApprove ? new Date() : null, autoApprove ? 'Auto-approved (Admin)' : null]
    );

    await pool.query(
      `INSERT INTO expense_approvals (tenant_id, expense_id, action, actor_id, amount, reason) VALUES ($1,$2,$3,$4,$5,$6)`,
      [tenantId, id, autoApprove ? 'approved' : 'submitted', staff_id, amt, autoApprove ? 'Auto-approved (Admin)' : null]
    ).catch(() => {});

    if (!autoApprove) {
      await notifyApprovers(tenantId, staff_id, 'New expense awaiting approval',
        `Expense ${reference || ''} of ${amt.toLocaleString()} submitted for approval.`, id);
    }

    res.status(201).json(result.rows[0]);
  } catch (err: any) { res.status(500).json({ error: true, message: err.message }); }
});

router.put('/api/expenses/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const { staff_id, actor_role, category_id, category, description, amount, expense_date, payment_method, payee, receipt_url } = req.body;
    const existing = await pool.query(`SELECT * FROM expenses WHERE id = $1 AND tenant_id = $2`, [req.params.id, tenantId]);
    if (existing.rows.length === 0) { res.status(404).json({ error: true, message: 'Expense not found' }); return; }
    const exp = existing.rows[0];
    if (exp.status !== 'pending') { res.status(409).json({ error: true, message: 'Only pending expenses can be edited.' }); return; }
    if (actor_role !== 'Admin' && exp.staff_id !== staff_id) { res.status(403).json({ error: true, message: 'You can only edit your own pending expenses.' }); return; }

    const amt = amount !== undefined ? parseFloat(String(amount)) : null;
    if (amt !== null && (!amt || amt <= 0)) { res.status(400).json({ error: true, message: 'A positive amount is required.' }); return; }
    let categoryName: string | null = null;
    if (category_id) {
      const c = await pool.query(`SELECT name FROM expense_categories WHERE id = $1 AND tenant_id = $2`, [category_id, tenantId]);
      if (c.rows.length > 0) categoryName = c.rows[0].name;
    } else if (category) categoryName = String(category).trim();

    const result = await pool.query(
      `UPDATE expenses SET
         category_id = COALESCE($1, category_id), category = COALESCE($2, category),
         description = COALESCE($3, description), amount = COALESCE($4, amount),
         expense_date = COALESCE($5, expense_date), payment_method = COALESCE($6, payment_method),
         payee = COALESCE($7, payee), receipt_url = COALESCE($8, receipt_url), updated_at = NOW()
       WHERE id = $9 AND tenant_id = $10 RETURNING *`,
      [category_id || null, categoryName, description ? String(description).trim() : null, amt,
       expense_date || null, payment_method || null, payee || null, receipt_url || null, req.params.id, tenantId]
    );
    res.json(result.rows[0]);
  } catch (err: any) { res.status(500).json({ error: true, message: err.message }); }
});

router.delete('/api/expenses/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const staffId = String(req.query.staff_id || '');
    const actorRole = String(req.query.actor_role || '');
    const existing = await pool.query(`SELECT * FROM expenses WHERE id = $1 AND tenant_id = $2`, [req.params.id, tenantId]);
    if (existing.rows.length === 0) { res.status(404).json({ error: true, message: 'Expense not found' }); return; }
    const exp = existing.rows[0];
    if (exp.status !== 'pending') { res.status(409).json({ error: true, message: 'Only pending expenses can be deleted.' }); return; }
    if (actorRole !== 'Admin' && exp.staff_id !== staffId) { res.status(403).json({ error: true, message: 'You can only delete your own pending expenses.' }); return; }
    await pool.query(`DELETE FROM expenses WHERE id = $1 AND tenant_id = $2`, [req.params.id, tenantId]);
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: true, message: err.message }); }
});

// Approved-expense totals for the Finance dashboard (registered before /:id so
// it is not captured as an expense id).
router.get('/api/expenses/summary', async (_req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const r = await pool.query(
      `SELECT
         COALESCE(SUM(amount) FILTER (WHERE status = 'approved' AND expense_date = CURRENT_DATE), 0) AS today_expenses,
         COALESCE(SUM(amount) FILTER (WHERE status = 'approved' AND expense_date >= DATE_TRUNC('month', CURRENT_DATE)), 0) AS month_expenses,
         COALESCE(SUM(amount) FILTER (WHERE status = 'approved'), 0) AS total_expenses
       FROM expenses WHERE tenant_id = $1`,
      [tenantId]
    );
    res.json(r.rows[0]);
  } catch (err: any) { res.status(500).json({ error: true, message: err.message }); }
});

// ------------------------------------------------------------ approve/reject

router.get('/api/expenses/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const result = await pool.query(
      `SELECT e.*, s.name AS staff_name, s.role AS staff_role, dep.name AS department_name,
              d.name AS decided_by_name
         FROM expenses e
         LEFT JOIN staff_users s ON s.id = e.staff_id
         LEFT JOIN departments dep ON dep.id = s.department_id
         LEFT JOIN staff_users d ON d.id = e.decided_by
        WHERE e.id = $1 AND e.tenant_id = $2`,
      [req.params.id, tenantId]
    );
    if (result.rows.length === 0) { res.status(404).json({ error: true, message: 'Expense not found' }); return; }
    const history = await pool.query(
      `SELECT ea.*, su.name AS actor_name FROM expense_approvals ea
        LEFT JOIN staff_users su ON su.id = ea.actor_id
       WHERE ea.expense_id = $1 ORDER BY ea.created_at ASC`,
      [req.params.id]
    );
    res.json({ ...result.rows[0], history: history.rows });
  } catch (err: any) { res.status(500).json({ error: true, message: err.message }); }
});

async function decide(id: string, tenantId: string, action: 'approved' | 'rejected', actorId: string | null, actorRole: string, reason: string | null) {
  const existing = await pool.query(`SELECT * FROM expenses WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
  if (existing.rows.length === 0) return { status: 404, body: { error: true, message: 'Expense not found' } };
  const exp = existing.rows[0];
  if (!APPROVER_ROLES.includes(actorRole)) return { status: 403, body: { error: true, message: 'Only Paypoint, Finance or Admin can approve expenses.' } };
  if (exp.status !== 'pending') return { status: 409, body: { error: true, message: `This expense is already ${exp.status}.` } };
  // No self-approval (Admin may override, but must give a reason).
  if (exp.staff_id === actorId && actorRole !== 'Admin') {
    return { status: 403, body: { error: true, message: 'You cannot approve your own expense.' } };
  }
  if (action === 'rejected' && (!reason || !String(reason).trim())) {
    return { status: 400, body: { error: true, message: 'A reason is required to reject an expense.' } };
  }

  const result = await pool.query(
    `UPDATE expenses SET status = $1, decided_by = $2, decided_at = NOW(), decision_reason = $3, updated_at = NOW()
      WHERE id = $4 AND tenant_id = $5 AND status = 'pending' RETURNING *`,
    [action, actorId || null, reason || null, id, tenantId]
  );
  if (result.rows.length === 0) return { status: 409, body: { error: true, message: 'This expense was already decided.' } };

  await pool.query(
    `INSERT INTO expense_approvals (tenant_id, expense_id, action, actor_id, amount, reason) VALUES ($1,$2,$3,$4,$5,$6)`,
    [tenantId, id, action, actorId || null, exp.amount, reason || null]
  ).catch(() => {});

  const notifyId = exp.staff_id !== actorId ? exp.staff_id : null;
  await notify(tenantId, notifyId, `Expense ${action}`,
    `Your expense ${exp.reference || ''} (${Number(exp.amount).toLocaleString()}) was ${action}${reason ? `: ${reason}` : '.'}`, id);

  return { status: 200, body: result.rows[0] };
}

router.put('/api/expenses/:id/approve', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const { actor_id, actor_role, reason } = req.body;
    const out = await decide(String(req.params.id), tenantId, 'approved', actor_id || null, String(actor_role || ''), reason || null);
    res.status(out.status).json(out.body);
  } catch (err: any) { res.status(500).json({ error: true, message: err.message }); }
});

router.put('/api/expenses/:id/reject', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const { actor_id, actor_role, reason } = req.body;
    const out = await decide(String(req.params.id), tenantId, 'rejected', actor_id || null, String(actor_role || ''), reason || null);
    res.status(out.status).json(out.body);
  } catch (err: any) { res.status(500).json({ error: true, message: err.message }); }
});

export default router;
