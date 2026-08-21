-- AlterEnum
ALTER TYPE "Permission" ADD VALUE 'SYSTEM_USER_MEMBERSHIP_MANAGE';

-- DropIndex
DROP INDEX "idx_file_system_nodes_description_trgm";

-- DropIndex
DROP INDEX "idx_file_system_nodes_name_trgm";

-- DropIndex
DROP INDEX "idx_file_system_nodes_search_vector";
