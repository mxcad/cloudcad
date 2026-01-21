export enum Permission {
  // 用户权限
  USER_READ = 'user:read',
  USER_WRITE = 'user:write',
  USER_DELETE = 'user:delete',
  USER_ADMIN = 'user:admin',

  // 项目权限
  PROJECT_CREATE = 'project:create',
  PROJECT_READ = 'project:read',
  PROJECT_WRITE = 'project:write',
  PROJECT_DELETE = 'project:delete',
  PROJECT_ADMIN = 'project:admin',
  PROJECT_MEMBER_MANAGE = 'project:member:manage',

  // 文件权限
  FILE_CREATE = 'file:create',
  FILE_READ = 'file:read',
  FILE_WRITE = 'file:write',
  FILE_DELETE = 'file:delete',
  FILE_SHARE = 'file:share',
  FILE_DOWNLOAD = 'file:download',

  // 系统权限
  SYSTEM_ADMIN = 'system:admin',
  SYSTEM_MONITOR = 'system:monitor',
}

export enum UserRole {
  ADMIN = 'ADMIN',
  USER = 'USER',
}

/**
 * 统一的节点访问角色
 * 用于 FileSystemNode（项目、文件夹、文件）的权限控制
 */
export enum NodeAccessRole {
  OWNER = 'OWNER', // 所有者：完全控制
  ADMIN = 'ADMIN', // 管理员：管理权限
  MEMBER = 'MEMBER', // 成员：可编辑
  EDITOR = 'EDITOR', // 编辑者：可编辑文件
  VIEWER = 'VIEWER', // 查看者：只读
}

/**
 * FileAccessRole - 保留用于向后兼容
 * @deprecated 使用 NodeAccessRole 代替
 */
export const FileAccessRole = NodeAccessRole;
export type FileAccessRole = NodeAccessRole;

/**
 * ProjectMemberRole - 保留用于向后兼容
 * @deprecated 使用 NodeAccessRole 代替
 */
export const ProjectMemberRole = NodeAccessRole;
export type ProjectMemberRole = NodeAccessRole;

// 权限映射表
export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  [UserRole.ADMIN]: [
    // 管理员拥有所有权限
    Permission.USER_READ,
    Permission.USER_WRITE,
    Permission.USER_DELETE,
    Permission.USER_ADMIN,
    Permission.PROJECT_CREATE,
    Permission.PROJECT_READ,
    Permission.PROJECT_WRITE,
    Permission.PROJECT_DELETE,
    Permission.PROJECT_ADMIN,
    Permission.PROJECT_MEMBER_MANAGE,
    Permission.FILE_CREATE,
    Permission.FILE_READ,
    Permission.FILE_WRITE,
    Permission.FILE_DELETE,
    Permission.FILE_SHARE,
    Permission.FILE_DOWNLOAD,
    Permission.SYSTEM_ADMIN,
    Permission.SYSTEM_MONITOR,
  ],
  [UserRole.USER]: [
    // 普通用户基础权限
    Permission.PROJECT_CREATE,
    Permission.PROJECT_READ,
    Permission.FILE_CREATE,
    Permission.FILE_READ,
    Permission.FILE_WRITE,
    Permission.FILE_SHARE,
    Permission.FILE_DOWNLOAD,
  ],
};

// 节点访问权限映射
export const NODE_ACCESS_PERMISSIONS: Record<NodeAccessRole, Permission[]> = {
  [NodeAccessRole.OWNER]: [
    Permission.PROJECT_READ,
    Permission.PROJECT_WRITE,
    Permission.PROJECT_DELETE,
    Permission.PROJECT_ADMIN,
    Permission.PROJECT_MEMBER_MANAGE,
    Permission.FILE_CREATE,
    Permission.FILE_READ,
    Permission.FILE_WRITE,
    Permission.FILE_DELETE,
    Permission.FILE_SHARE,
    Permission.FILE_DOWNLOAD,
  ],
  [NodeAccessRole.ADMIN]: [
    Permission.PROJECT_READ,
    Permission.PROJECT_WRITE,
    Permission.PROJECT_MEMBER_MANAGE,
    Permission.FILE_CREATE,
    Permission.FILE_READ,
    Permission.FILE_WRITE,
    Permission.FILE_DELETE,
    Permission.FILE_SHARE,
    Permission.FILE_DOWNLOAD,
  ],
  [NodeAccessRole.MEMBER]: [
    Permission.PROJECT_READ,
    Permission.FILE_CREATE,
    Permission.FILE_READ,
    Permission.FILE_WRITE,
    Permission.FILE_SHARE,
    Permission.FILE_DOWNLOAD,
  ],
  [NodeAccessRole.EDITOR]: [
    Permission.FILE_READ,
    Permission.FILE_WRITE,
    Permission.FILE_SHARE,
    Permission.FILE_DOWNLOAD,
  ],
  [NodeAccessRole.VIEWER]: [Permission.FILE_READ, Permission.FILE_DOWNLOAD],
};
