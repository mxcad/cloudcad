-- AlterEnum
-- 项目操作历史：新增节点操作审计动作（文件夹创建/重命名/移动/复制/回收站恢复）
-- PostgreSQL 的 ALTER TYPE ADD VALUE 每条只能加一个值，逐条执行
ALTER TYPE "AuditAction" ADD VALUE 'FOLDER_CREATE';
ALTER TYPE "AuditAction" ADD VALUE 'NODE_RENAME';
ALTER TYPE "AuditAction" ADD VALUE 'NODE_MOVE';
ALTER TYPE "AuditAction" ADD VALUE 'NODE_COPY';
ALTER TYPE "AuditAction" ADD VALUE 'NODE_RESTORE';
