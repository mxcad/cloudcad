-- Rename cooperate_shares to file_shares (idempotent)
DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'cooperate_shares') THEN
    ALTER TABLE "cooperate_shares" RENAME TO "file_shares";
  END IF;
END $$;

-- Drop collaborationEnabled column (idempotent)
DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'file_shares' AND column_name = 'collaborationEnabled') THEN
    ALTER TABLE "file_shares" DROP COLUMN IF EXISTS "collaborationEnabled";
  END IF;
END $$;
