-- Add phone and wechat fields to users table
ALTER TABLE "users" ADD COLUMN "phone" TEXT;
ALTER TABLE "users" ADD COLUMN "phoneVerified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN "phoneVerifiedAt" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN "wechatId" TEXT;
ALTER TABLE "users" ADD COLUMN "provider" TEXT NOT NULL DEFAULT 'LOCAL';
ALTER TABLE "users" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- Create unique indexes for phone and wechatId
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");
CREATE UNIQUE INDEX "users_wechatId_key" ON "users"("wechatId");

-- Create index for soft delete
CREATE INDEX "users_deletedAt_idx" ON "users"("deletedAt");

-- Make password nullable for third-party login
ALTER TABLE "users" ALTER COLUMN "password" DROP NOT NULL;
