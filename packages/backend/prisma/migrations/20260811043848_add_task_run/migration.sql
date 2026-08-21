-- CreateEnum
CREATE TYPE "TaskRunStatus" AS ENUM ('SUCCESS', 'FAILED');

-- CreateEnum
CREATE TYPE "TaskRunTrigger" AS ENUM ('SCHEDULED', 'MANUAL');

-- CreateTable
CREATE TABLE "task_runs" (
    "id" TEXT NOT NULL,
    "taskName" TEXT NOT NULL,
    "status" "TaskRunStatus" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "errorSummary" TEXT,
    "trigger" "TaskRunTrigger" NOT NULL DEFAULT 'SCHEDULED',
    "triggeredBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "task_runs_taskName_startedAt_idx" ON "task_runs"("taskName", "startedAt");

-- CreateIndex
CREATE INDEX "task_runs_status_startedAt_idx" ON "task_runs"("status", "startedAt");
