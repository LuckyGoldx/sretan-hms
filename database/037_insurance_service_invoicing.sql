ALTER TABLE insurance_case_services ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'pending';
ALTER TABLE insurance_case_services ADD COLUMN IF NOT EXISTS invoice_id UUID;
ALTER TABLE insurance_case_services ADD COLUMN IF NOT EXISTS invoice_item_id UUID;
ALTER TABLE insurance_case_services ADD COLUMN IF NOT EXISTS invoiced_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_ins_case_svc_status ON insurance_case_services (case_id, status);

ALTER TABLE insurance_cases ADD COLUMN IF NOT EXISTS total_invoiced DECIMAL(12,2) DEFAULT 0;
ALTER TABLE insurance_cases ADD COLUMN IF NOT EXISTS total_uninvoiced DECIMAL(12,2) DEFAULT 0;

-- Backfill: mark services as invoiced when a matching invoice item already exists
-- (matched on case_id + service_type + description to avoid false positives)
UPDATE insurance_case_services cs
SET status = 'invoiced',
    invoice_id = ii.invoice_id,
    invoice_item_id = ii.id,
    invoiced_at = NOW()
FROM insurance_invoice_items ii
WHERE ii.case_id = cs.case_id
  AND ii.service_type = cs.service_type
  AND ii.description = cs.service_name
  AND cs.status = 'pending';
