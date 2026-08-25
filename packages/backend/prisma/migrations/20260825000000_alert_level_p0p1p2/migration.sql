-- AlertLevel 三档化（#310）：WARNING→P1、CRITICAL→P0，迁移后移除旧枚举值
-- PostgreSQL 不支持删除枚举值（ALTER TYPE ... DROP VALUE），需重建类型并迁移存量数据

-- Step 1: 创建新枚举类型
CREATE TYPE "AlertLevel_new" AS ENUM ('P0', 'P1', 'P2');

-- Step 2: 存量数据映射后切换列类型（WARNING→P1、CRITICAL→P0）
ALTER TABLE "alert_records" ALTER COLUMN "level" DROP DEFAULT;
ALTER TABLE "alert_records" ALTER COLUMN "level" TYPE "AlertLevel_new" USING (
  CASE "level"::text
    WHEN 'CRITICAL' THEN 'P0'
    WHEN 'WARNING' THEN 'P1'
    ELSE 'P2'
  END::"AlertLevel_new"
);

-- Step 3: 删除旧类型并重命名
DROP TYPE "AlertLevel";
ALTER TYPE "AlertLevel_new" RENAME TO "AlertLevel";
