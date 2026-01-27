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
  FILE_READ = 'file:read', // 查看文件列表和预览
  FILE_WRITE = 'file:write', // 打开 CAD 编辑器（不包含保存）
  FILE_DELETE = 'file:delete',
  FILE_SHARE = 'file:share',
  FILE_DOWNLOAD = 'file:download',
  FILE_COMMENT = 'file:comment', // 批注权限
  FILE_PRINT = 'file:print', // 打印权限
  FILE_COMPARE = 'file:compare', // 图纸比对权限

  // CAD 图纸权限
  CAD_SAVE = 'cad:save', // 保存图纸（DWG/MXWEB）
  CAD_EXPORT = 'cad:export', // 导出图纸（PDF/DXF）
  CAD_EXTERNAL_REFERENCE = 'cad:external_reference', // 管理外部参照

  // 图库权限
  GALLERY_USE = 'gallery:use', // 使用图库（图纸库+图块库）

  // 版本管理权限
  VERSION_READ = 'version:read',
  VERSION_CREATE = 'version:create',
  VERSION_DELETE = 'version:delete',
  VERSION_RESTORE = 'version:restore',

  // 字体管理权限
  FONT_MANAGE = 'font:manage',

  // 审图配置权限
  REVIEW_CONFIG = 'review:config',

  // 回收站权限
  TRASH_MANAGE = 'trash:manage',

  // 系统权限
  SYSTEM_ADMIN = 'system:admin',
  SYSTEM_MONITOR = 'system:monitor',
}

export enum UserRole {
  ADMIN = 'ADMIN',
  USER = 'USER',
}

/**
 * 角色类别
 */
export enum RoleCategory {
  SYSTEM = 'SYSTEM', // 系统角色（ADMIN, USER）
  PROJECT = 'PROJECT', // 项目角色（PROJECT_OWNER, PROJECT_ADMIN, PROJECT_MEMBER, PROJECT_EDITOR, PROJECT_VIEWER）
  CUSTOM = 'CUSTOM', // 自定义角色
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
    // 项目权限
    Permission.PROJECT_READ,
    Permission.PROJECT_WRITE,
    Permission.PROJECT_DELETE,
    Permission.PROJECT_ADMIN,
    Permission.PROJECT_MEMBER_MANAGE,

    // 文件权限
    Permission.FILE_CREATE,
    Permission.FILE_READ,
    Permission.FILE_WRITE,
    Permission.FILE_DELETE,
    Permission.FILE_SHARE,
    Permission.FILE_DOWNLOAD,
    Permission.FILE_COMMENT,
    Permission.FILE_PRINT,
    Permission.FILE_COMPARE,

    // CAD 权限
    Permission.CAD_SAVE,
    Permission.CAD_EXPORT,
    Permission.CAD_EXTERNAL_REFERENCE,
    Permission.GALLERY_USE,

    // 版本管理
    Permission.VERSION_READ,
    Permission.VERSION_CREATE,
    Permission.VERSION_DELETE,
    Permission.VERSION_RESTORE,

    // 系统权限
    Permission.FONT_MANAGE,
    Permission.REVIEW_CONFIG,
    Permission.TRASH_MANAGE,
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
    Permission.FILE_COMMENT,
    Permission.FILE_PRINT,
    Permission.FILE_COMPARE,
    Permission.CAD_SAVE,
    Permission.CAD_EXPORT,
    Permission.CAD_EXTERNAL_REFERENCE,
    Permission.GALLERY_USE,
    Permission.VERSION_READ,
    Permission.VERSION_CREATE,
    Permission.VERSION_DELETE,
    Permission.VERSION_RESTORE,
    Permission.FONT_MANAGE,
    Permission.REVIEW_CONFIG,
    Permission.TRASH_MANAGE,
  ],
  [NodeAccessRole.MEMBER]: [
    Permission.PROJECT_READ,
    Permission.FILE_CREATE,
    Permission.FILE_READ,
    Permission.FILE_WRITE,
    Permission.FILE_SHARE,
    Permission.FILE_DOWNLOAD,
    Permission.FILE_COMMENT,
    Permission.FILE_PRINT,
    Permission.FILE_COMPARE,
    Permission.CAD_SAVE,
    Permission.CAD_EXPORT,
    Permission.CAD_EXTERNAL_REFERENCE,
    Permission.GALLERY_USE,
    Permission.VERSION_READ,
    Permission.VERSION_CREATE,
  ],
  [NodeAccessRole.EDITOR]: [
    Permission.FILE_READ,
    Permission.FILE_WRITE,
    Permission.FILE_SHARE,
    Permission.FILE_DOWNLOAD,
    Permission.FILE_COMMENT,
    Permission.FILE_PRINT,
    Permission.FILE_COMPARE,
    Permission.CAD_SAVE,
    Permission.CAD_EXPORT,
    Permission.CAD_EXTERNAL_REFERENCE,
    Permission.GALLERY_USE,
    Permission.VERSION_READ,
  ],
  [NodeAccessRole.VIEWER]: [
    Permission.FILE_READ,
    Permission.FILE_DOWNLOAD,
    Permission.FILE_COMMENT,
  ],
};
