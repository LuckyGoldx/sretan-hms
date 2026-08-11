import pool from '../db/pool';

/**
 * Look up coverage percentage for a service under a given provider.
 *
 * Priority:
 * 1. Individual-item override (provider_id, service_type, matching inventory item by name)
 * 2. Category-level rule (provider_id, service_type, inventory_item_id IS NULL)
 * 3. Provider default (insurance_providers.default_coverage_pct)
 * 4. Assume 100% covered if nothing set
 */
export async function getCoverageForService(
  providerId: string,
  serviceType: string,
  itemName: string
): Promise<number> {
  // 1. Check individual-item override (match by inventory_items.drug_name)
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

  // 2. Check category-level rule
  const catRule = await pool.query(
    `SELECT coverage_percentage FROM insurance_provider_coverage_rules
     WHERE provider_id = $1 AND service_type = $2 AND inventory_item_id IS NULL
     LIMIT 1`,
    [providerId, serviceType]
  );
  if (catRule.rows.length > 0) {
    return parseFloat(catRule.rows[0].coverage_percentage);
  }

  // 3. Provider default
  const provDefault = await pool.query(
    'SELECT default_coverage_pct FROM insurance_providers WHERE id = $1',
    [providerId]
  );
  if (provDefault.rows.length > 0 && provDefault.rows[0].default_coverage_pct !== null) {
    return parseFloat(provDefault.rows[0].default_coverage_pct);
  }

  // 4. Assume fully covered
  return 100;
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
