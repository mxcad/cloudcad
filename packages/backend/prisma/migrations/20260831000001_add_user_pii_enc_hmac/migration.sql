-- #417 PII 字段级加密（等保三级 8.1.4.8）：users 表新增 phone/email 的 AES-256-GCM 密文列
-- 与 HMAC-SHA256 归一化索引列（查询走 HMAC 列等值匹配）。
-- 双写阶段：明文列 phone/email 保留（至收缩阶段删除）；HMAC 列加唯一约束与明文列同语义。
-- 存量数据由 backfill 脚本回填（见 scripts/pii-backfill.ts），回填校验通过后才切换读路径。

-- AlterTable
ALTER TABLE "users" ADD COLUMN "emailEnc" TEXT;
ALTER TABLE "users" ADD COLUMN "emailHmac" TEXT;
ALTER TABLE "users" ADD COLUMN "phoneEnc" TEXT;
ALTER TABLE "users" ADD COLUMN "phoneHmac" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "users_emailHmac_key" ON "users"("emailHmac");
CREATE UNIQUE INDEX "users_phoneHmac_key" ON "users"("phoneHmac");
