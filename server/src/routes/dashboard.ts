import { Router, Request, Response } from 'express';
import pool from '../db/pool';
import { readClinicProfile } from '../config/reader';
import { accrueBedCharges } from '../utils/admissionBilling';
import { applyAllHeldDeposits } from '../utils/patientBalance';

const router = Router();

function getTenantId(): string {
  return readClinicProfile().GLOBAL_SAAS_TENANT_ID;
}

// GET /api/dashboard/sidebar-counts
//
// Lightweight replacement for the sidebar's previous fan-out of nine list
// endpoints (which downloaded full result sets just to call .length, including
// the two heaviest paypoint CTEs). Every value here is a cheap COUNT against an
// indexed predicate, so the sidebar can refresh frequently without loading
// whole tables.
//
// Optional ?staff_id= scopes the doctor "unread results" counters, matching the
// filters used by /api/lab-orders and /api/radiology-orders.
router.get('/api/dashboard/sidebar-counts', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId();
    const staffId = String(req.query.staff_id || '') || null;

    // Keep accrued bed-day charges current, exactly as the pending list
    // endpoints do before reading them.
    try { await accrueBedCharges(tenantId); } catch {}
    // Settle held deposit credit so the pending counts reflect deposits.
    try { await applyAllHeldDeposits(pool, tenantId); } catch {}

    // A patient with any pending item (mirrors the 8 branches of
    // /api/payments/all-pending-items and /pending-summary). pending_all_items is
    // the number of pending line items; pending_patients is the number of
    // distinct patients, same as the old pending-summary row count.
    const result = await pool.query(
      `WITH pending AS (
         SELECT id AS patient_id FROM patients
           WHERE folder_activated = false AND tenant_id = $1
         UNION ALL
         SELECT enc.patient_id FROM prescriptions pr
           JOIN encounters enc ON enc.id = pr.encounter_id
           WHERE COALESCE(pr.is_paid, false) = false AND pr.status <> 'cancelled' AND enc.tenant_id = $1
         UNION ALL
         SELECT enc.patient_id FROM lab_orders l
           JOIN encounters enc ON enc.id = l.encounter_id
           WHERE COALESCE(l.is_paid, false) = false AND l.status NOT IN ('cancelled','completed') AND enc.tenant_id = $1
         UNION ALL
         SELECT enc.patient_id FROM radiology_orders r
           JOIN encounters enc ON enc.id = r.encounter_id
           WHERE COALESCE(r.is_paid, false) = false AND r.status NOT IN ('cancelled','completed') AND enc.tenant_id = $1
         UNION ALL
         SELECT a.patient_id FROM admissions a
           WHERE COALESCE(a.is_paid, false) = false AND a.tenant_id = $1
         UNION ALL
         SELECT dc.patient_id FROM admission_daily_charges dc
           JOIN patients p ON p.id = dc.patient_id
           WHERE dc.is_paid = false AND p.tenant_id = $1
         UNION ALL
         SELECT v.patient_id FROM visits v
           WHERE v.consultation_status = 'pending' AND COALESCE(v.consultation_fee, 0) > 0 AND v.tenant_id = $1
         UNION ALL
         SELECT r.patient_id FROM referrals r
           WHERE r.consultant_fee_status = 'pending' AND COALESCE(r.consultant_fee, 0) > 0 AND r.tenant_id = $1
       )
       SELECT
         (SELECT COUNT(*)::int FROM pending) AS pending_all_items,
         (SELECT COUNT(DISTINCT patient_id)::int FROM pending) AS pending_patients,
         (SELECT COUNT(*)::int FROM prescriptions
            WHERE tenant_id = $1 AND status = 'pending') AS pending_rx,
         (SELECT COUNT(*)::int FROM lab_orders
            WHERE tenant_id = $1 AND status = 'ordered') AS pending_lab,
         (SELECT COUNT(*)::int FROM lab_orders
            WHERE tenant_id = $1 AND is_paid = false) AS pending_lab_orders,
         (SELECT COUNT(*)::int FROM lab_results
            WHERE tenant_id = $1 AND status = 'draft') AS pending_results,
         (SELECT COUNT(*)::int FROM lab_orders lo
            JOIN encounters e ON e.id = lo.encounter_id
            WHERE lo.tenant_id = $1 AND e.tenant_id = $1 AND e.staff_id = $2
              AND lo.status = 'completed' AND lo.doctor_read_at IS NULL) AS unread_lab,
         (SELECT COUNT(*)::int FROM radiology_orders ro
            JOIN encounters e ON e.id = ro.encounter_id
            WHERE ro.tenant_id = $1 AND e.tenant_id = $1 AND e.staff_id = $2
              AND ro.status = 'completed') AS unread_radiology,
         (SELECT COUNT(*)::int FROM admissions
            WHERE tenant_id = $1 AND status = 'active' AND discharge_requested_at IS NOT NULL) AS pending_clearance,
         (SELECT COUNT(*)::int FROM expenses
            WHERE tenant_id = $1 AND status = 'pending') AS pending_expenses,
         (SELECT COUNT(*)::int FROM handovers h2
            JOIN handover_recipients hr ON hr.handover_id = h2.id AND hr.staff_id = $2 AND hr.acknowledged_at IS NULL
           WHERE h2.tenant_id = $1 AND h2.status = 'pending') AS pending_handovers`,
      [tenantId, staffId]
    );

    const row = result.rows[0] || {};
    res.json({
      pending_all_items: row.pending_all_items || 0,
      pending_patients: row.pending_patients || 0,
      pending_rx: row.pending_rx || 0,
      pending_lab: row.pending_lab || 0,
      pending_lab_orders: row.pending_lab_orders || 0,
      pending_results: row.pending_results || 0,
      unread_lab: row.unread_lab || 0,
      unread_radiology: row.unread_radiology || 0,
      pending_clearance: row.pending_clearance || 0,
      pending_expenses: row.pending_expenses || 0,
      pending_handovers: row.pending_handovers || 0,
    });
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

export default router;
