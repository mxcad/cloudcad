-- 放宽面向用户的出厂默认值（2026-11-03）：
--   conversionGuestLimit  5   → 50  游客每 2 小时窗口转换次数（5 次过紧，正常试用即触顶）
--   maxFileSize           100 → 500 图纸上传大小上限 (MB)（大图纸/复杂装配被拒）
--   extRefMaxFileSize     100 → 500 外部参照上传大小上限 (MB)（被引用图纸被拒）
--
-- 代码侧默认值已同步改在 @cloudcad/contracts 的 RUNTIME_CONFIG_DEFAULTS
-- （conversionGuestLimit / maxFileSize）与 backend runtime-config.constants.ts
-- （extRefMaxFileSize）；本迁移负责**存量部署**的 DB 默认行——syncDefaultConfigs
-- 只补新键、不回填已有行的 value，故存量行仍停在旧值，须由本迁移刷到与新默认一致。
-- 新装部署由 syncDefaultConfigs 直接按新默认建行，本迁移对其为 no-op。
--
-- 守卫 `updatedBy IS NULL`：只刷「安装默认行」。运维在运行时配置页显式改过的值
-- （updatedBy 非空）优先级更高（resolveValue 三层：runtime > env > default），不被覆盖。
-- `value <> 新值` 守卫保证幂等：重复执行不重复写、不空刷 updatedAt。

UPDATE "runtime_configs"
SET "value" = '50'
WHERE "key" = 'conversionGuestLimit'
  AND "updatedBy" IS NULL
  AND "value" <> '50';

UPDATE "runtime_configs"
SET "value" = '500'
WHERE "key" = 'maxFileSize'
  AND "updatedBy" IS NULL
  AND "value" <> '500';

UPDATE "runtime_configs"
SET "value" = '500'
WHERE "key" = 'extRefMaxFileSize'
  AND "updatedBy" IS NULL
  AND "value" <> '500';

-- 免费档（VIP0）转换配额对齐游客上限：quota.conversion_window_count 10 → 100
-- 原则：已注册用户应比未登录游客（conversionGuestLimit=50）更宽，注册不该比匿名还吃亏。
-- 代码侧出厂默认已同步改在 prisma/seed.ts（新装部署按 100 建行）；本段负责**存量部署**
-- 的 VIP0 行——seed 的「已有等级不覆盖」策略不会回填，须由本迁移刷到 100。
-- 守卫 `configs->>'quota.conversion_window_count' = 10`：仅当该键仍为出厂默认 10 时更新，
-- 运维在付费管理页改过的值（非 10）不被覆盖；已是 100 的行不重复写（幂等）。
UPDATE "vip_tiers"
SET "configs" = jsonb_set("configs", '{quota.conversion_window_count}', to_jsonb(100::int))
WHERE "name" = 'VIP0'
  AND ("configs" ->> 'quota.conversion_window_count')::int = 10;

-- 会员档（VIP1）与免费档拉开梯度：quota.conversion_window_count 100 → 200
-- 档位须严格递增（游客 50 < 免费 100 < 会员 200 < VIP2 1000 < VIP3 5000），
-- 付费会员不能与免费档同值。守卫 `= 100`：仅刷仍为旧出厂值的行，运维改过的不覆盖。
UPDATE "vip_tiers"
SET "configs" = jsonb_set("configs", '{quota.conversion_window_count}', to_jsonb(200::int))
WHERE "name" = 'VIP1'
  AND ("configs" ->> 'quota.conversion_window_count')::int = 100;

-- 配额键注册表的出厂默认值同步（VIP0 基线 = 注册表默认值，两者须一致）：
-- quota.conversion_window_count 注册表默认 = 100（见 seed.ts defaultValue），
-- 与上方已刷的 VIP0=100 对齐，故此段对标准部署为 no-op。
-- 守卫 `defaultValue = to_jsonb(10)`：仅当仍为更早的出厂值 10 时刷到 100，
-- 运维改过的值不被覆盖；已是 100 的行幂等跳过。
-- 注意：defaultValue 是 jsonb 列，整型须用 to_jsonb() 包裹，不能写 `100::jsonb`
-- （PG 不支持 int→jsonb 直接转型，报 42846）。
UPDATE "config_key_registry"
SET "defaultValue" = to_jsonb(100)
WHERE "key" = 'quota.conversion_window_count'
  AND "defaultValue" = to_jsonb(10);
