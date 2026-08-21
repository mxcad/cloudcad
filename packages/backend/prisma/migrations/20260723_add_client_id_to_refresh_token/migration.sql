-- AlterTable: add clientId for per-client token family isolation
ALTER TABLE "refresh_tokens" ADD COLUMN "client_id" TEXT;
