-- ADR-0043: 转换频率限制（窗口化）替代每日转换配额
-- Schema 无变更（configs/registry/runtime 均为表内数据），纯数据迁移：
--   1. config_key_registry: 删除旧键 quota.daily_conversion_count，插入
--      quota.conversion_window_count（默认 10）与 quota.conversion_window_hours（默认 2）
--   2. vip_tiers.configs: 旧 daily_conversion_count 值迁移为窗口次数（值语义改为
--      "每窗口次数"，运营可在支付管理调整），补窗口小时（缺省 2；已有值保留）
--   3. runtime_configs: 插入游客限制键 conversionGuestLimit（默认 5）与
--      conversionGuestWindowHours（默认 2）（运行时配置启动自愈之前即可生效）
-- 全部幂等，migrate deploy 可安全重复执行。

-- 1. ConfigKeyRegistry：删旧键、插新键
DELETE FROM "config_key_registry" WHERE "key" = 'quota.daily_conversion_count';

INSERT INTO "config_key_registry"
  ("id", "key", "type", "label", "defaultValue", "description", "sortOrder", "createdAt", "updatedAt")
VALUES
  ('ckr_conversion_window_count', 'quota.conversion_window_count', 'number', '每窗口转换次数', to_jsonb(10),
   '每窗口内图纸格式转换次数上限（PDF/DXF/DWG 统一计数）', 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ckr_conversion_window_hours', 'quota.conversion_window_hours', 'number', '转换窗口(小时)', to_jsonb(2),
   '转换频率限制窗口小时数', 3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

-- 2. VipTier configs 迁移：daily_conversion_count → conversion_window_count（保留原值作为窗口次数），
--    并确保 conversion_window_hours 存在（缺省 2 小时；已配置则保留）
UPDATE "vip_tiers"
SET "configs" = jsonb_set(
      jsonb_set(
        "configs" - 'quota.daily_conversion_count',
        '{quota.conversion_window_count}',
        to_jsonb(("configs" ->> 'quota.daily_conversion_count')::int),
        true
      ),
      '{quota.conversion_window_hours}',
      CASE
        WHEN "configs" ? 'quota.conversion_window_hours'
          THEN to_jsonb(("configs" ->> 'quota.conversion_window_hours')::int)
        ELSE '2'
      END,
      true
    ),
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "configs" ? 'quota.daily_conversion_count';

-- 3. RuntimeConfigs：游客转换频率限制（幂等插入）
INSERT INTO "runtime_configs"
  ("id", "key", "value", "type", "category", "description", "isPublic", "createdAt", "updatedAt")
VALUES
  ('rcfg_conversion_guest_window_hours', 'conversionGuestWindowHours', '2', 'number', 'quota', '游客图纸转换频率限制窗口（小时）', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('rcfg_conversion_guest_limit', 'conversionGuestLimit', '5', 'number', 'quota', '游客每窗口内最多图纸转换次数', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
