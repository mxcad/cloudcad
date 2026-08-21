-- Enable pg_trgm extension for trigram-based ILIKE/text search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- GIN trigram index on name for fuzzy ILIKE search
CREATE INDEX IF NOT EXISTS idx_file_system_nodes_name_trgm
  ON file_system_nodes USING GIN (name gin_trgm_ops);

-- GIN trigram index on description for fuzzy ILIKE search
CREATE INDEX IF NOT EXISTS idx_file_system_nodes_description_trgm
  ON file_system_nodes USING GIN (description gin_trgm_ops);
