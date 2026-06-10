-- Add tsvector column for full-text search
ALTER TABLE "file_system_nodes" ADD COLUMN IF NOT EXISTS "searchVector" tsvector;

-- GIN index on tsvector for fast full-text search
CREATE INDEX IF NOT EXISTS "idx_file_system_nodes_search_vector"
  ON "file_system_nodes" USING GIN("searchVector");

-- Trigger function: auto-update searchVector on name/description change
CREATE OR REPLACE FUNCTION "update_search_vector"()
RETURNS trigger AS $$
BEGIN
  NEW."searchVector" :=
    setweight(to_tsvector('simple', coalesce(NEW."name", '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(NEW."description", '')), 'B');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger: fire on INSERT or UPDATE of name or description
DROP TRIGGER IF EXISTS "trg_file_system_nodes_search_vector" ON "file_system_nodes";
CREATE TRIGGER "trg_file_system_nodes_search_vector"
  BEFORE INSERT OR UPDATE OF "name", "description"
  ON "file_system_nodes"
  FOR EACH ROW
  EXECUTE FUNCTION "update_search_vector"();

-- Initialize searchVector for all existing rows
UPDATE "file_system_nodes"
SET "searchVector" =
  setweight(to_tsvector('simple', coalesce("name", '')), 'A') ||
  setweight(to_tsvector('simple', coalesce("description", '')), 'B')
WHERE "searchVector" IS NULL;
