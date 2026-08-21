-- 同一订单同一时刻最多一条待审核退款申请（并发兜底）
-- 业务层 applyRefund 已在事务内 findFirst 查重，此处用部分唯一索引消除 TOCTOU 窗口
-- Prisma schema 无法声明 partial unique index，故以手写 migration 落库
CREATE UNIQUE INDEX "refund_applications_orderId_pending_idx"
  ON "refund_applications"("orderId")
  WHERE "status" = 'PENDING';
