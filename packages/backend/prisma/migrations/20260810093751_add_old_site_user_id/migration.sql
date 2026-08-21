-- AlterTable
ALTER TABLE "users" ADD COLUMN     "oldSiteUserId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "users_oldSiteUserId_key" ON "users"("oldSiteUserId");
