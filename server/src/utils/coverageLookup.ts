import pool from '../db/pool';

/**
 * Look up coverage percentage for a service under a given provider.
 *
 * Priority:
 * 1. Item override by inventory_item_id (preferred, stable across renames)
 * 2. Item override by item name (legacy fallback)
 * 3. Category-level rule (provider_id, service_type, inventory_item_id IS NULL)
 * 4. Provider default (insurance_providers.default_coverage_pct)
 * 5. Fail closed: 0% covered. The payer is never assumed to cover an
 *    unconfigured service, so nothing is billed to an insurer by accident.
 */
export async function getCoverageForService(
  providerId: string,
  serviceType: string,
  itemName?: string,
  inventoryItemId?: string | null
): Promise<number> {
  // 1. Exact item override by id
  if (inventoryItemId) {
    const byId = await pool.query(
      `SELECT coverage_percentage FROM insurance_provider_coverage_rules
        WHERE provider_id = $1 AND service_type = $2 AND inventory_item_id = $3
        LIMIT 1`,
      [providerId, serviceType, inventoryItemId]
    );
    if (byId.rows.length > 0) return parseFloat(byId.rows[0].coverage_percentage);
  }

  // 2. Item override by name (legacy: matches the linked inventory item's name)
  if (itemName) {
    const itemOverride = await pool.query(
      `SELECT cr.coverage_percentage
       FROM insurance_provider_coverage_rules cr
       JOIN inventory_items inv ON cr.inventory_item_id = inv.id
       WHERE cr.provider_id = $1 AND cr.service_type = $2 AND inv.drug_name ILIKE $3
       LIMIT 1`,
      [providerId, serviceType, itemName]
    );
    if (itemOverride.rows.length > 0) {
      return parseFloat(itemOverride.rows[0].coverage_percentage);
    }
  }

  // 3. Check category-level rule
  const catRule = await pool.query(
    `SELECT coverage_percentage FROM insurance_provider_coverage_rules
     WHERE provider_id = $1 AND service_type = $2 AND inventory_item_id IS NULL
     LIMIT 1`,
    [providerId, serviceType]
  );
  if (catRule.rows.length > 0) {
    return parseFloat(catRule.rows[0].coverage_percentage);
  }

  // 4. Provider default
  const provDefault = await pool.query(
    'SELECT default_coverage_pct FROM insurance_providers WHERE id = $1',
    [providerId]
  );
  if (provDefault.rows.length > 0 && provDefault.rows[0].default_coverage_pct !== null) {
    return parseFloat(provDefault.rows[0].default_coverage_pct);
  }

  // 5. Fail closed — nothing configured means the patient pays.
  return 0;
}

/**
 * Whether an insurance case is inside its coverage window right now. A case
 * with no dates is treated as open-ended.
 */
export function isCaseInCoverageWindow(caseRow: any): boolean {
  if (!caseRow) return false;
  const today = new Date();
  const start = caseRow.coverage_start_date ? new Date(caseRow.coverage_start_date) : null;
  const end = caseRow.coverage_end_date ? new Date(caseRow.coverage_end_date) : null;
  if (start && today < start) return false;
  if (end) {
    // inclusive of the end date
    const endOfDay = new Date(end);
    endOfDay.setHours(23, 59, 59, 999);
    if (today > endOfDay) return false;
  }
  return true;
}

export interface BillingCase {
  caseId: string;
  caseNumber: string | null;
  providerId: string | null;
  providerName: string | null;
  coverageStart: string | null;
  coverageEnd: string | null;
  inWindow: boolean;
}

/**
 * The one case billing should use for a patient.
 *
 * A patient can end up with several `active` cases (e.g. an expired auto-created
 * one plus the real one). The toggle and the coverage math must agree, so both
 * resolve through here:
 *   1. the active case for the patient's PRIMARY active policy provider, else
 *   2. the most recent active case that is inside its coverage window.
 * Returns null when there is no active case.
 */
export async function resolveBillingCase(patientId: string): Promise<BillingCase | null> {
  const primary = await pool.query(
    `SELECT c.id AS case_id, c.case_number, c.provider_id, pr.name AS provider_name,
            c.coverage_start_date, c.coverage_end_date
       FROM patient_insurance_policies pp
       JOIN insurance_providers pr ON pr.id = pp.provider_id
       JOIN insurance_cases c ON c.patient_id = pp.patient_id AND c.provider_id = pp.provider_id AND c.status = 'active'
      WHERE pp.patient_id = $1 AND pp.is_active = true AND pp.coverage_type = 'primary'
        AND (pp.end_date IS NULL OR pp.end_date >= CURRENT_DATE)
      ORDER BY c.created_at DESC LIMIT 1`,
    [patientId]
  );

  let row = primary.rows[0];

  if (!row) {
    const anyCase = await pool.query(
      `SELECT c.id AS case_id, c.case_number, c.provider_id, pr.name AS provider_name,
              c.coverage_start_date, c.coverage_end_date
         FROM insurance_cases c
         LEFT JOIN insurance_providers pr ON pr.id = c.provider_id
        WHERE c.patient_id = $1 AND c.status = 'active'
        ORDER BY (CASE WHEN (c.coverage_start_date IS NULL OR c.coverage_start_date <= CURRENT_DATE)
                        AND (c.coverage_end_date IS NULL OR c.coverage_end_date >= CURRENT_DATE)
                       THEN 0 ELSE 1 END),
                 c.created_at DESC
        LIMIT 1`,
      [patientId]
    );
    row = anyCase.rows[0];
  }

  if (!row) return null;
  return {
    caseId: row.case_id,
    caseNumber: row.case_number,
    providerId: row.provider_id,
    providerName: row.provider_name,
    coverageStart: row.coverage_start_date,
    coverageEnd: row.coverage_end_date,
    inWindow: isCaseInCoverageWindow(row),
  };
}

/**
 * Get the active primary insurance policy for a patient (returns provider info + case)
 */
export async function getPatientPrimaryInsurance(patientId: string): Promise<{
  active: boolean;
  providerId: string | null;
  providerName: string | null;
  caseId: string | null;
  caseNumber: string | null;
} | null> {
  const policy = await pool.query(
    `SELECT pp.provider_id, pr.name as provider_name, pr.is_active as provider_active,
            c.id as case_id, c.case_number
     FROM patient_insurance_policies pp
     JOIN insurance_providers pr ON pp.provider_id = pr.id
     LEFT JOIN insurance_cases c ON c.patient_id = pp.patient_id AND c.provider_id = pp.provider_id AND c.status = 'active'
     WHERE pp.patient_id = $1 AND pp.is_active = true AND pp.coverage_type = 'primary'
       AND (pp.end_date IS NULL OR pp.end_date >= CURRENT_DATE)
       AND pr.is_active = true
     ORDER BY pp.created_at LIMIT 1`,
    [patientId]
  );

  if (policy.rows.length === 0) {
    return null;
  }

  const p = policy.rows[0];
  return {
    active: true,
    providerId: p.provider_id,
    providerName: p.provider_name,
    caseId: p.case_id || null,
    caseNumber: p.case_number || null,
  };
}
