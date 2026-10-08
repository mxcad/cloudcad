///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { Permission as PrismaPermission } from '@cloudcad/db';

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
  custom?: Record<string, unknown>;
  /** 元数据（策略引擎使用） */
  metadata?: Record<string, unknown>;
  /** 资源 ID（用于资源级权限检查） */
  resourceId?: string;
  /** 资源类型（用于资源级权限检查） */
  resourceType?: string;
}

/**
 * 验证权限是否有效
 */
export function isValidPermission(permission: string): boolean {
  return Object.values(PrismaPermission).includes(
    permission as PrismaPermission
  );
}
