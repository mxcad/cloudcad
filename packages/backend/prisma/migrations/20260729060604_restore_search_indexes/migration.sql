-- Re-create GIN indexes dropped by baseline_drift_fix (20260728135500)
-- These indexes cannot be declared in schema.prisma (Unsupported types / extension ops),
-- so they are managed manually via this migration.
--
-- References:
--   idx_file_system_nodes_search_vector  — originally from 20260610000000_add_fts_search
--   idx_file_system_nodes_name_trgm       — originally from 20260727120000_add_pg_trgm_index
--   idx_file_system_nodes_description_trgm — originally from 20260727120000_add_pg_trgm_index

CREATE INDEX IF NOT EXISTS "idx_file_system_nodes_search_vector"
  ON "file_system_nodes" USING GIN("searchVector");

CREATE INDEX IF NOT EXISTS idx_file_system_nodes_name_trgm
  ON file_system_nodes USING GIN (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_file_system_nodes_description_trgm
  ON file_system_nodes USING GIN (description gin_trgm_ops);