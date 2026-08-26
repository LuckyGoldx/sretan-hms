-- OTC sales: soft-delete (void) with audit trail for corrected/erroneous counter sales
ALTER TABLE otc_sales ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ;
ALTER TABLE otc_sales ADD COLUMN IF NOT EXISTS voided_by UUID REFERENCES staff_users(id);
