-- AlterTable
ALTER TABLE "feedback_attachments" ADD COLUMN     "contentHash" TEXT;

-- CreateIndex
CREATE INDEX "feedback_attachments_contentHash_idx" ON "feedback_attachments"("contentHash");
