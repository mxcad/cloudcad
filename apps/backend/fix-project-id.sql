-- 修复所有projectId为null的节点
WITH RECURSIVE project_roots AS (
  -- 找到所有项目的根节点（isRoot = true）
  SELECT id, id as project_id
  FROM "file_system_nodes"
  WHERE "isRoot" = true 
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

-- 检查修复结果
SELECT COUNT(*) as total_nodes,
       COUNT(CASE WHEN "projectId" IS NULL THEN 1 END) as null_project_id_nodes
FROM "file_system_nodes"
WHERE "deletedAt" IS NULL;