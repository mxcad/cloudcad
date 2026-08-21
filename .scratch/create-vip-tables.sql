CREATE TABLE IF NOT EXISTS "vip_tiers" (
    "id" TEXT PRIMARY KEY,
    "level" INTEGER NOT NULL UNIQUE,
    "name" TEXT NOT NULL,
    "baseMonthlyPrice" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "configs" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE TABLE IF NOT EXISTS "duration_pricings" (
    "id" TEXT PRIMARY KEY,
    "months" INTEGER NOT NULL UNIQUE,
    "multiplierBps" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "config_key_registry" (
    "id" TEXT PRIMARY KEY,
    "key" TEXT NOT NULL UNIQUE,
    "type" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "defaultValue" JSONB,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL
);
