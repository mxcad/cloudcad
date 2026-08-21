-- 私人空间（"我的图纸"）零成员、零角色（ADR-00XX）：
-- 私人空间是账号个人空间，权限按 ownerId 判断（PersonalPermissionStrategy /
-- RequireProjectPermissionGuard），不依赖项目成员行与项目角色。
-- 清理此前迁移复制/重挂产生的冗余数据：
--   1. 先删 PERSONAL_SPACE 的成员行（其 projectRoleId 引用角色，FK Restrict 需先删成员）
--   2. 再删 PERSONAL_SPACE 的副本角色（权限关联随 projectRoleId 级联删除）
-- 项目（PROJECT）的副本角色与成员不受影响。
DELETE FROM project_members pm
WHERE EXISTS (
  SELECT 1 FROM file_system_nodes n
  WHERE n.id = pm."projectId" AND n."nodeType" = 'PERSONAL_SPACE'
);

DELETE FROM project_roles pr
WHERE EXISTS (
  SELECT 1 FROM file_system_nodes n
  WHERE n.id = pr."projectId" AND n."nodeType" = 'PERSONAL_SPACE'
);
