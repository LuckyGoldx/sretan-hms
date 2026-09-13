-- ============================================================
-- 084: Staff expenses + approval workflow
--
-- Any staff member records an expense. Paypoint/Finance/Admin approve or
-- reject. Admin-recorded expenses are auto-approved. Approved expenses are
-- recognised (settled) and counted against profit in the Finance dashboard.
--
-- Categories are admin-managed (defaults seeded) and cannot be deleted while
-- expenses reference them.
--
-- Idempotent: safe to run on every server boot.
-- ============================================================

CREATE TABLE IF NOT EXISTS expense_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  is_synced BOOLEAN DEFAULT false,
  last_synced_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_expense_categories_tenant_name
  ON expense_categories (tenant_id, lower(name));
CREATE INDEX IF NOT EXISTS idx_expense_categories_tenant
  ON expense_categories (tenant_id, is_active);

CREATE TABLE IF NOT EXISTS expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  reference VARCHAR(40),
  staff_id UUID,
  category_id UUID REFERENCES expense_categories(id) ON DELETE SET NULL,
  category VARCHAR(120),
  description TEXT,
  amount NUMERIC(12,2) NOT NULL,
  expense_date DATE DEFAULT CURRENT_DATE,
  payment_method VARCHAR(30) DEFAULT 'cash',
  payee VARCHAR(160),
  receipt_url TEXT,
  -- pending | approved | rejected | cancelled
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  decided_by UUID,
  decided_at TIMESTAMPTZ,
  decision_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  is_synced BOOLEAN DEFAULT false,
  last_synced_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_expenses_tenant_status ON expenses (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_expenses_tenant_staff ON expenses (tenant_id, staff_id);
CREATE INDEX IF NOT EXISTS idx_expenses_tenant_date ON expenses (tenant_id, expense_date);

CREATE TABLE IF NOT EXISTS expense_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  expense_id UUID REFERENCES expenses(id) ON DELETE CASCADE,
  action VARCHAR(20),
  actor_id UUID,
  amount NUMERIC(12,2),
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expense_approvals_expense ON expense_approvals (expense_id);

-- Default categories for every tenant.
INSERT INTO expense_categories (tenant_id, name)
SELECT t.id, c.name
  FROM tenants t
  CROSS JOIN (VALUES
    ('Transport'), ('Fuel'), ('Utilities'), ('Supplies'), ('Maintenance'),
    ('Rent'), ('Meals & Entertainment'), ('Drugs & Medical Supplies'),
    ('Equipment'), ('Training'), ('Communication'), ('Miscellaneous'), ('Others')
  ) AS c(name)
ON CONFLICT DO NOTHING;
