-- Add totalSize column for caching project/personal-space total sizes
ALTER TABLE "file_system_nodes" ADD COLUMN "totalSize" DOUBLE PRECISION DEFAULT 0;

-- Backfill: calculate total size for all project and personal-space root nodes
UPDATE "file_system_nodes" root
SET "totalSize" = (
  SELECT COALESCE(SUM(child.size), 0)
  FROM "file_system_nodes" child
  WHERE child."projectId" = root.id
    AND child."nodeType" = 'FILE'
    AND (child."fileStatus" IS DISTINCT FROM 'DELETED')
)
WHERE root."nodeType" IN ('PROJECT', 'PERSONAL_SPACE');
