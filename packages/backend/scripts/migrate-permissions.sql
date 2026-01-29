-- 权限数据迁移脚本：将权限值从 SYSTEM_ 前缀格式改为无前缀格式
-- 运行方式：Get-Content migrate-permissions.sql | docker exec -i cloucad-postgres psql -U postgres -d cloucad

-- 更新系统权限（移除 SYSTEM_ 前缀）
UPDATE role_permissions
SET permission = 'USER_READ'
WHERE permission = 'SYSTEM_USER_READ';

UPDATE role_permissions
SET permission = 'USER_CREATE'
WHERE permission = 'SYSTEM_USER_CREATE';

UPDATE role_permissions
SET permission = 'USER_UPDATE'
WHERE permission = 'SYSTEM_USER_UPDATE';

UPDATE role_permissions
SET permission = 'USER_DELETE'
WHERE permission = 'SYSTEM_USER_DELETE';

UPDATE role_permissions
SET permission = 'ROLE_READ'
WHERE permission = 'SYSTEM_ROLE_READ';

UPDATE role_permissions
SET permission = 'ROLE_CREATE'
WHERE permission = 'SYSTEM_ROLE_CREATE';

UPDATE role_permissions
SET permission = 'ROLE_UPDATE'
WHERE permission = 'SYSTEM_ROLE_UPDATE';

UPDATE role_permissions
SET permission = 'ROLE_DELETE'
WHERE permission = 'SYSTEM_ROLE_DELETE';

UPDATE role_permissions
SET permission = 'ROLE_PERMISSION_MANAGE'
WHERE permission = 'SYSTEM_ROLE_PERMISSION_MANAGE';

UPDATE role_permissions
SET permission = 'FONT_READ'
WHERE permission = 'SYSTEM_FONT_READ';

UPDATE role_permissions
SET permission = 'FONT_UPLOAD'
WHERE permission = 'SYSTEM_FONT_UPLOAD';

UPDATE role_permissions
SET permission = 'FONT_DELETE'
WHERE permission = 'SYSTEM_FONT_DELETE';

UPDATE role_permissions
SET permission = 'FONT_DOWNLOAD'
WHERE permission = 'SYSTEM_FONT_DOWNLOAD';

UPDATE role_permissions
SET permission = 'SYSTEM_ADMIN'
WHERE permission = 'SYSTEM_ADMIN';

UPDATE role_permissions
SET permission = 'SYSTEM_MONITOR'
WHERE permission = 'SYSTEM_MONITOR';

-- 显示更新结果
SELECT permission, COUNT(*) as count
FROM role_permissions
GROUP BY permission
ORDER BY permission;