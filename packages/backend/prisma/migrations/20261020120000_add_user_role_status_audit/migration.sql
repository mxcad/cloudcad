-- #487 角色/状态变更零审计：补两条账号安全审计动作
-- （resourceType=USER，params 记 oldRoleId/newRoleId、oldStatus/newStatus；
--   写库失败不阻塞业务，与注销类埋点同一约束）
-- ADD VALUE 为在线变更，不锁表、不影响存量数据
-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'USER_ROLE_CHANGE';
ALTER TYPE "AuditAction" ADD VALUE 'USER_STATUS_CHANGE';
