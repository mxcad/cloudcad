-- AlterTable: add refundReason to payment_orders
ALTER TABLE "payment_orders" ADD COLUMN "refundReason" TEXT;
