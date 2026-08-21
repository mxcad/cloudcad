-- #207 阶段 1：AuditLog schema 重构（ADR-0045）
-- 1. 存量噪音数据全清（旧枚举值失配 + 零价值：登录/下载/绑定类成功记录）
-- 2. details 字段废弃（JSON blob -> 结构化 params JSON）
-- 3. 新增 projectId（项目维度过滤）/ resourceName（名称快照）/ params（结构化 JSON）

-- 先清数据再处理列（drop column 前清空，避免残留）
DELETE FROM "audit_logs";

-- AlterTable
ALTER TABLE "audit_logs" DROP COLUMN "details",
ADD COLUMN     "params" JSONB,
ADD COLUMN     "projectId" TEXT,
ADD COLUMN     "resourceName" TEXT;

-- CreateIndex
CREATE INDEX "audit_logs_projectId_idx" ON "audit_logs"("projectId");
