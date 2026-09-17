-- #416 口令策略强化（等保 8.1.4.1）：User 表新增 passwordChangedAt 字段
-- 全员维护（注册/改密/重置时写入）；仅 ADMIN 角色据此做 180 天到期强制改密 + 首登未改密判定
-- 存量用户回填 now()（获得全新 180 天窗口，不批量锁老账号）；
-- null 仅用于初始管理员"首登未改密"标记（initialization.service 创建时不写该字段）

-- AlterTable
ALTER TABLE "users" ADD COLUMN "passwordChangedAt" TIMESTAMP(3);

-- 存量用户回填：所有存量账号获得全新 180 天窗口
UPDATE "users" SET "passwordChangedAt" = now() WHERE "passwordChangedAt" IS NULL;
