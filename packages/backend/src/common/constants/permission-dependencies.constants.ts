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

import {
  SystemPermission,
  ProjectPermission,
} from '../enums/permissions.enum';

/**
 * 权限前置依赖表（后端权威校验用）
 *
 * 语义：某权限的前置权限未授予时，该权限无法在界面上被使用（例如没有
 * SYSTEM_ROLE_READ 就无法进入角色管理页，"创建角色"成为死权限），因此分配权限时
 * 自动补全缺失的前置权限，避免出现"能创建但看不到"的无效组合。
 *
 * 规则与 scripts/generate-frontend-permissions.js 的 generatePermissionDependencies
 * 保持一致，修改时两处必须同步。
 */
export const SYSTEM_PERMISSION_DEPENDENCIES: Partial<
  Record<SystemPermission, SystemPermission[]>
> = {
  // 创建/编辑用户必须在用户管理页的"角色"下拉中选择角色（下拉数据来自 GET /roles，
  // 需要 SYSTEM_ROLE_READ），因此依赖链为 [SYSTEM_USER_READ, SYSTEM_ROLE_READ]
  [SystemPermission.SYSTEM_USER_CREATE]: [
    SystemPermission.SYSTEM_USER_READ,
    SystemPermission.SYSTEM_ROLE_READ,
  ],
  [SystemPermission.SYSTEM_USER_UPDATE]: [
    SystemPermission.SYSTEM_USER_READ,
    SystemPermission.SYSTEM_ROLE_READ,
  ],
  [SystemPermission.SYSTEM_USER_DELETE]: [SystemPermission.SYSTEM_USER_READ],
  [SystemPermission.SYSTEM_USER_MEMBERSHIP_MANAGE]: [
    SystemPermission.SYSTEM_USER_READ,
  ],
  [SystemPermission.SYSTEM_ROLE_CREATE]: [SystemPermission.SYSTEM_ROLE_READ],
  [SystemPermission.SYSTEM_ROLE_UPDATE]: [SystemPermission.SYSTEM_ROLE_READ],
  [SystemPermission.SYSTEM_ROLE_DELETE]: [SystemPermission.SYSTEM_ROLE_READ],
  [SystemPermission.SYSTEM_ROLE_PERMISSION_MANAGE]: [
    SystemPermission.SYSTEM_ROLE_READ,
  ],
  [SystemPermission.SYSTEM_BILLING_WRITE]: [
    SystemPermission.SYSTEM_BILLING_READ,
  ],
  [SystemPermission.SYSTEM_CONFIG_WRITE]: [SystemPermission.SYSTEM_CONFIG_READ],
  [SystemPermission.SYSTEM_FONT_UPLOAD]: [SystemPermission.SYSTEM_FONT_READ],
  [SystemPermission.SYSTEM_FONT_DELETE]: [SystemPermission.SYSTEM_FONT_READ],
  [SystemPermission.SYSTEM_FONT_DOWNLOAD]: [SystemPermission.SYSTEM_FONT_READ],
};

export const PROJECT_PERMISSION_DEPENDENCIES: Partial<
  Record<ProjectPermission, ProjectPermission[]>
> = {
  [ProjectPermission.PROJECT_UPDATE]: [ProjectPermission.FILE_OPEN],
  [ProjectPermission.PROJECT_DELETE]: [ProjectPermission.PROJECT_UPDATE],
  [ProjectPermission.PROJECT_MEMBER_MANAGE]: [ProjectPermission.PROJECT_UPDATE],
  [ProjectPermission.PROJECT_MEMBER_ASSIGN]: [ProjectPermission.PROJECT_UPDATE],
  [ProjectPermission.PROJECT_TRANSFER]: [ProjectPermission.PROJECT_UPDATE],
  [ProjectPermission.PROJECT_TRANSFER_MANAGE]: [ProjectPermission.PROJECT_UPDATE],
  [ProjectPermission.PROJECT_ROLE_MANAGE]: [ProjectPermission.PROJECT_UPDATE],
  [ProjectPermission.PROJECT_ROLE_PERMISSION_MANAGE]: [
    ProjectPermission.PROJECT_UPDATE,
  ],
  [ProjectPermission.FILE_CREATE]: [ProjectPermission.FILE_OPEN],
  [ProjectPermission.FILE_UPLOAD]: [ProjectPermission.FILE_OPEN],
  [ProjectPermission.FILE_EDIT]: [ProjectPermission.FILE_OPEN],
  [ProjectPermission.FILE_DELETE]: [ProjectPermission.FILE_OPEN],
  [ProjectPermission.FILE_TRASH_MANAGE]: [ProjectPermission.FILE_OPEN],
  [ProjectPermission.FILE_DOWNLOAD]: [ProjectPermission.FILE_OPEN],
  [ProjectPermission.FILE_MOVE]: [ProjectPermission.FILE_OPEN],
  [ProjectPermission.FILE_COPY]: [ProjectPermission.FILE_OPEN],
  [ProjectPermission.CAD_SAVE]: [ProjectPermission.FILE_OPEN],
  [ProjectPermission.CAD_EXTERNAL_REFERENCE]: [ProjectPermission.FILE_OPEN],
  [ProjectPermission.FILE_SHARE]: [ProjectPermission.FILE_OPEN],
  [ProjectPermission.VERSION_READ]: [ProjectPermission.FILE_OPEN],
};

/**
 * 自动补全缺失的前置权限（迭代直至稳定，幂等）
 *
 * 与前端"勾选自动补全前置"策略对齐：无论权限从哪个入口写入（UI / 直连 API），
 * 数据库都不会出现缺少前置权限的无效组合。
 */
export function completePermissionDependencies<T extends string>(
  permissions: T[]
): T[] {
  const result = new Set<T>(permissions);
  let changed = true;

  while (changed) {
    changed = false;
    for (const perm of [...result]) {
      const deps =
        SYSTEM_PERMISSION_DEPENDENCIES[perm as SystemPermission] ??
        PROJECT_PERMISSION_DEPENDENCIES[perm as ProjectPermission];
      if (!deps) continue;
      for (const dep of deps) {
        if (!result.has(dep as T)) {
          result.add(dep as T);
          changed = true;
        }
      }
    }
  }

  return [...result];
}
