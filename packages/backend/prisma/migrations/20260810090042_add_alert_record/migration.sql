-- CreateEnum
CREATE TYPE "AlertLevel" AS ENUM ('WARNING', 'CRITICAL');

-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('OPEN', 'RESOLVED');

-- CreateTable
CREATE TABLE "alert_records" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "messageKey" TEXT NOT NULL,
    "level" "AlertLevel" NOT NULL,
    "message" TEXT NOT NULL,
    "detail" JSONB,
    "status" "AlertStatus" NOT NULL DEFAULT 'OPEN',
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alert_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "alert_records_source_messageKey_status_idx" ON "alert_records"("source", "messageKey", "status");

-- CreateIndex
CREATE INDEX "alert_records_status_level_idx" ON "alert_records"("status", "level");

-- CreateIndex
CREATE INDEX "alert_records_createdAt_idx" ON "alert_records"("createdAt");
