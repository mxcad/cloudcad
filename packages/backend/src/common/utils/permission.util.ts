import { Permission } from '../enums/permissions.enum';
import { Permission as PrismaPermission } from '@prisma/client';

/**
 * 权限类型转换工具
 * 用于在业务层 Permission 枚举和 Prisma Permission 枚举之间进行转换
 */

/**
 * Permission 字符串值到 Prisma 枚举标识符的映射表
 */
const PERMISSION_MAP: Record<Permission, PrismaPermission> = {
  [Permission.USER_READ]: PrismaPermission.USER_READ,
  [Permission.USER_WRITE]: PrismaPermission.USER_WRITE,
  [Permission.USER_DELETE]: PrismaPermission.USER_DELETE,
  [Permission.USER_ADMIN]: PrismaPermission.USER_ADMIN,

  [Permission.PROJECT_CREATE]: PrismaPermission.PROJECT_CREATE,
  [Permission.PROJECT_READ]: PrismaPermission.PROJECT_READ,
  [Permission.PROJECT_WRITE]: PrismaPermission.PROJECT_WRITE,
  [Permission.PROJECT_DELETE]: PrismaPermission.PROJECT_DELETE,
  [Permission.PROJECT_ADMIN]: PrismaPermission.PROJECT_ADMIN,
  [Permission.PROJECT_MEMBER_MANAGE]: PrismaPermission.PROJECT_MEMBER_MANAGE,

  [Permission.FILE_CREATE]: PrismaPermission.FILE_CREATE,
  [Permission.FILE_READ]: PrismaPermission.FILE_READ,
  [Permission.FILE_WRITE]: PrismaPermission.FILE_WRITE,
  [Permission.FILE_DELETE]: PrismaPermission.FILE_DELETE,
  [Permission.FILE_SHARE]: PrismaPermission.FILE_SHARE,
  [Permission.FILE_DOWNLOAD]: PrismaPermission.FILE_DOWNLOAD,
  [Permission.FILE_COMMENT]: PrismaPermission.FILE_COMMENT,
  [Permission.FILE_PRINT]: PrismaPermission.FILE_PRINT,
  [Permission.FILE_COMPARE]: PrismaPermission.FILE_COMPARE,

  [Permission.VERSION_READ]: PrismaPermission.VERSION_READ,
  [Permission.VERSION_CREATE]: PrismaPermission.VERSION_CREATE,
  [Permission.VERSION_DELETE]: PrismaPermission.VERSION_DELETE,
  [Permission.VERSION_RESTORE]: PrismaPermission.VERSION_RESTORE,

  [Permission.FONT_MANAGE]: PrismaPermission.FONT_MANAGE,
  [Permission.REVIEW_CONFIG]: PrismaPermission.REVIEW_CONFIG,
  [Permission.TRASH_MANAGE]: PrismaPermission.TRASH_MANAGE,
  [Permission.SYSTEM_ADMIN]: PrismaPermission.SYSTEM_ADMIN,
  [Permission.SYSTEM_MONITOR]: PrismaPermission.SYSTEM_MONITOR,
};

/**
 * Prisma 枚举标识符到 Permission 字符串值的反向映射表
 */
const REVERSE_PERMISSION_MAP: Record<PrismaPermission, Permission> = Object.fromEntries(
  Object.entries(PERMISSION_MAP).map(([key, value]) => [value, key])
) as Record<PrismaPermission, Permission>;

/**
 * 将业务层 Permission 转换为 Prisma Permission
 */
export function toPrismaPermission(permission: Permission): PrismaPermission {
  return PERMISSION_MAP[permission];
}

/**
 * 将 Prisma Permission 转换为业务层 Permission
 */
export function fromPrismaPermission(permission: PrismaPermission): Permission {
  return REVERSE_PERMISSION_MAP[permission];
}

/**
 * 批量转换业务层 Permission 为 Prisma Permission
 */
export function toPrismaPermissions(
  permissions: Permission[]
): PrismaPermission[] {
  return permissions.map(toPrismaPermission);
}

/**
 * 批量转换 Prisma Permission 为业务层 Permission
 */
export function fromPrismaPermissions(
  permissions: PrismaPermission[]
): Permission[] {
  return permissions.map(fromPrismaPermission);
}

/**
 * 验证权限是否有效
 */
export function isValidPermission(
  permission: string
): permission is Permission {
  return Object.values(Permission).includes(permission as Permission);
}

/**
 * 获取所有有效的权限
 */
export function getAllPermissions(): Permission[] {
  return Object.values(Permission);
}
