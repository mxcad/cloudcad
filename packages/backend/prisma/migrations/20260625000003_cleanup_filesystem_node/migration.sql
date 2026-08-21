-- 删除冗余 personalSpaceKey（与个人空间根节点 ownerId 恒等）
ALTER TABLE file_system_nodes DROP COLUMN IF EXISTS "personalSpaceKey";
DROP INDEX IF EXISTS "unique_personal_space";
CREATE UNIQUE INDEX "unique_personal_space"
  ON file_system_nodes ("ownerId") WHERE "nodeType" = 'PERSONAL_SPACE';

-- 删除无用 storageQuota 索引，并以 CHECK 约束固化"仅根节点可有配额"语义
-- 注意：storageQuota 使用 -1 / 0 作为"无配额"哨兵值（schema 默认 -1），
--       因此约束允许 NULL 与 <=0 适用于任意节点；仅当 storageQuota 为正时才
--       限制必须是根节点类型（PERSONAL_SPACE / PROJECT / LIBRARY_DRAWING / LIBRARY_BLOCK）
DROP INDEX IF EXISTS "file_system_nodes_storageQuota_idx";
ALTER TABLE file_system_nodes
  DROP CONSTRAINT IF EXISTS "chk_storage_quota_root";
ALTER TABLE file_system_nodes
  ADD CONSTRAINT "chk_storage_quota_root"
  CHECK ("storageQuota" IS NULL OR "storageQuota" <= 0 OR "nodeType" IN
    ('PERSONAL_SPACE','PROJECT','LIBRARY_DRAWING','LIBRARY_BLOCK'));
