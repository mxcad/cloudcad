-- 防止同一用户对同一套餐在 PENDING 状态并发重复下单
CREATE UNIQUE INDEX "payment_orders_pending_unique_idx"
  ON "payment_orders" ("userId", "vipTierId", "months", "gateway")
  WHERE "status" = 'PENDING';
