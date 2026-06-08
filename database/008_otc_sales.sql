CREATE TABLE IF NOT EXISTS otc_sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  drug_name VARCHAR(255) NOT NULL,
  quantity INT NOT NULL,
  unit_price DECIMAL(12,2) DEFAULT 0,
  total_amount DECIMAL(12,2) DEFAULT 0,
  customer_name VARCHAR(255),
  payment_method VARCHAR(50) DEFAULT 'cash',
  notes TEXT,
  sold_by UUID REFERENCES staff_users(id),
  sold_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
