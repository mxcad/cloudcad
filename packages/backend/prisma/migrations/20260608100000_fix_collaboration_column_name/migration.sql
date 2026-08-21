-- 兼容处理：统一列名称为 camelCase，与全库命名规范保持一致
-- 覆盖迁移失败或 db push 导致的列名不一致
DO $$
BEGIN
  -- 情况1：只有 snake_case 列 → 重命名为 camelCase
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cooperate_shares' AND column_name = 'collaboration_enabled'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cooperate_shares' AND column_name = 'collaborationEnabled'
  ) THEN
    ALTER TABLE "cooperate_shares" RENAME COLUMN "collaboration_enabled" TO "collaborationEnabled";
  END IF;

  -- 情况2：两个列都存在（极少见）→ 删除冗余的 snake_case 列
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cooperate_shares' AND column_name = 'collaboration_enabled'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cooperate_shares' AND column_name = 'collaborationEnabled'
  ) THEN
    ALTER TABLE "cooperate_shares" DROP COLUMN "collaboration_enabled";
  END IF;
END;
$$;
