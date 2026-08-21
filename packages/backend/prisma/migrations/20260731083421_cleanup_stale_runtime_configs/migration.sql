-- Cleanup: remove stale runtime configs no longer defined in RUNTIME_CONFIG_DEFINITIONS
-- and with no code consumers. Storage quotas are now derived from membership tiers
-- (see 20260728150513_cleanup_membership_plan_and_storage_quota); mockPaymentDelayMs
-- was removed in the billing refactor.

-- 1. Delete stale config rows
DELETE FROM "runtime_configs"
WHERE "key" IN (
    'mockPaymentDelayMs',
    'enforceStorageQuota',
    'libraryStorageQuota',
    'projectStorageQuota',
    'userStorageQuota'
);

-- 2. Fix isPublic drift for allowAutoRegisterOnPhoneLogin
--    Definition sets isPublic=false (backend-only config, not consumed by frontend),
--    but the existing DB row was created while isPublic=true, leaking it via the
--    public config endpoint.
UPDATE "runtime_configs"
SET "isPublic" = false
WHERE "key" = 'allowAutoRegisterOnPhoneLogin'
  AND "isPublic" = true;
