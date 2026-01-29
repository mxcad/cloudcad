import { SystemPermission } from '../enums/permissions.enum';
import { Permission as PrismaPermission } from '@prisma/client';

/**
 * 权限类型转换工具
 * 用于在业务层 SystemPermission 枚举和 Prisma Permission 枚举之间进行转换
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
 * SystemPermission 字符串值到 Prisma 枚举标识符的映射表
 */
const PERMISSION_MAP: Record<SystemPermission, PrismaPermission> = {
  [SystemPermission.USER_READ]: PrismaPermission.USER_READ,
  [SystemPermission.USER_CREATE]: PrismaPermission.USER_CREATE,
  [SystemPermission.USER_UPDATE]: PrismaPermission.USER_UPDATE,
  [SystemPermission.USER_DELETE]: PrismaPermission.USER_DELETE,

  [SystemPermission.ROLE_READ]: PrismaPermission.ROLE_READ,
  [SystemPermission.ROLE_CREATE]: PrismaPermission.ROLE_CREATE,
  [SystemPermission.ROLE_UPDATE]: PrismaPermission.ROLE_UPDATE,
  [SystemPermission.ROLE_DELETE]: PrismaPermission.ROLE_DELETE,
  [SystemPermission.ROLE_PERMISSION_MANAGE]:
    PrismaPermission.ROLE_PERMISSION_MANAGE,

  [SystemPermission.FONT_READ]: PrismaPermission.FONT_READ,
  [SystemPermission.FONT_UPLOAD]: PrismaPermission.FONT_UPLOAD,
  [SystemPermission.FONT_DELETE]: PrismaPermission.FONT_DELETE,
  [SystemPermission.FONT_DOWNLOAD]: PrismaPermission.FONT_DOWNLOAD,

  [SystemPermission.SYSTEM_ADMIN]: PrismaPermission.SYSTEM_ADMIN,
  [SystemPermission.SYSTEM_MONITOR]: PrismaPermission.SYSTEM_MONITOR,
};

/**
 * Prisma 枚举标识符到 SystemPermission 字符串值的反向映射表
 */
const REVERSE_PERMISSION_MAP: Record<PrismaPermission, SystemPermission> =
  Object.fromEntries(
    Object.entries(PERMISSION_MAP).map(([key, value]) => [value, key])
  ) as Record<PrismaPermission, SystemPermission>;

/**
 * 将业务层 SystemPermission 或字符串转换为 Prisma Permission
 */
export function toPrismaPermission(
  permission: SystemPermission | string
): PrismaPermission {
  // 如果已经是有效的 Prisma 枚举，直接返回
  if (isValidPrismaPermission(permission)) {
    return permission as PrismaPermission;
  }

  // 尝试从业务层枚举映射
  if (PERMISSION_MAP[permission as SystemPermission]) {
    return PERMISSION_MAP[permission as SystemPermission];
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
 * 将 Prisma Permission 转换为业务层 SystemPermission
 */
export function fromPrismaPermission(
  permission: PrismaPermission
): SystemPermission {
  return permission as unknown as SystemPermission;
}

/**
 * 批量转换业务层 SystemPermission 为 Prisma Permission
 */
export function toPrismaPermissions(
  permissions: SystemPermission[]
): PrismaPermission[] {
  return permissions.map(toPrismaPermission);
}

/**
 * 批量转换 Prisma Permission 为业务层 SystemPermission
 */
export function fromPrismaPermissions(
  permissions: PrismaPermission[]
): SystemPermission[] {
  return permissions.map(fromPrismaPermission);
}

/**
 * 验证权限是否有效
 */
export function isValidPermission(permission: string): boolean {
  // 检查是否为有效的 Prisma 枚举
  const prismaPermissions = Object.values(PrismaPermission);
  if (prismaPermissions.includes(permission as PrismaPermission)) {
    return true;
  }

  // 检查是否为有效的业务层枚举
  const businessPermissions = Object.values(SystemPermission);
  if (businessPermissions.includes(permission as SystemPermission)) {
    return true;
  }

  return false;
}

/**
 * 获取所有有效的权限（返回数据库格式）
 */
export function getAllPermissions(): string[] {
  return Object.values(PrismaPermission);
}
