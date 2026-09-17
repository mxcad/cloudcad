-- #323 审计受限删除：新增清理动作审计枚举 AUDIT_CLEANUP
-- 清理动作本身必须留痕（等保 8.4.3.3 防未授权删除），记录操作者/时间/范围/结果
-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'AUDIT_CLEANUP';
