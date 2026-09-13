-- ============================================================
-- 087: Multiple handover recipients
--
-- A shift handover can be handed to more than one incoming nurse. Each
-- recipient is tracked (and can acknowledge) individually.
--
-- Idempotent: safe to run on every server boot.
-- ============================================================

CREATE TABLE IF NOT EXISTS handover_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  handover_id UUID REFERENCES handovers(id) ON DELETE CASCADE,
  staff_id UUID,
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_handover_recipients_handover ON handover_recipients (handover_id);
CREATE INDEX IF NOT EXISTS idx_handover_recipients_staff ON handover_recipients (tenant_id, staff_id, acknowledged_at);

-- Backfill the original single recipient into the new table.
INSERT INTO handover_recipients (id, tenant_id, handover_id, staff_id)
SELECT gen_random_uuid(), h.tenant_id, h.id, h.handover_to
  FROM handovers h
 WHERE h.handover_to IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM handover_recipients hr WHERE hr.handover_id = h.id AND hr.staff_id = h.handover_to);
