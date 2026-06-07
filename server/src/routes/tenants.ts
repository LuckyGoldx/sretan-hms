import { Router, Request, Response } from 'express';
import pool from '../db/pool';

const router = Router();

router.get('/api/tenants', async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT id, hospital_name, subscription_status, subscription_tier, created_at FROM tenants ORDER BY created_at DESC`
    );
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.post('/api/tenants', async (req: Request, res: Response) => {
  try {
    const { hospital_name, subscription_status, subscription_tier } = req.body;
    if (!hospital_name) {
      res.status(400).json({ error: true, message: 'hospital_name is required' });
      return;
    }
    const result = await pool.query(
      `INSERT INTO tenants (hospital_name, subscription_status, subscription_tier)
       VALUES ($1, $2, $3) RETURNING id, hospital_name, subscription_status, subscription_tier, created_at`,
      [hospital_name, subscription_status || 'active', subscription_tier || 'standard']
    );
    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.put('/api/tenants/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { hospital_name, subscription_status, subscription_tier } = req.body;
    const result = await pool.query(
      `UPDATE tenants SET hospital_name = COALESCE($1, hospital_name), subscription_status = COALESCE($2, subscription_status), subscription_tier = COALESCE($3, subscription_tier) WHERE id = $4 RETURNING id, hospital_name, subscription_status, subscription_tier, created_at`,
      [hospital_name || null, subscription_status || null, subscription_tier || null, id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: true, message: 'Tenant not found' });
      return;
    }
    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.post('/api/tenants/:id/config', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      primary_brand_color, secondary_brand_color, ui_theme_class,
      deployment_mode, cloud_sync_enabled,
      private_supabase_url, private_supabase_anon_key,
      module_records, module_triage, module_consultation,
      module_laboratory, module_pharmacy, module_radiology, module_finance_hmo,
    } = req.body;

    const existing = await pool.query(
      `SELECT id FROM tenant_configurations WHERE tenant_id = $1`, [id]
    );

    if (existing.rows.length > 0) {
      await pool.query(
        `UPDATE tenant_configurations SET
          primary_brand_color = COALESCE($1, primary_brand_color),
          secondary_brand_color = COALESCE($2, secondary_brand_color),
          ui_theme_class = COALESCE($3, ui_theme_class),
          deployment_mode = COALESCE($4, deployment_mode),
          cloud_sync_enabled = COALESCE($5, cloud_sync_enabled),
          private_supabase_url = COALESCE($6, private_supabase_url),
          private_supabase_anon_key = COALESCE($7, private_supabase_anon_key),
          module_records = COALESCE($8, module_records),
          module_triage = COALESCE($9, module_triage),
          module_consultation = COALESCE($10, module_consultation),
          module_laboratory = COALESCE($11, module_laboratory),
          module_pharmacy = COALESCE($12, module_pharmacy),
          module_radiology = COALESCE($13, module_radiology),
          module_finance_hmo = COALESCE($14, module_finance_hmo),
          updated_at = NOW()
        WHERE tenant_id = $15`,
        [
          primary_brand_color || null, secondary_brand_color || null,
          ui_theme_class || null, deployment_mode || null,
          cloud_sync_enabled ?? null, private_supabase_url || null,
          private_supabase_anon_key || null,
          module_records ?? null, module_triage ?? null, module_consultation ?? null,
          module_laboratory ?? null, module_pharmacy ?? null,
          module_radiology ?? null, module_finance_hmo ?? null,
          id,
        ]
      );
    } else {
      await pool.query(
        `INSERT INTO tenant_configurations (
          tenant_id, primary_brand_color, secondary_brand_color, ui_theme_class,
          deployment_mode, cloud_sync_enabled, private_supabase_url, private_supabase_anon_key,
          module_records, module_triage, module_consultation,
          module_laboratory, module_pharmacy, module_radiology, module_finance_hmo
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
        [
          id, primary_brand_color || '#2563eb', secondary_brand_color || '#10b981',
          ui_theme_class || 'theme-trust-blue', deployment_mode || 'CLOUD_SAAS',
          cloud_sync_enabled ?? true, private_supabase_url || null, private_supabase_anon_key || null,
          module_records ?? true, module_triage ?? true, module_consultation ?? true,
          module_laboratory ?? false, module_pharmacy ?? false,
          module_radiology ?? false, module_finance_hmo ?? false,
        ]
      );
    }

    res.json({ success: true, message: 'Configuration saved' });
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.delete('/api/tenants/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM tenant_configurations WHERE tenant_id = $1', [id]);
    const result = await pool.query('DELETE FROM tenants WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) {
      res.status(404).json({ error: true, message: 'Tenant not found' });
      return;
    }
    res.json({ success: true, message: 'Hospital deleted' });
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

router.get('/api/tenants/:id/config', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT * FROM tenant_configurations WHERE tenant_id = $1`, [id]
    );
    if (result.rows.length === 0) {
      res.json(null);
      return;
    }
    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

export default router;
