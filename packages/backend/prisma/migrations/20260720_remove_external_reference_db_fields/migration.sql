-- Drop external reference database fields
-- These fields are no longer needed because external reference status
-- is determined at runtime from preloading.json, not stored in the database.

ALTER TABLE "file_system_nodes" DROP COLUMN "hasMissingExternalReferences";
ALTER TABLE "file_system_nodes" DROP COLUMN "missingExternalReferencesCount";
ALTER TABLE "file_system_nodes" DROP COLUMN "externalReferencesJson";
