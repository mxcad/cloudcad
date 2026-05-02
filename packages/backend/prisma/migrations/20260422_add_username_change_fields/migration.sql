-- 添加用户名修改历史和次数相关字段

-- 1. 添加 usernameChangeCount 字段
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "usernameChangeCount" INTEGER DEFAULT 0;

-- 2. 添加 lastUsernameChangeAt 字段
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "lastUsernameChangeAt" TIMESTAMP;
