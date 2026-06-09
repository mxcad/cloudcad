-- Rename cooperate_shares to file_shares
ALTER TABLE "cooperate_shares" RENAME TO "file_shares";

-- Drop collaborationEnabled column
ALTER TABLE "file_shares" DROP COLUMN "collaborationEnabled";
