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
/**
 * 项目权限检查模式
 */
export var ProjectPermissionCheckMode;
(function (ProjectPermissionCheckMode) {
    /** 所有权限都必须满足（AND 逻辑） */
    ProjectPermissionCheckMode["ALL"] = "ALL";
    /** 满足任意一个权限即可（OR 逻辑） */
    ProjectPermissionCheckMode["ANY"] = "ANY";
})(ProjectPermissionCheckMode || (ProjectPermissionCheckMode = {}));
/**
 * 项目权限检查元数据键
 */
export const REQUIRE_PROJECT_PERMISSION_KEY = 'require_project_permissions';
/**
 * 项目权限检查模式元数据键
 */
export const REQUIRE_PROJECT_PERMISSION_MODE_KEY = 'require_project_permissions_mode';
/**
 * 要求特定项目权限的装饰器
 *
 * 使用 NestJS 官方的 SetMetadata + applyDecorators 组合，
 * 确保元数据能被 Reflector.getAllAndOverride 正确读取。
 *
 * @example
 * // 要求单个权限
 * @RequireProjectPermission(ProjectPermission.FILE_READ)
 *
 * @example
 * // 要求所有权限（AND 逻辑，默认）
 * @RequireProjectPermission([ProjectPermission.FILE_READ, ProjectPermission.FILE_WRITE])
 *
 * @example
 * // 要求任意一个权限（OR 逻辑）
 * @RequireProjectPermission(
 *   [ProjectPermission.FILE_READ, ProjectPermission.FILE_WRITE],
 *   ProjectPermissionCheckMode.ANY
 * )
 *
 * @param permissions 项目权限列表
 * @param mode 权限检查模式，默认为 ALL
 */
export const RequireProjectPermission = (permissions, mode = ProjectPermissionCheckMode.ALL) => {
    // 支持单个权限或数组
    const permissionArray = Array.isArray(permissions)
        ? permissions
        : [permissions];
    return applyDecorators(SetMetadata(REQUIRE_PROJECT_PERMISSION_KEY, permissionArray), SetMetadata(REQUIRE_PROJECT_PERMISSION_MODE_KEY, mode));
};
//# sourceMappingURL=require-project-permission.decorator.js.map