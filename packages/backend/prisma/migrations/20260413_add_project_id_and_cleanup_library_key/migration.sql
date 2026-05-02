-- 添加 projectId 字段（用于快速查询文件所属项目）
ALTER TABLE "file_system_nodes" ADD COLUMN IF NOT EXISTS "projectId" TEXT;

-- 创建 projectId 索引
CREATE INDEX IF NOT EXISTS "file_system_nodes_projectId_idx" ON "file_system_nodes"("projectId");

-- 添加 projectId 外键约束（如果不存在）
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'file_system_nodes_projectId_fkey'
  ) THEN
    ALTER TABLE "file_system_nodes" ADD CONSTRAINT "file_system_nodes_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "file_system_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- 填充 projectId 数据（从项目的根节点开始递归）
WITH RECURSIVE project_roots AS (
  -- 找到所有项目的根节点（isRoot = true 且不是公共资源库）
  SELECT id, id as project_id
  FROM "file_system_nodes"
  WHERE "isRoot" = true 
    AND "libraryKey" IS NULL
    AND "personalSpaceKey" IS NULL
    AND "deletedAt" IS NULL
),
node_hierarchy AS (
  -- 项目根节点
  SELECT id, project_id
  FROM project_roots
  UNION ALL
  -- 递归查找所有子节点
  SELECT n.id, nh.project_id
  FROM "file_system_nodes" n
  INNER JOIN node_hierarchy nh ON n."parentId" = nh.id
  WHERE n."deletedAt" IS NULL
)
UPDATE "file_system_nodes"
SET "projectId" = nh.project_id
FROM node_hierarchy nh
WHERE "file_system_nodes".id = nh.id
  AND "file_system_nodes"."projectId" IS NULL;

-- 清理非根节点的 libraryKey（只保留根节点的 libraryKey）
UPDATE "file_system_nodes"
SET "libraryKey" = NULL
WHERE "isRoot" = false
  AND "libraryKey" IS NOT NULL
  AND "deletedAt" IS NULL;

-- 添加 storageQuota 字段
ALTER TABLE "file_system_nodes" ADD COLUMN IF NOT EXISTS "storageQuota" INTEGER DEFAULT 0;
