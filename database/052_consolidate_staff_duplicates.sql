-- ============================================================
-- CONSOLIDATE DUPLICATE STAFF ACCOUNTS
-- Duplicate accounts (same email) caused self-referral filtering
-- to fail: login returned one id while the referral dropdown
-- returned a different id for the same person.
-- Uses dynamic SQL over the catalog so every FK to staff_users is
-- remapped automatically. Idempotent: once duplicates are gone,
-- subsequent boots do nothing.
-- ============================================================

DO $$
DECLARE
  dup RECORD;
  keep_id UUID;
  drop_id UUID;
  fk RECORD;
  null_cols TEXT[] := ARRAY[
    'created_by', 'updated_by', 'deleted_by', 'edited_by', 'recorded_by',
    'rejected_by', 'voided_by', 'sold_by', 'ended_by', 'administered_by',
    'uploaded_by', 'booked_by', 'delivered_by', 'viewed_by'
  ];
BEGIN
  FOR dup IN
    SELECT LOWER(email) AS email_key, COUNT(*) AS c
    FROM staff_users
    GROUP BY LOWER(email)
    HAVING COUNT(*) > 1
  LOOP
    -- Canonical account: prefer the one whose username equals the email
    -- local-part (no "_N" suffix) and has the most data; fallback to earliest.
    SELECT id INTO keep_id
    FROM staff_users
    WHERE LOWER(email) = dup.email_key
    ORDER BY
      CASE WHEN username = SPLIT_PART(email, '@', 1) THEN 0 ELSE 1 END,
      (SELECT COUNT(*) FROM encounters e WHERE e.staff_id = staff_users.id) DESC,
      created_at, id
    LIMIT 1;

    FOR drop_id IN
      SELECT id FROM staff_users
      WHERE LOWER(email) = dup.email_key AND id <> keep_id
    LOOP
      -- Remap every FK column that points at staff_users
      FOR fk IN
        SELECT c.conrelid::regclass::text AS tbl, a.attname AS col, t.typname AS typ
        FROM pg_constraint c
        JOIN pg_attribute a ON a.attnum = ANY(c.conkey) AND a.attrelid = c.conrelid
        JOIN pg_type t ON t.oid = a.atttypid
        WHERE c.confrelid = 'staff_users'::regclass
          AND c.contype = 'f'
          AND a.attname IS NOT NULL
      LOOP
        BEGIN
          IF fk.typ = 'uuid' THEN
            EXECUTE format('UPDATE %I SET %I = %L WHERE %I = %L', fk.tbl, fk.col, keep_id, fk.col, drop_id);
          ELSE
            EXECUTE format('UPDATE %I SET %I = %L WHERE %I = %L', fk.tbl, fk.col, keep_id::text, fk.col, drop_id::text);
          END IF;
        EXCEPTION WHEN OTHERS THEN
          -- If a column can't be remapped (e.g. non-nullable conflict), clear it
          IF fk.col = ANY(null_cols) THEN
            EXECUTE format('UPDATE %I SET %I = NULL WHERE %I = %L', fk.tbl, fk.col, fk.col, drop_id::text);
          END IF;
        END;
      END LOOP;

      DELETE FROM staff_users WHERE id = drop_id;
    END LOOP;
  END LOOP;
END $$;
