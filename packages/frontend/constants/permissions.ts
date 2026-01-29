/**
 * 权限常量 - 自动生成，请勿手动修改
 *
 * 生成时间: 2026-01-29T02:37:41.695Z
 * 来源: Prisma Schema (packages/backend/prisma/schema.prisma)
 *
 * 如需修改权限，请编辑 packages/backend/prisma/schema.prisma 文件，
 * 然后运行 pnpm generate:frontend-permissions 重新生成
 *
 * 注意：权限格式为大写下划线（如 'PROJECT_CREATE'），与后端枚举和数据库保持一致
 */

/**
 * 系统权限枚举
 * 用于后台管理功能的权限控制
 */
export const SystemPermission = {
  SYSTEM_USER_READ: 'SYSTEM_USER_READ',
  SYSTEM_USER_CREATE: 'SYSTEM_USER_CREATE',
  SYSTEM_USER_UPDATE: 'SYSTEM_USER_UPDATE',
  SYSTEM_USER_DELETE: 'SYSTEM_USER_DELETE',
  SYSTEM_ROLE_READ: 'SYSTEM_ROLE_READ',
  SYSTEM_ROLE_CREATE: 'SYSTEM_ROLE_CREATE',
  SYSTEM_ROLE_UPDATE: 'SYSTEM_ROLE_UPDATE',
  SYSTEM_ROLE_DELETE: 'SYSTEM_ROLE_DELETE',
  SYSTEM_ROLE_PERMISSION_MANAGE: 'SYSTEM_ROLE_PERMISSION_MANAGE',
  SYSTEM_FONT_READ: 'SYSTEM_FONT_READ',
  SYSTEM_FONT_UPLOAD: 'SYSTEM_FONT_UPLOAD',
  SYSTEM_FONT_DELETE: 'SYSTEM_FONT_DELETE',
  SYSTEM_FONT_DOWNLOAD: 'SYSTEM_FONT_DOWNLOAD',
  SYSTEM_ADMIN: 'SYSTEM_ADMIN',
  SYSTEM_MONITOR: 'SYSTEM_MONITOR',
} as const;

/**
 * 项目权限枚举
 * 用于项目和文件系统的权限控制
 */
export const ProjectPermission = {
  PROJECT_CREATE: 'PROJECT_CREATE',
  PROJECT_READ: 'PROJECT_READ',
  PROJECT_UPDATE: 'PROJECT_UPDATE',
  PROJECT_DELETE: 'PROJECT_DELETE',
  PROJECT_MEMBER_MANAGE: 'PROJECT_MEMBER_MANAGE',
  PROJECT_MEMBER_ASSIGN: 'PROJECT_MEMBER_ASSIGN',
  PROJECT_ROLE_MANAGE: 'PROJECT_ROLE_MANAGE',
  PROJECT_ROLE_PERMISSION_MANAGE: 'PROJECT_ROLE_PERMISSION_MANAGE',
  PROJECT_TRANSFER: 'PROJECT_TRANSFER',
  PROJECT_SETTINGS_MANAGE: 'PROJECT_SETTINGS_MANAGE',
  FILE_CREATE: 'FILE_CREATE',
  FILE_UPLOAD: 'FILE_UPLOAD',
  FILE_OPEN: 'FILE_OPEN',
  FILE_EDIT: 'FILE_EDIT',
  FILE_DELETE: 'FILE_DELETE',
  FILE_TRASH_MANAGE: 'FILE_TRASH_MANAGE',
  FILE_DOWNLOAD: 'FILE_DOWNLOAD',
  FILE_SHARE: 'FILE_SHARE',
  FILE_COMMENT: 'FILE_COMMENT',
  FILE_PRINT: 'FILE_PRINT',
  FILE_COMPARE: 'FILE_COMPARE',
  CAD_SAVE: 'CAD_SAVE',
  CAD_EXPORT: 'CAD_EXPORT',
  CAD_EXTERNAL_REFERENCE: 'CAD_EXTERNAL_REFERENCE',
  GALLERY_USE: 'GALLERY_USE',
  GALLERY_ADD: 'GALLERY_ADD',
  VERSION_READ: 'VERSION_READ',
  VERSION_CREATE: 'VERSION_CREATE',
  VERSION_DELETE: 'VERSION_DELETE',
  VERSION_RESTORE: 'VERSION_RESTORE',
} as const;

/**
 * 系统权限类型
 */
export type SystemPermission = typeof SystemPermission[keyof typeof SystemPermission];

/**
 * 项目权限类型
 */
export type ProjectPermission = typeof ProjectPermission[keyof typeof ProjectPermission];

/**
 * 统一权限类型
 */
export type Permission = SystemPermission | ProjectPermission;

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
