import { Permission as PrismaPermission } from '@prisma/client';

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
 * 验证权限是否有效
 */
export function isValidPermission(permission: string): boolean {
  return Object.values(PrismaPermission).includes(permission as PrismaPermission);
}

/**
 * 获取所有有效的权限（返回数据库格式）
 */
export function getAllPermissions(): string[] {
  return Object.values(PrismaPermission);
}