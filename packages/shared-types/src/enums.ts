/**
 * 枚举类型定义
 */

// ==================== 用户相关枚举 ====================

/** 用户角色 */
export enum UserRole {
  ADMIN = 'ADMIN',
  USER = 'USER',
}

/** 用户状态 */
export enum UserStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  SUSPENDED = 'SUSPENDED',
}

// ==================== 权限相关枚举 ====================

/** 系统权限 */
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

// ==================== 项目相关枚举 ====================

/** 项目状态 */
export enum ProjectStatus {
  ACTIVE = 'ACTIVE',
  ARCHIVED = 'ARCHIVED',
  DELETED = 'DELETED',
}

/** 项目成员角色 */
export enum ProjectMemberRole {
  OWNER = 'OWNER',
  ADMIN = 'ADMIN',
  MEMBER = 'MEMBER',
  VIEWER = 'VIEWER',
}

// ==================== 文件相关枚举 ====================

/** 文件状态 */
export enum FileStatus {
  UPLOADING = 'UPLOADING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  DELETED = 'DELETED',
}

/** 文件访问权限 */
export enum FileAccessRole {
  OWNER = 'OWNER',
  EDITOR = 'EDITOR',
  VIEWER = 'VIEWER',
}

/** 文件类型 */
export enum FileType {
  FOLDER = 'folder',
  IMAGE = 'image',
  CAD = 'cad',
  FONT = 'font',
  BLOCK = 'block',
  PDF = 'pdf',
}

// ==================== 资源库相关枚举 ====================

/** 资源状态 */
export enum AssetStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  DELETED = 'DELETED',
}

/** 字体状态 */
export enum FontStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  DELETED = 'DELETED',
}

/** 资源库类型 */
export enum LibraryType {
  BLOCK = 'block',
  FONT = 'font',
}

// ==================== 权限映射表 ====================

/** 角色权限映射 */
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

/** 项目成员权限映射 */
export const PROJECT_MEMBER_PERMISSIONS: Record<
  ProjectMemberRole,
  Permission[]
> = {
  [ProjectMemberRole.OWNER]: [
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
  [ProjectMemberRole.ADMIN]: [
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
  [ProjectMemberRole.MEMBER]: [
    Permission.PROJECT_READ,
    Permission.FILE_CREATE,
    Permission.FILE_READ,
    Permission.FILE_WRITE,
    Permission.FILE_SHARE,
    Permission.FILE_DOWNLOAD,
  ],
  [ProjectMemberRole.VIEWER]: [
    Permission.PROJECT_READ,
    Permission.FILE_READ,
    Permission.FILE_DOWNLOAD,
  ],
};

/** 文件访问权限映射 */
export const FILE_ACCESS_PERMISSIONS: Record<FileAccessRole, Permission[]> = {
  [FileAccessRole.OWNER]: [
    Permission.FILE_READ,
    Permission.FILE_WRITE,
    Permission.FILE_DELETE,
    Permission.FILE_SHARE,
    Permission.FILE_DOWNLOAD,
  ],
  [FileAccessRole.EDITOR]: [
    Permission.FILE_READ,
    Permission.FILE_WRITE,
    Permission.FILE_SHARE,
    Permission.FILE_DOWNLOAD,
  ],
  [FileAccessRole.VIEWER]: [Permission.FILE_READ, Permission.FILE_DOWNLOAD],
};