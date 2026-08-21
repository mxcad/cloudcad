-- 数据库层角色名唯一约束迁移（独立、可手动执行）
--
-- 背景：Role.name 历史上没有唯一约束，seed / 手动操作可能产生多行同名的角色。
--       权限解析使用 findFirst({ where: { name } }) 会随机命中其中一行，
--       导致「普通用户忽而是管理员、管理员忽而是普通用户」的权限漂移。
--       后端已在 initialization.service.ts 的 dedupeSystemRoles() 中做运行时去重，
--       此处再从数据库层面加唯一约束，杜绝重复行复发。
--
-- 执行方式（任选其一，SQL 幂等可重复跑）：
--   1) 生产/干净库： psql "$DATABASE_URL" -f prisma/migrations/20260710000000_add_role_name_unique/migration.sql
--   2) 或随其他迁移： prisma migrate deploy
--
-- 注意：开发库迁移历史被篡改，prisma migrate dev 会要求重置（丢数据），请勿在开发库用 migrate dev 跑本迁移。

-- 1) 先按角色名去重：每个 name 只保留 level 最高的一行，
--    把重复行的权限、用户引用、子角色 parentId 合并到保留行后删除重复行
DO $$
DECLARE
  r RECORD;
  keep_id TEXT;
BEGIN
  FOR r IN
    SELECT "name" FROM "roles" GROUP BY "name" HAVING COUNT(*) > 1
  LOOP
    SELECT "id" INTO keep_id
    FROM "roles" WHERE "name" = r."name"
    ORDER BY "level" DESC, "id" LIMIT 1;

    -- 合并重复行的权限到保留行
    INSERT INTO "role_permissions" ("roleId", "permission")
    SELECT keep_id, rp."permission"
    FROM "role_permissions" rp
    JOIN "roles" d ON d."id" = rp."roleId"
    WHERE d."name" = r."name" AND d."id" <> keep_id
    ON CONFLICT ("roleId", "permission") DO NOTHING;

    -- 迁移用户引用
    UPDATE "users" SET "roleId" = keep_id
    WHERE "roleId" IN (SELECT "id" FROM "roles" WHERE "name" = r."name" AND "id" <> keep_id);

    -- 迁移子角色 parentId
    UPDATE "roles" SET "parentId" = keep_id
    WHERE "parentId" IN (SELECT "id" FROM "roles" WHERE "name" = r."name" AND "id" <> keep_id);

    -- 删除重复行（先清权限关联，再删行本身）
    DELETE FROM "role_permissions"
    WHERE "roleId" IN (SELECT "id" FROM "roles" WHERE "name" = r."name" AND "id" <> keep_id);
    DELETE FROM "roles" WHERE "name" = r."name" AND "id" <> keep_id;
  END LOOP;
END $$;

-- 2) 角色名唯一约束（防复发），幂等可重复执行
CREATE UNIQUE INDEX IF NOT EXISTS "roles_name_unique" ON "roles" ("name");
