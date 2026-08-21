-- AlterTable: add refundReason to payment_orders
ALTER TABLE "payment_orders" ADD COLUMN "refund_reason" TEXT;
