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

import { SetMetadata, applyDecorators } from '@nestjs/common';
import { Permission } from '../enums/permissions.enum';

/**
 * 权限检查模式
 */
export enum PermissionCheckMode {
  /** 所有权限都必须满足（AND 逻辑） */
  ALL = 'ALL',
  /** 满足任意一个权限即可（OR 逻辑） */
  ANY = 'ANY',
}

/**
 * 权限检查元数据键
 */
export const PERMISSIONS_KEY = 'permissions';

/**
 * 权限检查模式元数据键
 */
export const PERMISSIONS_MODE_KEY = 'permissions_mode';

/**
 * 要求特定权限的装饰器
 *
 * 使用 NestJS 官方的 SetMetadata + applyDecorators 组合，
 * 确保元数据能被 Reflector.getAllAndOverride 正确读取。
 *
 * @example
 * // 要求所有权限（AND 逻辑，默认）
 * @RequirePermissions([Permission.FILE_READ, Permission.FILE_WRITE])
 *
 * @example
 * // 要求任意一个权限（OR 逻辑）
 * @RequirePermissions([Permission.FILE_READ, Permission.FILE_WRITE], PermissionCheckMode.ANY)
 *
 * @param permissions 权限列表
 * @param mode 权限检查模式，默认为 ALL
 */
export const RequirePermissions = (
  permissions: Permission[],
  mode: PermissionCheckMode = PermissionCheckMode.ALL
) => {
  return applyDecorators(
    SetMetadata(PERMISSIONS_KEY, permissions),
    SetMetadata(PERMISSIONS_MODE_KEY, mode)
  );
};
