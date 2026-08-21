-- 转 bin（覆盖保存）频率限制配额：新增 quota.save_window_count（每窗口保存次数）。
-- 窗口小时数复用 quota.conversion_window_hours（改一处窗口，两套次数同步生效）。
-- Schema 无变更（configs/registry 均为表内数据），纯数据迁移，幂等可重复执行。
-- 默认档位：VIP0=300 / VIP1=500 / VIP2=2000 / VIP3=5000（运营可在支付管理/管理后台调整）。

-- 1. ConfigKeyRegistry：插入保存窗口次数键（幂等）
INSERT INTO "config_key_registry"
  ("id", "key", "type", "label", "defaultValue", "description", "sortOrder", "createdAt", "updatedAt")
VALUES
  ('ckr_save_window_count', 'quota.save_window_count', 'number', '每窗口保存次数', to_jsonb(300),
   '每窗口内图纸覆盖保存（转 bin）次数上限，窗口小时数复用转换窗口', 4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

-- 2. VipTier configs：为各档位补 save_window_count（已有值保留，缺失才填充档位默认值）
UPDATE "vip_tiers"
SET "configs" = jsonb_set(
      "configs",
      '{quota.save_window_count}',
      CASE "level"
        WHEN 0 THEN '300'
        WHEN 1 THEN '500'
        WHEN 2 THEN '2000'
        WHEN 3 THEN '5000'
        ELSE '300'
      END::jsonb,
      true
    ),
    "updatedAt" = CURRENT_TIMESTAMP
WHERE NOT ("configs" ? 'quota.save_window_count')
   OR ("configs" ->> 'quota.save_window_count') IS NULL;
