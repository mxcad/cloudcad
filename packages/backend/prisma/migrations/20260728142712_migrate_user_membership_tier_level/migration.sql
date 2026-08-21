-- Step 1: Add new tierLevel column
ALTER TABLE "user_memberships" ADD COLUMN "tierLevel" INTEGER;

-- Step 2: Migrate existing data (FREE=0, PRO=1)
UPDATE "user_memberships" SET "tierLevel" = CASE
  WHEN "tier" = 'FREE' THEN 0
  WHEN "tier" = 'PRO' THEN 1
  ELSE 0
END;

-- Step 3: Make tierLevel NOT NULL with default
ALTER TABLE "user_memberships" ALTER COLUMN "tierLevel" SET NOT NULL;
ALTER TABLE "user_memberships" ALTER COLUMN "tierLevel" SET DEFAULT 0;

-- Step 4: Drop old tier column
ALTER TABLE "user_memberships" DROP COLUMN "tier";
