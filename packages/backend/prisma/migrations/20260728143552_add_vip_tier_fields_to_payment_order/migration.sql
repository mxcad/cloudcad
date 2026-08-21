-- Step 1: Drop existing FK constraint
ALTER TABLE "payment_orders" DROP CONSTRAINT IF EXISTS "payment_orders_planId_fkey";

-- Step 2: Add new columns (nullable for expand phase)
ALTER TABLE "payment_orders" ADD COLUMN "vipTierId" TEXT;
ALTER TABLE "payment_orders" ADD COLUMN "months" INTEGER;
ALTER TABLE "payment_orders" ALTER COLUMN "planId" DROP NOT NULL;

-- Step 3: Migrate existing data — map MembershipPlan to VipTier
--        PRO → level 1 (VIP1),  FREE → level 0 (VIP0)
UPDATE "payment_orders" po
SET "vipTierId" = (
  SELECT vt.id FROM "vip_tiers" vt
  INNER JOIN "membership_plans" mp ON mp.id = po."planId"
  WHERE vt."level" = CASE mp."tier" WHEN 'PRO' THEN 1 WHEN 'FREE' THEN 0 ELSE 0 END
)
WHERE po."planId" IS NOT NULL;

-- Step 4: Set months from MembershipPlan durationDays
UPDATE "payment_orders" po
SET "months" = (
  SELECT
    CASE
      WHEN mp."durationDays" = 30 THEN 1
      WHEN mp."durationDays" = 180 THEN 6
      WHEN mp."durationDays" = 365 THEN 12
      ELSE mp."durationDays" / 30
    END
  FROM "membership_plans" mp
  WHERE mp.id = po."planId"
)
WHERE po."planId" IS NOT NULL;

-- Step 5: Re-add old FK as nullable
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_planId_fkey"
  FOREIGN KEY ("planId") REFERENCES "membership_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Step 6: Add new FK
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_vipTierId_fkey"
  FOREIGN KEY ("vipTierId") REFERENCES "vip_tiers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
