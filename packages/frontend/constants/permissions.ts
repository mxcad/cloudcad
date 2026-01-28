/**
 * 权限常量
 * 从后端 OpenAPI 自动生成，与后端权限定义保持同步
 *
 * 注意：这些类型来自 packages/frontend/types/api.ts
 * 运行 `pnpm generate:types` 重新生成
 */

import type { components } from '../types/api';

/**
 * 系统权限枚举
 * 从 OpenAPI 自动生成，与后端 SystemPermission 枚举保持同步
 */
export type SystemPermission = components['schemas']['SystemPermission'];

/**
 * 项目权限枚举
 * 从 OpenAPI 自动生成，与后端 ProjectPermission 枚举保持同步
 */
export type ProjectPermission = components['schemas']['ProjectPermission'];

/**
 * 统一权限枚举
 * 从 OpenAPI 自动生成，与后端 Permission 枚举保持同步
 */
export type Permission = components['schemas']['Permission'];

/**
 * 系统权限常量对象
 * 提供类型安全的权限引用
 */
export const SystemPermission = {
  // 用户管理
  USER_READ: 'system:user:read',
  USER_CREATE: 'system:user:create',
  USER_UPDATE: 'system:user:update',
  USER_DELETE: 'system:user:delete',

  // 角色权限管理
  ROLE_READ: 'system:role:read',
  ROLE_CREATE: 'system:role:create',
  ROLE_UPDATE: 'system:role:update',
  ROLE_DELETE: 'system:role:delete',
  ROLE_PERMISSION_MANAGE: 'system:role:permission:manage',

  // 字体库管理
  FONT_READ: 'system:font:read',
  FONT_UPLOAD: 'system:font:upload',
  FONT_DELETE: 'system:font:delete',
  FONT_DOWNLOAD: 'system:font:download',

  // 系统管理
  SYSTEM_ADMIN: 'system:admin',
  SYSTEM_MONITOR: 'system:monitor',
} as const;

/**
 * 项目权限常量对象
 * 提供类型安全的权限引用
 */
export const ProjectPermission = {
  // 项目管理
  PROJECT_CREATE: 'project:project:create',
  PROJECT_READ: 'project:project:read',
  PROJECT_UPDATE: 'project:project:update',
  PROJECT_DELETE: 'project:project:delete',
  PROJECT_MEMBER_MANAGE: 'project:member:manage',
  PROJECT_MEMBER_ASSIGN: 'project:member:assign',
  PROJECT_ROLE_MANAGE: 'project:role:manage',
  PROJECT_ROLE_PERMISSION_MANAGE: 'project:role:permission:manage',
  PROJECT_TRANSFER: 'project:project:transfer',

  // 文件操作
  FILE_CREATE: 'project:file:create',
  FILE_UPLOAD: 'project:file:upload',
  FILE_OPEN: 'project:file:open',
  FILE_EDIT: 'project:file:edit',
  FILE_DELETE: 'project:file:delete',
  FILE_TRASH_MANAGE: 'project:file:trash:manage',
  FILE_DOWNLOAD: 'project:file:download',
  FILE_SHARE: 'project:file:share',
  FILE_COMMENT: 'project:file:comment',
  FILE_PRINT: 'project:file:print',
  FILE_COMPARE: 'project:file:compare',

  // CAD 图纸
  CAD_SAVE: 'project:cad:save',
  CAD_EXPORT: 'project:cad:export',
  CAD_EXTERNAL_REFERENCE: 'project:cad:external_reference',

  // 图库
  GALLERY_USE: 'project:gallery:use',
  GALLERY_ADD: 'project:gallery:add',

  // 版本管理
  VERSION_READ: 'project:version:read',
  VERSION_CREATE: 'project:version:create',
  VERSION_DELETE: 'project:version:delete',
  VERSION_RESTORE: 'project:version:restore',

  // 项目设置
  PROJECT_SETTINGS_MANAGE: 'project:settings:manage',
} as const;

/**
 * 获取系统权限的所有值
 */
export const SystemPermissionValues = Object.values(SystemPermission) as readonly SystemPermission[];

/**
 * 获取项目权限的所有值
 */
export const ProjectPermissionValues = Object.values(ProjectPermission) as readonly ProjectPermission[];

/**
 * 获取所有权限的值
 */
export const PermissionValues = [...SystemPermissionValues, ...ProjectPermissionValues] as readonly Permission[];