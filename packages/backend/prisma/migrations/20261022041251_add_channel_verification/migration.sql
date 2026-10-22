-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'CHANNEL_TEST';

-- CreateTable
CREATE TABLE "channel_verifications" (
    "id" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "testedBy" TEXT NOT NULL,
    "testedByIp" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "channel_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "channel_verifications_channel_key" ON "channel_verifications"("channel");
