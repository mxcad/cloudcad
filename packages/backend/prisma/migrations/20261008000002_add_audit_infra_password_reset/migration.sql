-- ADR-0073 基础设施密码重置（运维 CLI 改数据库/Redis 密码后写入的审计动作）
-- ADD VALUE 为在线变更，不锁表、不影响存量数据
-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'DB_PASSWORD_RESET';
ALTER TYPE "AuditAction" ADD VALUE 'REDIS_PASSWORD_RESET';
