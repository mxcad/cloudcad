-- 项目角色模板化：存量项目复制模板 + 成员重挂（ADR-00XX 方案 B）
-- 背景：isSystem=true 且 projectId 为空的 ProjectRole 是"全局共享模板"，
--       所有项目共享同一批角色实例，项目内只读、改模板权限影响所有项目。
-- 决策：改为"项目创建时把模板复制为项目自己的角色"，项目内角色完全自治，
--       模板只影响新建项目（旧项目不跟随模板变更）。
-- 本迁移（仅数据，schema 无列级变更）：
--   1. 为所有存量项目节点（PROJECT / PERSONAL_SPACE，含软删，成员可能仍引用模板）
--      复制当前模板角色为项目副本（isSystem=true 保留"默认角色"标记）
--   2. 复制模板权限关联到副本
--   3. 把成员对全局模板角色的引用重挂到本项目副本（按 name 匹配）
-- 副本 id 用 'pr_' || md5(模板id || 项目id) 派生，同一迁移内权限复制/成员重挂
-- 可稳定引用同一 id；@@unique([projectId,name]) / @@unique([projectRoleId,permission])
-- 天然防重。迁移仅执行一次（prisma_migrations 记录），无幂等要求。

-- 1. 复制模板角色 → 项目副本
INSERT INTO project_roles (id, "projectId", name, description, "isSystem", "createdAt", "updatedAt")
SELECT 'pr_' || md5(t.id || n.id),
       n.id,
       t.name,
       t.description,
       true,
       now(),
       now()
FROM project_roles t
CROSS JOIN file_system_nodes n
WHERE t."projectId" IS NULL
  AND t."isSystem" = true
  AND n."nodeType" IN ('PROJECT', 'PERSONAL_SPACE')
  AND NOT EXISTS (
    -- 防御：项目已有同名角色（自定义角色或重复执行残留）则跳过
    SELECT 1 FROM project_roles existing
    WHERE existing."projectId" = n.id AND existing.name = t.name
  );

-- 2. 复制权限关联（模板权限 → 项目副本）。
--    仅复制到实际存在的副本（EXISTS 派生 id）：与步骤 1 的"同名跳过"防御一致，
--    项目已有同名自定义角色时副本不存在，不复制也不产生 FK 悬挂。
INSERT INTO project_role_permissions (id, "projectRoleId", permission, "createdAt")
SELECT 'prp_' || md5(t.id || n.id || tp.permission),
       'pr_' || md5(t.id || n.id),
       tp.permission,
       now()
FROM project_role_permissions tp
JOIN project_roles t ON t.id = tp."projectRoleId"
  AND t."projectId" IS NULL
  AND t."isSystem" = true
CROSS JOIN file_system_nodes n
WHERE n."nodeType" IN ('PROJECT', 'PERSONAL_SPACE')
  AND EXISTS (
    SELECT 1 FROM project_roles copy
    WHERE copy.id = 'pr_' || md5(t.id || n.id)
  );

-- 3. 成员重挂：原引用全局模板角色的成员 → 本项目副本（按 name 派生同一 id）。
--    副本不存在（同名跳过场景）时保持原引用（模板角色仍可读权限，删除模板时
--    由 FK Restrict + 业务校验拦截），不产生 FK 悬挂。
UPDATE project_members pm
SET "projectRoleId" = 'pr_' || md5(t.id || pm."projectId")
FROM project_roles t
WHERE t.id = pm."projectRoleId"
  AND t."projectId" IS NULL
  AND t."isSystem" = true
  AND EXISTS (
    SELECT 1 FROM project_roles copy
    WHERE copy.id = 'pr_' || md5(t.id || pm."projectId")
  );
