-- AlterTable: storage_quota Int → Float 以支持小数 GB（如 10.5 GB）
ALTER TABLE "file_system_nodes" ALTER COLUMN "storageQuota" SET DATA TYPE DOUBLE PRECISION;
