-- 通知中心删除公告：硬删不可恢复，审计留痕（resourceType=NOTICE，
-- params 记 wasActive 与批量条数；下线留档由 retract 负责）
-- ADD VALUE 为在线变更，不锁表、不影响存量数据
-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'NOTICE_DELETE';
ALTER TYPE "ResourceType" ADD VALUE 'NOTICE';
