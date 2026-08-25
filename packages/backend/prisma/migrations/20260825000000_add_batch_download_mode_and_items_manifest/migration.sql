-- 逐个下载任务化（individual 模式）：单文件直出
-- mode: zip=打包 ZIP（默认，存量行为不变）；individual=逐个下载，产物单文件直出
-- itemsManifest: individual 模式产物清单 Array<{ index, name, sourcePath, temp }>
ALTER TABLE "batch_download_jobs" ADD COLUMN "mode" TEXT NOT NULL DEFAULT 'zip';
ALTER TABLE "batch_download_jobs" ADD COLUMN "itemsManifest" JSONB;
