-- CreateEnum
CREATE TYPE "RefundApplicationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "deactivatedBy" TEXT;

-- CreateTable
CREATE TABLE "refund_applications" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "RefundApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "reviewerId" TEXT,
    "reviewNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "refund_applications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "refund_applications_orderId_status_idx" ON "refund_applications"("orderId", "status");

-- CreateIndex
CREATE INDEX "refund_applications_userId_status_createdAt_idx" ON "refund_applications"("userId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "refund_applications_status_createdAt_idx" ON "refund_applications"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "refund_applications" ADD CONSTRAINT "refund_applications_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "payment_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund_applications" ADD CONSTRAINT "refund_applications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
