import { Permission } from '../enums/permissions.enum';
import { Permission as PrismaPermission } from '@prisma/client';

/**
 * 权限类型转换工具
 * 用于在业务层 Permission 枚举和 Prisma Permission 枚举之间进行转换
 */

/**
 * 权限检查上下文
 * 支持基于时间、位置、设备等上下文因素的权限控制
 */
export interface PermissionContext {
  /** 用户 IP 地址 */
  ipAddress?: string;
  /** 用户设备信息 */
  userAgent?: string;
  /** 检查时间（默认为当前时间） */
  time?: Date;
  /** 地理位置信息 */
  location?: string;
  /** 自定义上下文数据 */
  custom?: Record<string, any>;
}

/**
 * 上下文规则配置
 */
export interface ContextRule {
  /** 规则名称 */
  name: string;
  /** 适用的权限列表（空数组表示适用于所有权限） */
  permissions: string[];
  /** 规则是否启用 */
  enabled: boolean;
  /** 规则描述 */
  description: string;
}

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

  [Permission.CAD_SAVE]: PrismaPermission.CAD_SAVE,
  [Permission.CAD_EXPORT]: PrismaPermission.CAD_EXPORT,
  [Permission.CAD_EXTERNAL_REFERENCE]: PrismaPermission.CAD_EXTERNAL_REFERENCE,

  [Permission.GALLERY_USE]: PrismaPermission.GALLERY_USE,

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
const REVERSE_PERMISSION_MAP: Record<PrismaPermission, Permission> =
  Object.fromEntries(
    Object.entries(PERMISSION_MAP).map(([key, value]) => [value, key])
  ) as Record<PrismaPermission, Permission>;

/**
 * 将业务层 Permission 或字符串转换为 Prisma Permission
 * 支持两种格式：
 * 1. 小写格式（后端内部使用）：'user:read'
 * 2. 大写格式（前端发送）：'USER_READ'
 */
export function toPrismaPermission(permission: Permission | string): PrismaPermission {
  // 如果已经是有效的 Prisma 枚举（大写），直接返回
  if (isValidPrismaPermission(permission)) {
    return permission as PrismaPermission;
  }

  // 尝试从小写格式映射
  if (PERMISSION_MAP[permission as Permission]) {
    return PERMISSION_MAP[permission as Permission];
  }

  // 尝试从大写格式映射（前端发送的格式）
  // 将 'USER_READ' 直接作为 Prisma 枚举值
  const upperCaseKey = permission as string;
  const prismaPerm = upperCaseKey as PrismaPermission;
  if (isValidPrismaPermission(prismaPerm)) {
    return prismaPerm;
  }

  throw new Error(`无效的权限值: ${permission}`);
}

/**
 * 验证是否为有效的 Prisma Permission
 */
function isValidPrismaPermission(value: string): boolean {
  return Object.values(PrismaPermission).includes(value as PrismaPermission);
}

/**
 * 将 Prisma Permission 转换为业务层 Permission
 * 注意：直接返回 Prisma 枚举值（大写格式），以保持与前端一致
 */
export function fromPrismaPermission(permission: PrismaPermission): Permission {
  // 直接返回 Prisma 枚举值（字符串），转换为 Permission 类型
  // 这样可以保持与前端 Permission 枚举（大写格式）一致
  return permission as unknown as Permission;
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
 * 验证权限是否有效（支持大写和小写格式）
 * 大写格式：USER_READ（前端使用）
 * 小写格式：user:read（后端业务层使用）
 */
export function isValidPermission(permission: string): boolean {
  // 检查是否为有效的 Prisma 枚举（大写格式）
  const prismaPermissions = Object.values(PrismaPermission);
  if (prismaPermissions.includes(permission as PrismaPermission)) {
    return true;
  }

  // 检查是否为有效的业务层枚举（小写格式）
  const businessPermissions = Object.values(Permission);
  if (businessPermissions.includes(permission as Permission)) {
    return true;
  }

  return false;
}

/**
 * 获取所有有效的权限（返回数据库格式：大写）
 */
export function getAllPermissions(): string[] {
  return Object.values(PrismaPermission);
}
