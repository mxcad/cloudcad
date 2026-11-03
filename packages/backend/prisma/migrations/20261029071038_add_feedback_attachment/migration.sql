-- CreateEnum
CREATE TYPE "FeedbackAttachmentType" AS ENUM ('IMAGE', 'DOCUMENT', 'DRAWING');

-- CreateEnum
CREATE TYPE "FeedbackAttachmentKind" AS ENUM ('FILE', 'REFERENCE');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'FEEDBACK_ATTACHMENT_UPLOAD';
ALTER TYPE "AuditAction" ADD VALUE 'FEEDBACK_ATTACHMENT_DELETE';

-- CreateTable
CREATE TABLE "feedback_attachments" (
    "id" TEXT NOT NULL,
    "feedbackId" TEXT,
    "type" "FeedbackAttachmentType" NOT NULL,
    "kind" "FeedbackAttachmentKind" NOT NULL,
    "storagePath" TEXT,
    "fileName" TEXT,
    "mimeType" TEXT,
    "size" INTEGER,
    "nodeId" TEXT,
    "fileHash" TEXT,
    "thumbnailPath" TEXT,
    "uploaderTokenHash" TEXT,
    "uploadedById" TEXT,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feedback_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "feedback_attachments_feedbackId_idx" ON "feedback_attachments"("feedbackId");

-- CreateIndex
CREATE INDEX "feedback_attachments_uploadedById_createdAt_idx" ON "feedback_attachments"("uploadedById", "createdAt");

-- CreateIndex
CREATE INDEX "feedback_attachments_createdAt_idx" ON "feedback_attachments"("createdAt");

-- AddForeignKey
ALTER TABLE "feedback_attachments" ADD CONSTRAINT "feedback_attachments_feedbackId_fkey" FOREIGN KEY ("feedbackId") REFERENCES "feedbacks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback_attachments" ADD CONSTRAINT "feedback_attachments_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
