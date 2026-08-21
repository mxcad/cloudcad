-- 同步 FILE_SHARE 权限到 ProjectPermission 枚举
ALTER TYPE "ProjectPermission" ADD VALUE IF NOT EXISTS 'FILE_SHARE';

-- 为系统项目角色补充 FILE_SHARE 权限（幂等操作）
INSERT INTO "project_role_permissions" ("id", "projectRoleId", "permission", "createdAt")
SELECT 'rp_' || substr(md5(random()::text || clock_timestamp()::text), 1, 22), r.id, 'FILE_SHARE', NOW()
FROM "project_roles" r
WHERE r.name IN ('PROJECT_OWNER', 'PROJECT_ADMIN', 'PROJECT_MEMBER')
  AND r."isSystem" = true
ON CONFLICT ("projectRoleId", "permission") DO NOTHING;
