import { Router, Request, Response } from 'express';
import pool from '../db/pool';
import { isSuperAdmin, canManageStaff, getInsuranceUser } from '../utils/insuranceAuth';
import { readClinicProfile } from '../config/reader';
import { SERVICE_GROUPS, assignServiceGroup } from '../utils/serviceGroups';

const router = Router();

function getTenantId(): string {
  return readClinicProfile().GLOBAL_SAAS_TENANT_ID;
}

/** All active inventory items, each tagged with the tab/group it belongs to. */
async function loadGroupedInventory(tenantId: string) {
  const res = await pool.query(
    `SELECT id, drug_name, code, category, price, is_active, stock_count, service_key, ward_id
       FROM inventory_items WHERE tenant_id = $1 AND is_active = true
      ORDER BY category, drug_name`,
    [tenantId]
  );
  return res.rows.map((r: any) => ({ ...r, group: assignServiceGroup(r) }));
}

// Who may set a provider's prices: Super Admin, an insurance administrator, or
// the provider's own insurance staff. (Coverage writes were previously
// unauthenticated; pricing is financial config and is gated.)
function canManageProviderPricing(req: Request, providerId: string): boolean {
  if (isSuperAdmin(req) || canManageStaff(req)) return true;
  const insuranceUser = getInsuranceUser(req);
  return !!insuranceUser && insuranceUser.providerId === providerId;
}

function actingUserId(req: Request): string | null {
  const id = req.body?.performed_by ?? req.headers['x-user-id'];
  return typeof id === 'string' && id ? id : null;
}

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

    // All inventory items, each tagged with the tab/group it belongs to. New
    // items added to inventory appear here automatically under their group.
    const inventoryItems = await loadGroupedInventory(getTenantId());

    // Wards with their bed count and the per-night inventory item that carries
    // the ward's nightly rate, so admission coverage can be set per ward/bed.
    const wards = await pool.query(
      `SELECT w.id, w.name, w.code,
              (SELECT COUNT(*)::int FROM beds b WHERE b.ward_id = w.id) AS bed_count,
              (SELECT i.id FROM inventory_items i
                WHERE i.ward_id = w.id AND i.service_key = 'BED_DAY' AND i.is_active = true
                ORDER BY i.created_at DESC LIMIT 1) AS bed_day_item_id
         FROM wards w
        WHERE w.tenant_id = $1 AND w.is_active = true
        ORDER BY w.name`,
      [getTenantId()]
    );

    res.json({
      provider: prov.rows[0],
      rules: rules.rows,
      inventoryItems,
      wards: wards.rows,
      categories: SERVICE_GROUPS,
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

// ============================================================
// SERVICE PRICES (tariff overrides) — mirror of coverage rules.
// ============================================================

// GET a provider's price overrides + the inventory default prices for reference.
router.get('/api/insurance/providers/:id/pricing', async (req: Request, res: Response) => {
  try {
    const providerId = req.params.id;

    const prov = await pool.query(
      'SELECT id, name, code FROM insurance_providers WHERE id = $1',
      [providerId]
    );
    if (prov.rows.length === 0) { res.status(404).json({ error: true, message: 'Provider not found' }); return; }

    const prices = await pool.query(
      `SELECT sp.*, inv.drug_name, inv.category as inv_category
         FROM insurance_provider_service_prices sp
         LEFT JOIN inventory_items inv ON sp.inventory_item_id = inv.id
        WHERE sp.provider_id = $1
        ORDER BY sp.service_type, inv.drug_name`,
      [providerId]
    );

    const inventoryItems = await loadGroupedInventory(getTenantId());

    const wards = await pool.query(
      `SELECT w.id, w.name, w.code,
              (SELECT COUNT(*)::int FROM beds b WHERE b.ward_id = w.id) AS bed_count,
              (SELECT i.id FROM inventory_items i
                WHERE i.ward_id = w.id AND i.service_key = 'BED_DAY' AND i.is_active = true
                ORDER BY i.created_at DESC LIMIT 1) AS bed_day_item_id,
              (SELECT i.price FROM inventory_items i
                WHERE i.ward_id = w.id AND i.service_key = 'BED_DAY' AND i.is_active = true
                ORDER BY i.created_at DESC LIMIT 1) AS bed_day_default_price
         FROM wards w
        WHERE w.tenant_id = $1 AND w.is_active = true
        ORDER BY w.name`,
      [getTenantId()]
    );

    res.json({
      provider: prov.rows[0],
      prices: prices.rows,
      inventoryItems,
      wards: wards.rows,
      categories: SERVICE_GROUPS,
    });
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// Bulk-upsert price overrides. A blank/null price clears the override, which
// makes the item fall back to its inventory default price.
router.put('/api/insurance/providers/:id/pricing', async (req: Request, res: Response) => {
  const providerId = String(req.params.id);
  try {
    if (!canManageProviderPricing(req, providerId)) {
      res.status(403).json({ error: true, message: 'Forbidden. Only this provider\'s insurance staff or an administrator can set prices.' });
      return;
    }

    const { prices } = req.body;
    if (!Array.isArray(prices)) {
      res.status(400).json({ error: true, message: 'prices must be an array' });
      return;
    }

    const valid: Array<{ service_type: string; inventory_item_id: string | null; price: number }> = [];
    for (const row of prices) {
      const serviceType = String(row?.service_type || '').trim();
      if (!serviceType) continue;

      const raw = row?.price;
      if (raw === null || raw === undefined || String(raw).trim() === '') continue; // clear/fall back
      const price = Number(raw);
      if (!Number.isFinite(price) || price < 0) {
        res.status(400).json({ error: true, message: `Invalid price for ${serviceType}: prices must be zero or greater.` });
        return;
      }

      const invId = row.inventory_item_id === '__none__' || row.inventory_item_id === ''
        ? null : (row.inventory_item_id || null);
      valid.push({ service_type: serviceType, inventory_item_id: invId, price: Math.round(price * 100) / 100 });
    }

    const tenantId = getTenantId();
    const oldRows = await pool.query(
      'SELECT service_type, inventory_item_id, price FROM insurance_provider_service_prices WHERE provider_id = $1',
      [providerId]
    );

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM insurance_provider_service_prices WHERE provider_id = $1', [providerId]);
      for (const row of valid) {
        await client.query(
          `INSERT INTO insurance_provider_service_prices (id, tenant_id, provider_id, service_type, inventory_item_id, price)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [crypto.randomUUID(), tenantId, providerId, row.service_type, row.inventory_item_id, row.price]
        );
      }
      await client.query(
        `INSERT INTO audit_logs (tenant_id, action, table_name, record_id, performed_by, old_data, new_data)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [tenantId, 'insurance_service_prices_updated', 'insurance_provider_service_prices', providerId,
         actingUserId(req), JSON.stringify(oldRows.rows), JSON.stringify(valid)]
      );
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    res.json({ message: 'Service prices saved', count: valid.length });
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// DELETE a single price override (falls back to the inventory default).
router.delete('/api/insurance/providers/:id/pricing/:priceId', async (req: Request, res: Response) => {
  try {
    if (!canManageProviderPricing(req, String(req.params.id))) {
      res.status(403).json({ error: true, message: 'Forbidden' });
      return;
    }
    await pool.query(
      'DELETE FROM insurance_provider_service_prices WHERE id = $1 AND provider_id = $2',
      [req.params.priceId, req.params.id]
    );
    res.json({ message: 'Price override deleted' });
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

export default router;
