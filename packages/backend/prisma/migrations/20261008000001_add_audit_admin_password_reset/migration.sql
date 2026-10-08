-- #417 管理员密码重置恢复通道（ADR-0072）：运维 CLI 重置管理员密码时写入的审计动作
-- ADD VALUE 为在线变更，不锁表、不影响存量数据
-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'ADMIN_PASSWORD_RESET';
