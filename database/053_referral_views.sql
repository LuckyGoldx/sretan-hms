-- ============================================================
-- REFERRAL VIEWS: per-user tracking of viewed completed referrals
-- Powers the side-menu badge for unviewed completed referrals.
-- Idempotent: safe to run on every server boot.
-- ============================================================
CREATE TABLE IF NOT EXISTS referral_views (
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  referral_id UUID REFERENCES referrals(id) ON DELETE CASCADE,
  user_id UUID REFERENCES staff_users(id) ON DELETE CASCADE,
  viewed_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (referral_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_referral_views_user
  ON referral_views (user_id, viewed_at);
