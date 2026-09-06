import { Router, Request, Response } from "express";
import pool from "../db/pool";
import { readClinicProfile } from "../config/reader";

const router = Router();

function getTenantId(): string {
  return readClinicProfile().GLOBAL_SAAS_TENANT_ID;
}

// GET /api/audit-logs -- clinic-admin audit trail viewer.
// Optional filters: table_name, action, search (text inside old/new data),
// date_from, date_to, limit (default 200, max 500).
router.get("/api/audit-logs", async (req: Request, res: Response) => {
  try {
    const role = String(req.headers["x-user-role"] || "");
    if (role && role !== "Admin") {
      res.status(403).json({ error: true, message: "Only administrators can view audit logs" });
      return;
    }
    const tenantId = getTenantId();
    const { table_name, action, search, date_from, date_to } = req.query;
    const limit = Math.min(parseInt(String(req.query.limit || "200"), 10) || 200, 500);

    const params: any[] = [tenantId];
    let idx = 2;
    const conds: string[] = [];

    if (table_name) { conds.push(`a.table_name = $${idx}`); params.push(String(table_name)); idx++; }
    if (action) { conds.push(`a.action = $${idx}`); params.push(String(action)); idx++; }
    if (search) {
      conds.push(`COALESCE(a.old_data, '{}'::jsonb)::text ILIKE $${idx} OR COALESCE(a.new_data, '{}'::jsonb)::text ILIKE $${idx}`);
      params.push(`%${search}%`);
      idx++;
    }
    if (date_from) { conds.push(`a.created_at::date >= $${idx}::date`); params.push(date_from); idx++; }
    if (date_to) { conds.push(`a.created_at::date <= $${idx}::date`); params.push(date_to); idx++; }

    const result = await pool.query(
      `SELECT a.id, a.action, a.table_name, a.record_id, a.performed_by, a.old_data, a.new_data, a.created_at,
              s.name as performed_by_name,
              CASE WHEN a.table_name = 'patients' THEN (SELECT p.full_name FROM patients p WHERE p.id = a.record_id)
                   ELSE NULL END as patient_name
       FROM audit_logs a
       LEFT JOIN staff_users s ON s.id = a.performed_by
       WHERE a.tenant_id = $1 ${conds.length ? `AND ${conds.join(' AND ')}` : ''}
       ORDER BY a.created_at DESC
       LIMIT $${idx}`,
      [...params, limit]
    );
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

export default router;
