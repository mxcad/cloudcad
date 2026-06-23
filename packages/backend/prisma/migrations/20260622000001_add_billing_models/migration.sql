-- CreateEnum
CREATE TYPE "MembershipTier" AS ENUM ('FREE', 'PRO', 'ENTERPRISE');
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'REFUNDED', 'CLOSED', 'TIMEOUT');

-- CreateTable: membership_plans
CREATE TABLE "membership_plans" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "durationDays" INTEGER NOT NULL,
    "price" INTEGER NOT NULL,
    "originalPrice" INTEGER,
    "tier" "MembershipTier" NOT NULL DEFAULT 'PRO',
    "sortOrder" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "features" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "membership_plans_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "membership_plans_sortOrder_isActive_key" ON "membership_plans"("sortOrder", "isActive");

-- CreateTable: payment_orders
CREATE TABLE "payment_orders" (
    "id" TEXT NOT NULL,
    "orderNo" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "gateway" TEXT NOT NULL DEFAULT 'wechat_pay',
    "gatewayOrderId" TEXT,
    "tradeType" TEXT,
    "gatewayPaidId" TEXT,
    "description" TEXT,
    "paidAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_orders_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "payment_orders_orderNo_key" ON "payment_orders"("orderNo");
CREATE INDEX "payment_orders_userId_idx" ON "payment_orders"("userId");
CREATE INDEX "payment_orders_status_idx" ON "payment_orders"("status");
CREATE INDEX "payment_orders_createdAt_idx" ON "payment_orders"("createdAt");
CREATE INDEX "payment_orders_userId_status_createdAt_idx" ON "payment_orders"("userId", "status", "createdAt");

-- CreateTable: user_memberships
CREATE TABLE "user_memberships" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tier" "MembershipTier" NOT NULL DEFAULT 'FREE',
    "expiresAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_memberships_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "user_memberships_userId_key" ON "user_memberships"("userId");

-- AddForeignKey: payment_orders_userId_fkey
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: payment_orders_planId_fkey
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_planId_fkey" FOREIGN KEY ("planId") REFERENCES "membership_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: user_memberships_userId_fkey
ALTER TABLE "user_memberships" ADD CONSTRAINT "user_memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;