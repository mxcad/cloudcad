-- 管理员专属登录（IP 白名单）：
-- 1. Permission 枚举新增 SYSTEM_IP_WHITELIST_MANAGE（白名单管理页权限）
-- 2. 新增 ip_whitelist_entries 表（DB 白名单通道；与服务器本地文件白名单取并集生效）
-- 3. 幂等回填：ADMIN 系统角色补授新权限（存量部署不重跑 seed 也能拿到）

-- AlterEnum
ALTER TYPE "Permission" ADD VALUE 'SYSTEM_IP_WHITELIST_MANAGE';

-- AlterEnum（审计动作/资源类型：白名单增删 + 管理员专用入口登录）
ALTER TYPE "AuditAction" ADD VALUE 'IP_WHITELIST_ADD';
ALTER TYPE "AuditAction" ADD VALUE 'IP_WHITELIST_REMOVE';
ALTER TYPE "AuditAction" ADD VALUE 'ADMIN_LOGIN';
ALTER TYPE "ResourceType" ADD VALUE 'IpWhitelistEntry';

-- CreateTable
CREATE TABLE "ip_whitelist_entries" (
    "id" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "source" "BlacklistSource" NOT NULL,
    "reason" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "ip_whitelist_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ip_whitelist_entries_ip_idx" ON "ip_whitelist_entries"("ip");

-- CreateIndex
CREATE INDEX "ip_whitelist_entries_expiresAt_idx" ON "ip_whitelist_entries"("expiresAt");

-- BackfillRolePermission（幂等： roleId+permission 唯一约束，重复执行无副作用）
INSERT INTO "role_permissions" ("id", "roleId", "permission", "createdAt")
SELECT 'rp_admin_ip_whitelist_' || r."id", r."id", 'SYSTEM_IP_WHITELIST_MANAGE', CURRENT_TIMESTAMP
FROM "roles" r
WHERE r."name" = 'ADMIN'
ON CONFLICT ("roleId", "permission") DO NOTHING;
