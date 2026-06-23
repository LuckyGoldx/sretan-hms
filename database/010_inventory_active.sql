-- Add is_active and amount_type columns to inventory_items
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS amount_type VARCHAR(20) DEFAULT 'units';
