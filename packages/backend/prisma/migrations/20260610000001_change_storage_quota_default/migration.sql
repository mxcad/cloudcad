-- Change storageQuota default from 0 to -1
-- -1 means "use system default" (RuntimeConfig), unambiguous vs 0 which could mean "unlimited"
ALTER TABLE "file_system_nodes" ALTER COLUMN "storageQuota" SET DEFAULT -1;

-- Existing 0 values remain semantically correct (treated as "use default" by service code),
-- no data migration needed for existing rows.
