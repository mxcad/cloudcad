-- Data migration: convert ENTERPRISE records to PRO
UPDATE "membership_plans" SET "tier" = 'PRO' WHERE "tier" = 'ENTERPRISE';
UPDATE "user_memberships" SET "tier" = 'PRO' WHERE "tier" = 'ENTERPRISE';

-- AlterEnum: remove ENTERPRISE from MembershipTier
CREATE TYPE "MembershipTier_new" AS ENUM ('FREE', 'PRO');
ALTER TABLE "membership_plans" ALTER COLUMN "tier" DROP DEFAULT;
ALTER TABLE "membership_plans" ALTER COLUMN "tier" TYPE "MembershipTier_new" USING ("tier"::text::"MembershipTier_new");
ALTER TABLE "membership_plans" ALTER COLUMN "tier" SET DEFAULT 'FREE';
ALTER TABLE "user_memberships" ALTER COLUMN "tier" TYPE "MembershipTier_new" USING ("tier"::text::"MembershipTier_new");
DROP TYPE "MembershipTier";
ALTER TYPE "MembershipTier_new" RENAME TO "MembershipTier";
