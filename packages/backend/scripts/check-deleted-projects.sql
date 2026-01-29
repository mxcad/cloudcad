-- 查询所有项目
SELECT id, name, owner_id, deleted_at, project_status
FROM "FileSystemNode"
WHERE is_root = true;

-- 查询已删除的项目
SELECT id, name, owner_id, deleted_at, project_status
FROM "FileSystemNode"
WHERE is_root = true AND deleted_at IS NOT NULL;

-- 查询项目成员
SELECT project_id, user_id, role_id
FROM "ProjectMember";