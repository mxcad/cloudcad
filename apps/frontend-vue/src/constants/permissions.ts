/**
 * 权限常量 - 自动生成，请勿手动修改
 *
 * 生成时间: 2026-04-14T02:55:19.424Z
 * 来源: Prisma Schema (apps/backend/prisma/schema.prisma)
 *
 * 如需修改权限，请编辑 apps/backend/prisma/schema.prisma 文件，
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
  SYSTEM_CONFIG_READ: 'SYSTEM_CONFIG_READ',
  SYSTEM_CONFIG_WRITE: 'SYSTEM_CONFIG_WRITE',
  LIBRARY_DRAWING_MANAGE: 'LIBRARY_DRAWING_MANAGE',
  LIBRARY_BLOCK_MANAGE: 'LIBRARY_BLOCK_MANAGE',
  STORAGE_QUOTA: 'STORAGE_QUOTA',
  PROJECT_CREATE: 'PROJECT_CREATE',
} as const;

/**
 * 项目权限枚举
 * 用于项目和文件系统的权限控制
 */
export const ProjectPermission = {
  PROJECT_UPDATE: 'PROJECT_UPDATE',
  PROJECT_DELETE: 'PROJECT_DELETE',
  PROJECT_MEMBER_MANAGE: 'PROJECT_MEMBER_MANAGE',
  PROJECT_MEMBER_ASSIGN: 'PROJECT_MEMBER_ASSIGN',
  PROJECT_TRANSFER: 'PROJECT_TRANSFER',
  PROJECT_ROLE_MANAGE: 'PROJECT_ROLE_MANAGE',
  PROJECT_ROLE_PERMISSION_MANAGE: 'PROJECT_ROLE_PERMISSION_MANAGE',
  FILE_CREATE: 'FILE_CREATE',
  FILE_UPLOAD: 'FILE_UPLOAD',
  FILE_OPEN: 'FILE_OPEN',
  FILE_EDIT: 'FILE_EDIT',
  FILE_DELETE: 'FILE_DELETE',
  FILE_TRASH_MANAGE: 'FILE_TRASH_MANAGE',
  FILE_DOWNLOAD: 'FILE_DOWNLOAD',
  FILE_MOVE: 'FILE_MOVE',
  FILE_COPY: 'FILE_COPY',
  CAD_SAVE: 'CAD_SAVE',
  CAD_EXTERNAL_REFERENCE: 'CAD_EXTERNAL_REFERENCE',
  VERSION_READ: 'VERSION_READ',
} as const;

/**
 * 系统权限类型
 */
export type SystemPermission =
  (typeof SystemPermission)[keyof typeof SystemPermission];

/**
 * 项目权限类型
 */
export type ProjectPermission =
  (typeof ProjectPermission)[keyof typeof ProjectPermission];

/**
 * 统一权限类型
 */
export type Permission = SystemPermission | ProjectPermission;

/**
 * 系统角色名称映射
 */
export const SYSTEM_ROLE_NAMES: Record<string, string> = {
  ADMIN: '系统管理员',
  USER_MANAGER: '用户管理员',
  FONT_MANAGER: '字体管理员',
  USER: '普通用户',
};

/**
 * 项目角色名称映射
 */
export const PROJECT_ROLE_NAMES: Record<string, string> = {
  PROJECT_OWNER: '项目所有者',
  PROJECT_ADMIN: '项目管理员',
  PROJECT_EDITOR: '项目编辑者',
  PROJECT_MEMBER: '项目成员',
  PROJECT_VIEWER: '项目查看者',
};

/**
 * 获取角色显示名称
 */
export function getRoleDisplayName(
  roleName: string,
  isSystemRole?: boolean
): string {
  const isProjectRole =
    isSystemRole === false || roleName.startsWith('PROJECT_');
  const mapping = isProjectRole ? PROJECT_ROLE_NAMES : SYSTEM_ROLE_NAMES;
  return mapping[roleName] || roleName;
}
