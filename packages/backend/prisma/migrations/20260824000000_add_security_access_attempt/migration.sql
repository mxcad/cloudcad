-- 高危接口访问尝试记录（如管理员登录被拒）：
-- 认证前无合法 userId（audit_logs.userId 为强外键），故独立建表存储，
-- 供安全回溯 / 页面聚合展示 / 一键拉白拉黑。写库失败不阻塞登录流程。

-- CreateEnum
CREATE TYPE "SecurityAttemptReason" AS ENUM (
    'ip_not_allowed',
    'user_not_found',
    'account_unavailable',
    'not_admin',
    'bad_password',
    'blacklisted'
);

-- CreateTable
CREATE TABLE "security_access_attempts" (
    "id" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "reason" "SecurityAttemptReason" NOT NULL,
    "account" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "security_access_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "security_access_attempts_ip_idx" ON "security_access_attempts"("ip");

-- CreateIndex
CREATE INDEX "security_access_attempts_createdAt_idx" ON "security_access_attempts"("createdAt");

-- CreateIndex
CREATE INDEX "security_access_attempts_endpoint_idx" ON "security_access_attempts"("endpoint");
