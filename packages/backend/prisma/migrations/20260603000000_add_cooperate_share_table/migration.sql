-- CreateTable
CREATE TABLE "cooperate_shares" (
    "id" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "expiresAt" TIMESTAMP,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "deletedAt" TIMESTAMP,
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP NOT NULL,

    CONSTRAINT "cooperate_shares_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cooperate_shares_token_key" ON "cooperate_shares"("token");
CREATE INDEX "cooperate_shares_fileId_idx" ON "cooperate_shares"("fileId");
CREATE INDEX "cooperate_shares_token_idx" ON "cooperate_shares"("token");
CREATE INDEX "cooperate_shares_createdBy_idx" ON "cooperate_shares"("createdBy");

-- AddForeignKey
ALTER TABLE "cooperate_shares" ADD CONSTRAINT "cooperate_shares_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;