-- 添加角色层级继承字段
-- Migration: 20260210_add_role_inheritance
-- Description: 为 Role 表添加角色层级继承支持（parentId, level）

-- 1. 添加 parentId 字段
ALTER TABLE "roles" ADD COLUMN "parentId" TEXT;

-- 2. 添加外键约束
ALTER TABLE "roles" ADD CONSTRAINT "roles_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 3. 添加唯一约束（允许同名角色存在于不同层级）
ALTER TABLE "roles" DROP CONSTRAINT IF EXISTS "roles_name_key";
ALTER TABLE "roles" ADD CONSTRAINT "roles_name_parentId_key" UNIQUE ("name", "parentId");

-- 4. 添加索引
CREATE INDEX "roles_parentId_idx" ON "roles"("parentId");
CREATE INDEX "roles_level_idx" ON "roles"("level");

-- 5. 初始化系统角色层级关系
-- 根据定义的层级关系：
-- - ADMIN: 顶级角色 (level = 0, parentId = NULL)
-- - USER_MANAGER: 继承自 USER (level = 1, parentId = USER.id)
-- - FONT_MANAGER: 继承自 USER (level = 1, parentId = USER.id)
-- - USER: 基础角色 (level = 0, parentId = NULL)

-- 更新 USER 的 level 为 0
UPDATE "roles" SET "level" = 0 WHERE "name" = 'USER';

-- 更新 ADMIN 的 level 为 0
UPDATE "roles" SET "level" = 0 WHERE "name" = 'ADMIN';

-- 设置 USER_MANAGER 继承自 USER
UPDATE "roles"
SET "parentId" = (SELECT id FROM "roles" WHERE "name" = 'USER' LIMIT 1),
    "level" = 1
WHERE "name" = 'USER_MANAGER';

-- 设置 FONT_MANAGER 继承自 USER
UPDATE "roles"
SET "parentId" = (SELECT id FROM "roles" WHERE "name" = 'USER' LIMIT 1),
    "level" = 1
WHERE "name" = 'FONT_MANAGER';

-- 6. 添加注释
COMMENT ON COLUMN "roles"."parentId" IS '父角色ID，用于角色层级继承';
COMMENT ON COLUMN "roles"."level" IS '角色层级深度，0表示顶级角色';