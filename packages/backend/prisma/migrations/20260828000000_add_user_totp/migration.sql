-- #415 管理员 TOTP 双因素鉴别（等保 8.1.4.1(d)）：User 表新增 TOTP 字段 + MFA 审计动作
-- totpSecret 存 AES-256-GCM 密文（格式 enc:v1:<iv>:<ciphertext>:<tag>），不落明文
-- totpEnabled 为启用标志；启用后管理员登录入口必须通过动态码校验
-- MFA_BIND = 首码验证激活；MFA_UNBIND = 运维 CLI 解绑（找回路径，审计留痕）

-- AlterTable
ALTER TABLE "users" ADD COLUMN "totpSecret" TEXT, ADD COLUMN "totpEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'MFA_BIND';
ALTER TYPE "AuditAction" ADD VALUE 'MFA_UNBIND';
