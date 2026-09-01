-- ============================================================
-- REFERRAL OUTCOME NOTE + NOTIFICATIONS
-- Migration 050
-- Idempotent: safe to run on every server boot.
-- ============================================================

-- Outcome note recorded by the consultant when completing a consultation
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS outcome_note TEXT;

-- In-app notifications for staff (e.g. referring GP when a referral is
-- accepted or a consultation is completed)
CREATE TABLE IF NOT EXISTS notifications (
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id UUID REFERENCES staff_users(id) ON DELETE CASCADE,
  type VARCHAR(30) NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT,
  ref_table VARCHAR(50),
  ref_id UUID,
  patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  is_synced BOOLEAN DEFAULT false,
  last_synced_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient
  ON notifications (recipient_id, is_read);

CREATE INDEX IF NOT EXISTS idx_notifications_created
  ON notifications (tenant_id, created_at DESC);
