-- Step 1: Create NodeType enum
CREATE TYPE "NodeType" AS ENUM ('FILE', 'FOLDER', 'PROJECT', 'PERSONAL_SPACE', 'LIBRARY_DRAWING', 'LIBRARY_BLOCK');

-- Step 2: Add nodeType column (nullable for backfill)
ALTER TABLE "file_system_nodes" ADD COLUMN "nodeType" "NodeType";

-- Step 3: Backfill nodeType from old discriminant fields
-- Priority: personalSpaceKey > libraryKey > isRoot > isFolder > FILE
UPDATE "file_system_nodes"
SET "nodeType" = CASE
  WHEN "personalSpaceKey" IS NOT NULL THEN 'PERSONAL_SPACE'::"NodeType"
  WHEN "libraryKey" = 'drawing' THEN 'LIBRARY_DRAWING'::"NodeType"
  WHEN "libraryKey" = 'block' THEN 'LIBRARY_BLOCK'::"NodeType"
  WHEN "isRoot" = true THEN 'PROJECT'::"NodeType"
  WHEN "isFolder" = true THEN 'FOLDER'::"NodeType"
  ELSE 'FILE'::"NodeType"
END;

-- Step 4: Enforce NOT NULL
ALTER TABLE "file_system_nodes" ALTER COLUMN "nodeType" SET NOT NULL;

-- Step 5: Remove old discriminant columns
-- Indexes referencing these columns (isRoot, isFolder, libraryKey) are auto-dropped by PostgreSQL
ALTER TABLE "file_system_nodes" DROP COLUMN "isRoot";
ALTER TABLE "file_system_nodes" DROP COLUMN "isFolder";
ALTER TABLE "file_system_nodes" DROP COLUMN "libraryKey";

-- Step 6: Create new indexes for nodeType
CREATE INDEX "file_system_nodes_node_type_idx" ON "file_system_nodes"("nodeType");
CREATE INDEX "idx_project_search" ON "file_system_nodes"("projectId", "deletedAt", "nodeType", "updatedAt");
CREATE INDEX "idx_library_search" ON "file_system_nodes"("nodeType", "deletedAt", "updatedAt");
