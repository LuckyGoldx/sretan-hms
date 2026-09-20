import { Router, Request, Response } from 'express';
import pool from '../db/pool';
import { isSuperAdmin, getInsuranceUser } from '../utils/insuranceAuth';
import { readClinicProfile } from '../config/reader';

const router = Router();

function getTenantId(): string {
  return readClinicProfile().GLOBAL_SAAS_TENANT_ID;
}

// Service categories available for coverage rules
const SERVICE_CATEGORIES = [
  'lab', 'pharmacy', 'radiology', 'general',
  'consultation', 'admission', 'maternity', 'procedure', 'fluid',
  'folder_activation',
];

// GET all coverage rules for a provider + return items grouped by category
router.get('/api/insurance/providers/:id/coverage', async (req: Request, res: Response) => {
  try {
    const providerId = req.params.id;

    // Provider default
    const prov = await pool.query(
      'SELECT id, name, default_coverage_pct FROM insurance_providers WHERE id = $1',
      [providerId]
    );
    if (prov.rows.length === 0) { res.status(404).json({ error: true, message: 'Provider not found' }); return; }

    // Existing coverage rules
    const rules = await pool.query(
      `SELECT cr.*, inv.drug_name, inv.category as inv_category
       FROM insurance_provider_coverage_rules cr
       LEFT JOIN inventory_items inv ON cr.inventory_item_id = inv.id
       WHERE cr.provider_id = $1 ORDER BY cr.service_type, inv.drug_name`,
      [providerId]
    );

    // All inventory items grouped by category (for the UI). New items added to
    // inventory appear here automatically, under their category.
    const inventoryItems = await pool.query(
      `SELECT id, drug_name, category, price, is_active, stock_count
       FROM inventory_items WHERE tenant_id = $1 AND is_active = true ORDER BY category, drug_name`,
      [getTenantId()]
    );

    // Wards with their bed count and the per-night inventory item that carries
    // the ward's nightly rate, so admission coverage can be set per ward/bed.
    const wards = await pool.query(
      `SELECT w.id, w.name, w.code,
              (SELECT COUNT(*)::int FROM beds b WHERE b.ward_id = w.id) AS bed_count,
              (SELECT i.id FROM inventory_items i
                WHERE i.ward_id = w.id AND i.service_key = 'BED_DAY' AND i.is_active = true
                ORDER BY i.created_at DESC LIMIT 1) AS bed_day_item_id
         FROM wards w
        WHERE w.tenant_id = $1
        ORDER BY w.name`,
      [getTenantId()]
    );

    // For non-inventory services, create synthetic items
    const nonInventoryServices = [
      { id: '__consultation__', drug_name: 'Consultation', category: 'consultation' },
      { id: '__admission__', drug_name: 'Admission', category: 'admission' },
      { id: '__maternity__', drug_name: 'Maternity Services', category: 'maternity' },
      { id: '__procedure__', drug_name: 'Procedures', category: 'procedure' },
      { id: '__fluid__', drug_name: 'Fluid Therapy', category: 'fluid' },
      { id: '__folder__', drug_name: 'Folder Activation / Registration', category: 'folder_activation' },
      { id: '__general__', drug_name: 'General Services', category: 'general' },
    ];

    res.json({
      provider: prov.rows[0],
      rules: rules.rows,
      inventoryItems: inventoryItems.rows,
      wards: wards.rows,
      nonInventoryServices,
      categories: SERVICE_CATEGORIES,
    });
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// UPSERT coverage rules in bulk
router.put('/api/insurance/providers/:id/coverage', async (req: Request, res: Response) => {
  try {
    const providerId = req.params.id;
    const tenantId = getTenantId();
    const { default_coverage_pct, rules } = req.body;

    // Update provider default. Blank/null means "no default coverage" (0%),
    // which the coverage lookup already treats as fail-closed.
    if (default_coverage_pct !== undefined) {
      let def: number | null = null;
      if (default_coverage_pct !== null && String(default_coverage_pct).trim() !== '') {
        const v = Number(default_coverage_pct);
        if (!Number.isFinite(v) || v < 0 || v > 100) {
          res.status(400).json({ error: true, message: 'Default coverage must be between 0 and 100 (or blank for no coverage).' });
          return;
        }
        def = v;
      }
      await pool.query(
        'UPDATE insurance_providers SET default_coverage_pct = $1 WHERE id = $2',
        [def, providerId]
      );
    }

    // Delete existing rules and re-insert (simplest approach for bulk upsert)
    if (Array.isArray(rules)) {
      await pool.query(
        'DELETE FROM insurance_provider_coverage_rules WHERE provider_id = $1',
        [providerId]
      );

      for (const rule of rules) {
        const pct = parseFloat(rule.coverage_percentage);
        if (isNaN(pct) || pct < 0 || pct > 100) continue;
        const invItemId = rule.inventory_item_id === '__none__' || rule.inventory_item_id === '' ? null : rule.inventory_item_id || null;
        await pool.query(
          `INSERT INTO insurance_provider_coverage_rules (id, tenant_id, provider_id, service_type, inventory_item_id, coverage_percentage)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (provider_id, service_type, inventory_item_id) DO UPDATE SET coverage_percentage = $6, updated_at = NOW()`,
          [crypto.randomUUID(), tenantId, providerId, rule.service_type, invItemId, pct]
        );
      }
    }

    res.json({ message: 'Coverage rules saved' });
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// DELETE a single coverage rule
router.delete('/api/insurance/providers/:id/coverage/:ruleId', async (req: Request, res: Response) => {
  try {
    await pool.query(
      'DELETE FROM insurance_provider_coverage_rules WHERE id = $1 AND provider_id = $2',
      [req.params.ruleId, req.params.id]
    );
    res.json({ message: 'Rule deleted' });
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

export default router;
