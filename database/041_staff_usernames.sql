-- Staff usernames: login by username (email still accepted)
ALTER TABLE staff_users ADD COLUMN IF NOT EXISTS username VARCHAR(255);
ALTER TABLE insurance_staff_users ADD COLUMN IF NOT EXISTS username VARCHAR(255);

-- Backfill usernames from the email local part (doctor@sretan.com -> doctor)
UPDATE staff_users SET username = LOWER(split_part(email, '@', 1))
WHERE username IS NULL AND email IS NOT NULL AND email <> '';
UPDATE insurance_staff_users SET username = LOWER(split_part(email, '@', 1))
WHERE username IS NULL AND email IS NOT NULL AND email <> '';

-- Fallback for rows without an email
UPDATE staff_users SET username = 'user' || LEFT(REPLACE(id::text, '-', ''), 8)
WHERE username IS NULL OR username = '';
UPDATE insurance_staff_users SET username = 'user' || LEFT(REPLACE(id::text, '-', ''), 8)
WHERE username IS NULL OR username = '';

-- Deduplicate usernames by appending _N (idempotent)
DO $$
DECLARE
  row RECORD;
  base TEXT;
  candidate TEXT;
  n INT;
BEGIN
  FOR row IN SELECT id, username FROM staff_users WHERE username IS NOT NULL ORDER BY created_at, id LOOP
    IF (SELECT COUNT(*) FROM staff_users WHERE LOWER(username) = LOWER(row.username)) > 1 THEN
      base := row.username;
      candidate := base;
      n := 1;
      LOOP
        candidate := base || '_' || n;
        EXIT WHEN NOT EXISTS (SELECT 1 FROM staff_users WHERE LOWER(username) = LOWER(candidate) AND id <> row.id);
        n := n + 1;
      END LOOP;
      UPDATE staff_users SET username = candidate WHERE id = row.id;
    END IF;
  END LOOP;
  FOR row IN SELECT id, username FROM insurance_staff_users WHERE username IS NOT NULL ORDER BY id LOOP
    IF (SELECT COUNT(*) FROM insurance_staff_users WHERE LOWER(username) = LOWER(row.username)) > 1 THEN
      base := row.username;
      candidate := base;
      n := 1;
      LOOP
        candidate := base || '_' || n;
        EXIT WHEN NOT EXISTS (SELECT 1 FROM insurance_staff_users WHERE LOWER(username) = LOWER(candidate) AND id <> row.id);
        n := n + 1;
      END LOOP;
      UPDATE insurance_staff_users SET username = candidate WHERE id = row.id;
    END IF;
  END LOOP;
END $$;
