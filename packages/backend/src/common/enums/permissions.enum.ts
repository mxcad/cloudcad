/**
 * 系统权限枚举
 * 用于后台管理功能的权限控制
 */
export enum SystemPermission {
  // ========== 用户管理 ==========
  /** 查看用户列表和用户详情 */
  USER_READ = 'system:user:read',
  /** 创建用户 */
  USER_CREATE = 'system:user:create',
  /** 编辑用户信息 */
  USER_UPDATE = 'system:user:update',
  /** 删除用户 */
  USER_DELETE = 'system:user:delete',

  // ========== 角色权限管理 ==========
  /** 查看角色列表和角色详情 */
  ROLE_READ = 'system:role:read',
  /** 创建角色 */
  ROLE_CREATE = 'system:role:create',
  /** 编辑角色信息 */
  ROLE_UPDATE = 'system:role:update',
  /** 删除角色 */
  ROLE_DELETE = 'system:role:delete',
  /** 为角色分配系统权限 */
  ROLE_PERMISSION_MANAGE = 'system:role:permission:manage',

  // ========== 字体库管理 ==========
  /** 查看字体库列表和字体详情 */
  FONT_READ = 'system:font:read',
  /** 上传字体 */
  FONT_UPLOAD = 'system:font:upload',
  /** 删除字体 */
  FONT_DELETE = 'system:font:delete',
  /** 下载字体 */
  FONT_DOWNLOAD = 'system:font:download',

  // ========== 系统管理 ==========
  /** 系统管理员：拥有所有系统权限 */
  SYSTEM_ADMIN = 'system:admin',
  /** 系统监控：查看系统状态和日志 */
  SYSTEM_MONITOR = 'system:monitor',
}

/**
 * 项目权限枚举
 * 用于项目和文件系统的权限控制，与系统权限完全解耦
 */
export enum ProjectPermission {
  // ========== 项目管理权限 ==========
  /** 创建项目 */
  PROJECT_CREATE = 'project:project:create',
  /** 访问项目（查看项目信息） */
  PROJECT_READ = 'project:project:read',
  /** 编辑项目信息 */
  PROJECT_UPDATE = 'project:project:update',
  /** 删除项目 */
  PROJECT_DELETE = 'project:project:delete',
  /** 项目成员管理（添加、移除成员） */
  PROJECT_MEMBER_MANAGE = 'project:member:manage',
  /** 项目成员角色分配 */
  PROJECT_MEMBER_ASSIGN = 'project:member:assign',
  /** 项目角色增删改查 */
  PROJECT_ROLE_MANAGE = 'project:role:manage',
  /** 项目角色权限分配 */
  PROJECT_ROLE_PERMISSION_MANAGE = 'project:role:permission:manage',
  /** 转让项目所有权 */
  PROJECT_TRANSFER = 'project:project:transfer',

  // ========== 文件操作权限 ==========
  /** 创建文件/文件夹 */
  FILE_CREATE = 'project:file:create',
  /** 上传文件 */
  FILE_UPLOAD = 'project:file:upload',
  /** 打开/预览CAD图纸 */
  FILE_OPEN = 'project:file:open',
  /** 编辑CAD图纸 */
  FILE_EDIT = 'project:file:edit',
  /** 删除文件 */
  FILE_DELETE = 'project:file:delete',
  /** 回收站管理（恢复、彻底删除） */
  FILE_TRASH_MANAGE = 'project:file:trash:manage',
  /** 下载文件 */
  FILE_DOWNLOAD = 'project:file:download',
  /** 分享文件 */
  FILE_SHARE = 'project:file:share',
  /** 文件批注 */
  FILE_COMMENT = 'project:file:comment',
  /** 打印文件 */
  FILE_PRINT = 'project:file:print',
  /** 图纸比对 */
  FILE_COMPARE = 'project:file:compare',

  // ========== CAD 图纸权限 ==========
  /** 保存图纸（DWG/MXWEB） */
  CAD_SAVE = 'project:cad:save',
  /** 导出图纸（PDF/DXF） */
  CAD_EXPORT = 'project:cad:export',
  /** 管理外部参照 */
  CAD_EXTERNAL_REFERENCE = 'project:cad:external_reference',

  // ========== 图库权限 ==========
  /** 使用图库（图纸库+图块库） */
  GALLERY_USE = 'project:gallery:use',
  /** 添加到图库 */
  GALLERY_ADD = 'project:gallery:add',

  // ========== 版本管理权限 ==========
  /** 查看版本历史 */
  VERSION_READ = 'project:version:read',
  /** 创建版本 */
  VERSION_CREATE = 'project:version:create',
  /** 删除版本 */
  VERSION_DELETE = 'project:version:delete',
  /** 恢复版本 */
  VERSION_RESTORE = 'project:version:restore',

  // ========== 项目设置权限 ==========
  /** 项目设置管理 */
  PROJECT_SETTINGS_MANAGE = 'project:settings:manage',
}

/**
 * 统一的权限类型
 * @deprecated 请使用 SystemPermission 或 ProjectPermission
 */
export type Permission = SystemPermission | ProjectPermission;

/**
 * 角色类别
 */
export enum RoleCategory {
  SYSTEM = 'SYSTEM', // 系统角色（用于后台管理）
  PROJECT = 'PROJECT', // 项目角色（用于项目和文件管理，暂不实现）
  CUSTOM = 'CUSTOM', // 自定义角色
}

/**
 * 系统角色（用于后台管理）
 */
export enum SystemRole {
  ADMIN = 'ADMIN', // 系统管理员：拥有所有系统权限
  USER_MANAGER = 'USER_MANAGER', // 用户管理员：管理用户和角色
  FONT_MANAGER = 'FONT_MANAGER', // 字体管理员：管理字体库
  USER = 'USER', // 普通用户：基础系统权限
}

/**
 * 项目角色枚举
 * 用于项目和文件系统的角色管理，与系统角色完全解耦
 */
export enum ProjectRole {
  /** 项目所有者：拥有所有项目权限 */
  OWNER = 'PROJECT_OWNER',
  /** 项目管理员：管理项目和成员 */
  ADMIN = 'PROJECT_ADMIN',
  /** 项目编辑者：编辑文件 */
  EDITOR = 'PROJECT_EDITOR',
  /** 项目成员：基本项目操作 */
  MEMBER = 'PROJECT_MEMBER',
  /** 项目查看者：只读权限 */
  VIEWER = 'PROJECT_VIEWER',
}

/**
 * 系统角色权限映射
 * 定义系统角色拥有的系统权限
 */
export const SYSTEM_ROLE_PERMISSIONS: Record<SystemRole, SystemPermission[]> = {
  [SystemRole.ADMIN]: [
    // 系统管理员拥有所有系统权限
    SystemPermission.USER_READ,
    SystemPermission.USER_CREATE,
    SystemPermission.USER_UPDATE,
    SystemPermission.USER_DELETE,
    SystemPermission.ROLE_READ,
    SystemPermission.ROLE_CREATE,
    SystemPermission.ROLE_UPDATE,
    SystemPermission.ROLE_DELETE,
    SystemPermission.ROLE_PERMISSION_MANAGE,
    SystemPermission.FONT_READ,
    SystemPermission.FONT_UPLOAD,
    SystemPermission.FONT_DELETE,
    SystemPermission.FONT_DOWNLOAD,
    SystemPermission.SYSTEM_ADMIN,
    SystemPermission.SYSTEM_MONITOR,
  ],
  [SystemRole.USER_MANAGER]: [
    // 用户管理员权限
    SystemPermission.USER_READ,
    SystemPermission.USER_CREATE,
    SystemPermission.USER_UPDATE,
    SystemPermission.USER_DELETE,
    SystemPermission.ROLE_READ,
    SystemPermission.ROLE_CREATE,
    SystemPermission.ROLE_UPDATE,
    SystemPermission.ROLE_DELETE,
    SystemPermission.ROLE_PERMISSION_MANAGE,
  ],
  [SystemRole.FONT_MANAGER]: [
    // 字体管理员权限
    SystemPermission.FONT_READ,
    SystemPermission.FONT_UPLOAD,
    SystemPermission.FONT_DELETE,
    SystemPermission.FONT_DOWNLOAD,
  ],
  [SystemRole.USER]: [
    // 普通用户：暂无系统权限（仅用于登录）
  ],
};

/**
 * 默认项目角色权限映射
 * 定义默认项目角色拥有的项目权限
 */
export const DEFAULT_PROJECT_ROLE_PERMISSIONS: Record<
  ProjectRole,
  ProjectPermission[]
> = {
  [ProjectRole.OWNER]: [
    // 项目所有者拥有所有项目权限
    ProjectPermission.PROJECT_CREATE,
    ProjectPermission.PROJECT_READ,
    ProjectPermission.PROJECT_UPDATE,
    ProjectPermission.PROJECT_DELETE,
    ProjectPermission.PROJECT_MEMBER_MANAGE,
    ProjectPermission.PROJECT_MEMBER_ASSIGN,
    ProjectPermission.PROJECT_ROLE_MANAGE,
    ProjectPermission.PROJECT_ROLE_PERMISSION_MANAGE,
    ProjectPermission.PROJECT_TRANSFER,
    ProjectPermission.PROJECT_SETTINGS_MANAGE,
    ProjectPermission.FILE_CREATE,
    ProjectPermission.FILE_UPLOAD,
    ProjectPermission.FILE_OPEN,
    ProjectPermission.FILE_EDIT,
    ProjectPermission.FILE_DELETE,
    ProjectPermission.FILE_TRASH_MANAGE,
    ProjectPermission.FILE_DOWNLOAD,
    ProjectPermission.FILE_SHARE,
    ProjectPermission.FILE_COMMENT,
    ProjectPermission.FILE_PRINT,
    ProjectPermission.FILE_COMPARE,
    ProjectPermission.CAD_SAVE,
    ProjectPermission.CAD_EXPORT,
    ProjectPermission.CAD_EXTERNAL_REFERENCE,
    ProjectPermission.GALLERY_USE,
    ProjectPermission.GALLERY_ADD,
    ProjectPermission.VERSION_READ,
    ProjectPermission.VERSION_CREATE,
    ProjectPermission.VERSION_DELETE,
    ProjectPermission.VERSION_RESTORE,
  ],
  [ProjectRole.ADMIN]: [
    // 项目管理员权限
    ProjectPermission.PROJECT_READ,
    ProjectPermission.PROJECT_UPDATE,
    ProjectPermission.PROJECT_MEMBER_MANAGE,
    ProjectPermission.PROJECT_MEMBER_ASSIGN,
    ProjectPermission.PROJECT_SETTINGS_MANAGE,
    ProjectPermission.FILE_CREATE,
    ProjectPermission.FILE_UPLOAD,
    ProjectPermission.FILE_OPEN,
    ProjectPermission.FILE_EDIT,
    ProjectPermission.FILE_DELETE,
    ProjectPermission.FILE_TRASH_MANAGE,
    ProjectPermission.FILE_DOWNLOAD,
    ProjectPermission.FILE_SHARE,
    ProjectPermission.FILE_COMMENT,
    ProjectPermission.FILE_PRINT,
    ProjectPermission.FILE_COMPARE,
    ProjectPermission.CAD_SAVE,
    ProjectPermission.CAD_EXPORT,
    ProjectPermission.CAD_EXTERNAL_REFERENCE,
    ProjectPermission.GALLERY_USE,
    ProjectPermission.GALLERY_ADD,
    ProjectPermission.VERSION_READ,
    ProjectPermission.VERSION_CREATE,
    ProjectPermission.VERSION_DELETE,
    ProjectPermission.VERSION_RESTORE,
  ],
  [ProjectRole.MEMBER]: [
    // 项目成员权限
    ProjectPermission.PROJECT_READ,
    ProjectPermission.FILE_CREATE,
    ProjectPermission.FILE_UPLOAD,
    ProjectPermission.FILE_OPEN,
    ProjectPermission.FILE_EDIT,
    ProjectPermission.FILE_DELETE,
    ProjectPermission.FILE_DOWNLOAD,
    ProjectPermission.FILE_SHARE,
    ProjectPermission.FILE_COMMENT,
    ProjectPermission.FILE_PRINT,
    ProjectPermission.CAD_SAVE,
    ProjectPermission.CAD_EXPORT,
    ProjectPermission.GALLERY_USE,
    ProjectPermission.GALLERY_ADD,
    ProjectPermission.VERSION_READ,
  ],
  [ProjectRole.EDITOR]: [
    // 项目编辑者权限
    ProjectPermission.PROJECT_READ,
    ProjectPermission.FILE_UPLOAD,
    ProjectPermission.FILE_OPEN,
    ProjectPermission.FILE_EDIT,
    ProjectPermission.FILE_DELETE,
    ProjectPermission.FILE_DOWNLOAD,
    ProjectPermission.FILE_COMMENT,
    ProjectPermission.FILE_PRINT,
    ProjectPermission.FILE_COMPARE,
    ProjectPermission.CAD_SAVE,
    ProjectPermission.CAD_EXPORT,
    ProjectPermission.GALLERY_USE,
    ProjectPermission.VERSION_READ,
    ProjectPermission.VERSION_CREATE,
  ],
  [ProjectRole.VIEWER]: [
    // 项目查看者权限
    ProjectPermission.PROJECT_READ,
    ProjectPermission.FILE_OPEN,
    ProjectPermission.FILE_DOWNLOAD,
    ProjectPermission.FILE_PRINT,
    ProjectPermission.CAD_EXPORT,
    ProjectPermission.GALLERY_USE,
    ProjectPermission.VERSION_READ,
  ],
};
