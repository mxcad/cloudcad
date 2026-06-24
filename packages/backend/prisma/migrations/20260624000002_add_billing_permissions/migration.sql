-- AlterEnum: add SYSTEM_BILLING_READ and SYSTEM_BILLING_WRITE
ALTER TYPE "Permission" ADD VALUE IF NOT EXISTS 'SYSTEM_BILLING_READ';
ALTER TYPE "Permission" ADD VALUE IF NOT EXISTS 'SYSTEM_BILLING_WRITE';

-- Assign billing permissions to ADMIN role (idempotent)
INSERT INTO "role_permissions" ("id", "roleId", "permission", "createdAt")
SELECT 'rp_' || substr(md5(random()::text || clock_timestamp()::text), 1, 22), r.id, 'SYSTEM_BILLING_READ', NOW()
FROM "roles" r
WHERE r.name = 'ADMIN'
  AND NOT EXISTS (
    SELECT 1 FROM "role_permissions" rp WHERE rp."roleId" = r.id AND rp."permission" = 'SYSTEM_BILLING_READ'
  );

INSERT INTO "role_permissions" ("id", "roleId", "permission", "createdAt")
SELECT 'rp_' || substr(md5(random()::text || clock_timestamp()::text), 1, 22), r.id, 'SYSTEM_BILLING_WRITE', NOW()
FROM "roles" r
WHERE r.name = 'ADMIN'
  AND NOT EXISTS (
    SELECT 1 FROM "role_permissions" rp WHERE rp."roleId" = r.id AND rp."permission" = 'SYSTEM_BILLING_WRITE'
  );
