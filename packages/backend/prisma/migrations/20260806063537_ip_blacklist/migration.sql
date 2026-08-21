-- CreateEnum
CREATE TYPE "BlacklistSource" AS ENUM ('MANUAL', 'AUTO');

-- AlterEnum
ALTER TYPE "Permission" ADD VALUE 'SYSTEM_IP_BLACKLIST_MANAGE';

-- CreateTable
CREATE TABLE "ip_blacklist_entries" (
    "id" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "source" "BlacklistSource" NOT NULL,
    "reason" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "ip_blacklist_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ip_blacklist_entries_ip_idx" ON "ip_blacklist_entries"("ip");

-- CreateIndex
CREATE INDEX "ip_blacklist_entries_expiresAt_idx" ON "ip_blacklist_entries"("expiresAt");
