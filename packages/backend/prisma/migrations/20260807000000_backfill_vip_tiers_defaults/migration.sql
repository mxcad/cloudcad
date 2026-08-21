-- Backfill default VipTier (VIP0-VIP3) and ConfigKeyRegistry rows.
-- 背景：默认数据此前仅存在于 prisma/seed.ts（pnpm db:seed），生产/离线部署只执行
--       prisma migrate deploy（docker-entrypoint.sh 的 run_migrations 不跑 seed），
--       导致生产 vip_tiers 为空 → 管理页无默认 VIP 等级、也无法创建。
-- 与 20260731000000_backfill_duration_pricing 同模式：幂等 upsert + 确定性 id。
-- 注意：vip_tiers.updatedAt 无 DB 默认值（@updatedAt），INSERT 必须显式提供。

-- 1. 默认 VIP 等级（与 seed.ts seedVipTiers 一致，level 幂等）
INSERT INTO "vip_tiers" ("id", "level", "name", "baseMonthlyPrice", "isActive", "configs", "createdAt", "updatedAt")
VALUES
  ('vip_tier_seed_0', 0, 'VIP0', 0, true,
   '{"quota.personal_storage_mb":50,"quota.conversion_window_count":10,"quota.conversion_window_hours":2,"quota.project_size_mb":100,"quota.max_projects":5}'::jsonb,
   CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('vip_tier_seed_1', 1, 'VIP1', 1500, true,
   '{"quota.personal_storage_mb":200,"quota.conversion_window_count":100,"quota.conversion_window_hours":2,"quota.project_size_mb":500,"quota.max_projects":20}'::jsonb,
   CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('vip_tier_seed_2', 2, 'VIP2', 3000, true,
   '{"quota.personal_storage_mb":500,"quota.conversion_window_count":1000,"quota.conversion_window_hours":2,"quota.project_size_mb":2000,"quota.max_projects":50}'::jsonb,
   CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('vip_tier_seed_3', 3, 'VIP3', 6000, true,
   '{"quota.personal_storage_mb":2000,"quota.conversion_window_count":5000,"quota.conversion_window_hours":2,"quota.project_size_mb":10000,"quota.max_projects":200}'::jsonb,
   CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("level") DO UPDATE SET
  "configs" = EXCLUDED."configs",
  "updatedAt" = CURRENT_TIMESTAMP;

-- 2. 默认配置键注册表（与 seed.ts seedConfigKeyRegistry 一致，key 幂等）
--    注：quota.conversion_window_* 两行可能已由 20260806000000 插入，ON CONFLICT 跳过
INSERT INTO "config_key_registry" ("id", "key", "type", "label", "defaultValue", "description", "sortOrder", "createdAt", "updatedAt")
VALUES
  ('ckr_personal_storage_mb', 'quota.personal_storage_mb', 'number', '个人空间容量(MB)', to_jsonb(50),
   '用户个人私人空间的上限，单位 MB', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ckr_conversion_window_count', 'quota.conversion_window_count', 'number', '每窗口转换次数', to_jsonb(10),
   '每窗口内图纸格式转换次数上限（PDF/DXF/DWG 统一计数）', 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ckr_conversion_window_hours', 'quota.conversion_window_hours', 'number', '转换窗口(小时)', to_jsonb(2),
   '转换频率限制窗口小时数', 3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ckr_project_size_mb', 'quota.project_size_mb', 'number', '项目体积上限(MB)', to_jsonb(100),
   '用户可参与的项目的最大体积，逐项目独立计算', 4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ckr_max_projects', 'quota.max_projects', 'number', '最大创建项目数', to_jsonb(5),
   '用户最多可创建的项目总数', 5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
