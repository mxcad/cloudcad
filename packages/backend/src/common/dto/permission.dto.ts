import { ApiProperty } from '@nestjs/swagger';

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
 */
export type Permission = SystemPermission | ProjectPermission;

/**
 * 系统权限 DTO
 * 用于在 Swagger 中暴露系统权限枚举
 */
export class SystemPermissionDto {
  @ApiProperty({
    enum: SystemPermission,
    description: '系统权限',
    example: SystemPermission.USER_READ,
  })
  permission: SystemPermission;
}

/**
 * 项目权限 DTO
 * 用于在 Swagger 中暴露项目权限枚举
 */
export class ProjectPermissionDto {
  @ApiProperty({
    enum: ProjectPermission,
    description: '项目权限',
    example: ProjectPermission.FILE_UPLOAD,
  })
  permission: ProjectPermission;
}

/**
 * 权限 DTO
 * 用于在 Swagger 中暴露统一权限枚举
 */
export class PermissionDto {
  @ApiProperty({
    enum: Object.values({ ...SystemPermission, ...ProjectPermission }),
    description: '权限',
    example: SystemPermission.USER_READ,
  })
  permission: Permission;
}