-- #321 三权分立（等保 8.5.2）：新增审计管理员权限位 AUDIT_ADMIN
-- 审计数据管理（查询/导出/清理）与系统管理（SYSTEM_ADMIN）分离

-- AlterEnum
ALTER TYPE "Permission" ADD VALUE 'AUDIT_ADMIN';
