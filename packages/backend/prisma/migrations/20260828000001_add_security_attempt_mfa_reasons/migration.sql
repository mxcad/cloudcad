-- #415 管理员 TOTP 双因素：高危访问尝试新增 MFA 失败原因
-- mfa_code_missing = 已启用 TOTP 的管理员登录未带动态码
-- mfa_code_invalid = 已启用 TOTP 的管理员登录动态码校验失败

-- AlterEnum
ALTER TYPE "SecurityAttemptReason" ADD VALUE 'mfa_code_missing';
ALTER TYPE "SecurityAttemptReason" ADD VALUE 'mfa_code_invalid';
