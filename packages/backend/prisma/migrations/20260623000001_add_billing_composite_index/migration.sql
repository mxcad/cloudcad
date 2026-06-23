-- Add composite index for billing orders (status + createdAt)
-- Supports efficient queries: "find orders with status X ordered by creation time"
-- Used by: billing.service → findPendingOrder, listOrders (admin), listMyOrders (user)
CREATE INDEX "payment_orders_status_createdAt_idx" ON "payment_orders"("status", "createdAt");
