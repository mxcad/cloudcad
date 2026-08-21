-- 退款链路审计动作（资金敏感）：申请 / 审核通过 / 审核驳回
-- 与 backend/src/common/enums/audit.enum.ts 的 AuditAction 同步追加
ALTER TYPE "AuditAction" ADD VALUE 'REFUND_APPLY';
ALTER TYPE "AuditAction" ADD VALUE 'REFUND_APPROVE';
ALTER TYPE "AuditAction" ADD VALUE 'REFUND_REJECT';

-- RefundApplication.reviewer 关系（审核人，管理端列表展示；审核人删除后置空保留申请记录）
ALTER TABLE "refund_applications" ADD CONSTRAINT "refund_applications_reviewerId_fkey"
  FOREIGN KEY ("reviewerId") REFERENCES "users"("id") ON UPDATE CASCADE ON DELETE SET NULL;

CREATE INDEX "refund_applications_reviewerId_idx" ON "refund_applications"("reviewerId");
