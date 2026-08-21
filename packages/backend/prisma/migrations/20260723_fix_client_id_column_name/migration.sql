-- Fix column name: client_id -> "clientId" for Prisma v7 compatibility
-- (previous migration used snake_case, Prisma v7 expects camelCase)
ALTER TABLE "refresh_tokens" RENAME COLUMN "client_id" TO "clientId";
