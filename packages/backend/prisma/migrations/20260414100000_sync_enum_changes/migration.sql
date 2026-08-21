-- 同步枚举变更（从 db push 迁移到正式迁移）

-- 1. 添加 STORAGE_QUOTA 权限到 Permission 枚举
ALTER TYPE "Permission" ADD VALUE IF NOT EXISTS 'STORAGE_QUOTA';

-- 2. 添加 PROJECT_CREATE 权限到 Permission 枚举
ALTER TYPE "Permission" ADD VALUE IF NOT EXISTS 'PROJECT_CREATE';

-- 3. 移除 SYSTEM_TEMPLATE_READ（如果存在）
-- 注意：PostgreSQL 不支持直接删除枚举值，这里仅记录变更
-- 实际删除需要在生产环境手动处理或重建枚举类型

-- 4. 移除 GALLERY_ADD 从 ProjectPermission 枚举
-- 注意：同上，PostgreSQL 不支持删除枚举值

-- 5. 为 file_system_nodes 表添加 storageQuota 索引
CREATE INDEX IF NOT EXISTS "file_system_nodes_storageQuota_idx" ON "file_system_nodes"("storageQuota");

-- 6. 为 ADMIN 角色添加 STORAGE_QUOTA 权限（幂等操作）
INSERT INTO "role_permissions" ("id", "roleId", "permission", "createdAt")
SELECT 'rp_' || substr(md5(random()::text || clock_timestamp()::text), 1, 22), r.id, 'STORAGE_QUOTA', NOW()
FROM "roles" r
WHERE r.name = 'ADMIN'
ON CONFLICT ("roleId", "permission") DO NOTHING;

-- 7. 为 USER_MANAGER 角色添加 STORAGE_QUOTA 权限（幂等操作）
INSERT INTO "role_permissions" ("id", "roleId", "permission", "createdAt")
SELECT 'rp_' || substr(md5(random()::text || clock_timestamp()::text), 1, 22), r.id, 'STORAGE_QUOTA', NOW()
FROM "roles" r
WHERE r.name = 'USER_MANAGER'
ON CONFLICT ("roleId", "permission") DO NOTHING;

-- 8. 为 USER 角色添加 PROJECT_CREATE 权限（幂等操作）
INSERT INTO "role_permissions" ("id", "roleId", "permission", "createdAt")
SELECT 'rp_' || substr(md5(random()::text || clock_timestamp()::text), 1, 22), r.id, 'PROJECT_CREATE', NOW()
FROM "roles" r
WHERE r.name = 'USER'
ON CONFLICT ("roleId", "permission") DO NOTHING;
