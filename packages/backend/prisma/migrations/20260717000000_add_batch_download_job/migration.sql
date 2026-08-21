-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "BatchJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateTable
CREATE TABLE "batch_download_jobs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,
    "status" "BatchJobStatus" NOT NULL DEFAULT 'PENDING',
    "fileList" JSONB NOT NULL,
    "totalCount" INTEGER NOT NULL,
    "completedCount" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "zipPath" TEXT,
    "zipSize" INTEGER,
    "errors" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "batch_download_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "batch_download_jobs_userId_idx" ON "batch_download_jobs"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "batch_download_jobs_status_idx" ON "batch_download_jobs"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "batch_download_jobs_createdAt_idx" ON "batch_download_jobs"("createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "batch_download_jobs_expiresAt_idx" ON "batch_download_jobs"("expiresAt");
