-- 审计动作新增：用户反馈删除记录（级联删奖励/附件，附件物理文件由附件服务先清理）。
-- 与 backend/src/common/enums/audit.enum.ts 的 FEEDBACK_DELETE 保持一致。
-- IF NOT EXISTS 幂等：若因并行会话曾手工补值，重复执行/将来 migrate deploy 重跑无害。
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'FEEDBACK_DELETE';
