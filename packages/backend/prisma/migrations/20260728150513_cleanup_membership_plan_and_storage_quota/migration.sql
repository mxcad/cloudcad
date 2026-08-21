-- Cleanup: remove MembershipPlan, storageQuota, MembershipTier
-- Nullify any remaining planId first, then drop FK, column, table, and enum

ALTER TABLE "payment_orders" DROP CONSTRAINT IF EXISTS "payment_orders_planId_fkey";

ALTER TABLE "file_system_nodes" DROP COLUMN IF EXISTS "storageQuota";

ALTER TABLE "payment_orders" DROP COLUMN IF EXISTS "planId";

DROP TABLE IF EXISTS "membership_plans";

DROP TYPE IF EXISTS "MembershipTier";
