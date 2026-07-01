CREATE TABLE IF NOT EXISTS clinical_note_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id UUID REFERENCES nurse_notes(id) ON DELETE CASCADE,
  viewed_by UUID REFERENCES staff_users(id),
  viewed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(note_id, viewed_by)
);
