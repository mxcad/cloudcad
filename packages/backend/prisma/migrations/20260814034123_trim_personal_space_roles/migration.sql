-- 私人空间（"我的图纸"）只有 owner 一个成员，无需项目协作角色：
-- 删除此前 project_role_templates_copy 复制到 PERSONAL_SPACE 的非 OWNER 模板副本。
-- 仅删除未被成员引用的副本（防御；私人空间成员理论上只有 owner 且挂在 OWNER 副本上，
-- 权限关联随 projectRoleId 级联删除）。项目（PROJECT）副本不受影响。
DELETE FROM project_roles pr
WHERE pr.id LIKE 'pr_%'
  AND pr.name <> 'PROJECT_OWNER'
  AND EXISTS (
    SELECT 1 FROM file_system_nodes n
    WHERE n.id = pr."projectId" AND n."nodeType" = 'PERSONAL_SPACE'
  )
  AND NOT EXISTS (
    SELECT 1 FROM project_members pm WHERE pm."projectRoleId" = pr.id
  );
