-- 073_pg_trgm_extension.sql
-- Enables trigram matching so ILIKE '%term%' searches can use GIN indexes.
-- Kept in its own file: migrations are applied one file per query, and an
-- extension permission failure here must not abort the index migration.

CREATE EXTENSION IF NOT EXISTS pg_trgm;
