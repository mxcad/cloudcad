-- 用户反馈机制（feedback 模块）：
-- 1. 新增 4 个枚举：FeedbackType / FeedbackStatus / FeedbackSource / RewardStatus
-- 2. 新增 feedbacks 与 feedback_rewards 两张表（匿名可提交、奖励不可匿名）
-- 3. Permission 枚举新增 SYSTEM_FEEDBACK_READ/MANAGE/REWARD（列表/采纳/发奖）
-- 4. AuditAction 新增 FEEDBACK_ADOPT / FEEDBACK_REWARD_ISSUE / FEEDBACK_REWARD_REVOKE
--    ResourceType 新增 FEEDBACK（人工发奖必须留痕）
-- 5. 幂等回填：ADMIN 系统角色补授三个新权限（存量部署不重跑 seed 也能拿到）

-- CreateEnum
CREATE TYPE "FeedbackType" AS ENUM ('BUG', 'SUGGESTION', 'COMPLAINT', 'OTHER');

-- CreateEnum
CREATE TYPE "FeedbackStatus" AS ENUM ('PENDING', 'REVIEWING', 'ADOPTED', 'REJECTED', 'CLOSED');

-- CreateEnum
CREATE TYPE "FeedbackSource" AS ENUM ('PC', 'MOBILE');

-- CreateEnum
CREATE TYPE "RewardStatus" AS ENUM ('NONE', 'PENDING', 'ISSUED', 'REVOKED');

-- AlterEnum
ALTER TYPE "Permission" ADD VALUE 'SYSTEM_FEEDBACK_READ';
ALTER TYPE "Permission" ADD VALUE 'SYSTEM_FEEDBACK_MANAGE';
ALTER TYPE "Permission" ADD VALUE 'SYSTEM_FEEDBACK_REWARD';

-- AlterEnum（审计动作/资源类型：反馈采纳 + 奖励发放/撤销）
ALTER TYPE "AuditAction" ADD VALUE 'FEEDBACK_ADOPT';
ALTER TYPE "AuditAction" ADD VALUE 'FEEDBACK_REWARD_ISSUE';
ALTER TYPE "AuditAction" ADD VALUE 'FEEDBACK_REWARD_REVOKE';
ALTER TYPE "ResourceType" ADD VALUE 'FEEDBACK';

-- CreateTable
CREATE TABLE "feedbacks" (
    "id" TEXT NOT NULL,
    "type" "FeedbackType" NOT NULL,
    "status" "FeedbackStatus" NOT NULL DEFAULT 'PENDING',
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "source" "FeedbackSource" NOT NULL,
    "submitterId" TEXT,
    "contact" TEXT,
    "anonTokenHash" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "pageUrl" TEXT,
    "feedbackCode" TEXT NOT NULL,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "adoptNote" TEXT,
    "rejectReason" TEXT,
    "rewardStatus" "RewardStatus" NOT NULL DEFAULT 'NONE',
    "claimRequired" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feedbacks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "feedbacks_feedbackCode_key" ON "feedbacks"("feedbackCode");

-- CreateIndex
CREATE INDEX "feedbacks_status_createdAt_idx" ON "feedbacks"("status", "createdAt");

-- CreateIndex
CREATE INDEX "feedbacks_submitterId_createdAt_idx" ON "feedbacks"("submitterId", "createdAt");

-- CreateIndex
CREATE INDEX "feedbacks_ip_createdAt_idx" ON "feedbacks"("ip", "createdAt");

-- CreateIndex
CREATE INDEX "feedbacks_type_status_idx" ON "feedbacks"("type", "status");

-- CreateTable
CREATE TABLE "feedback_rewards" (
    "id" TEXT NOT NULL,
    "feedbackId" TEXT NOT NULL,
    "userId" TEXT,
    "vipTierLevel" INTEGER NOT NULL,
    "durationDays" INTEGER NOT NULL,
    "status" "RewardStatus" NOT NULL DEFAULT 'PENDING',
    "issuedById" TEXT,
    "issuedAt" TIMESTAMP(3),
    "remark" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feedback_rewards_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "feedback_rewards_feedbackId_key" ON "feedback_rewards"("feedbackId");

-- CreateIndex
CREATE INDEX "feedback_rewards_status_createdAt_idx" ON "feedback_rewards"("status", "createdAt");

-- CreateIndex
CREATE INDEX "feedback_rewards_userId_idx" ON "feedback_rewards"("userId");

-- AddForeignKey
ALTER TABLE "feedbacks" ADD CONSTRAINT "feedbacks_submitterId_fkey" FOREIGN KEY ("submitterId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback_rewards" ADD CONSTRAINT "feedback_rewards_feedbackId_fkey" FOREIGN KEY ("feedbackId") REFERENCES "feedbacks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback_rewards" ADD CONSTRAINT "feedback_rewards_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- BackfillRolePermission（幂等：roleId+permission 唯一约束，重复执行无副作用）
INSERT INTO "role_permissions" ("id", "roleId", "permission", "createdAt")
SELECT 'rp_admin_feedback_read_' || r."id", r."id", 'SYSTEM_FEEDBACK_READ', CURRENT_TIMESTAMP
FROM "roles" r
WHERE r."name" = 'ADMIN'
ON CONFLICT ("roleId", "permission") DO NOTHING;

INSERT INTO "role_permissions" ("id", "roleId", "permission", "createdAt")
SELECT 'rp_admin_feedback_manage_' || r."id", r."id", 'SYSTEM_FEEDBACK_MANAGE', CURRENT_TIMESTAMP
FROM "roles" r
WHERE r."name" = 'ADMIN'
ON CONFLICT ("roleId", "permission") DO NOTHING;

INSERT INTO "role_permissions" ("id", "roleId", "permission", "createdAt")
SELECT 'rp_admin_feedback_reward_' || r."id", r."id", 'SYSTEM_FEEDBACK_REWARD', CURRENT_TIMESTAMP
FROM "roles" r
WHERE r."name" = 'ADMIN'
ON CONFLICT ("roleId", "permission") DO NOTHING;
