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
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  IPERMISSION_SERVICE,
  IPermissionService,
} from '../../permission/interfaces/permission-service.interface';
import {
  PERMISSIONS_KEY,
  PERMISSIONS_MODE_KEY,
  PermissionCheckMode,
} from '../decorators/require-permissions.decorator';
import { SystemPermission } from '../enums/permissions.enum';
import { IS_OPTIONAL_AUTH_KEY } from '../../auth/decorators/optional-auth.decorator';

import { I18nContext } from 'nestjs-i18n';
/**
 * 统一权限检查 Guard
 *
 * 功能：
 * 1. 检查用户是否具有所需的权限
 * 2. 支持 AND 和 OR 逻辑
 * 3. 自动从请求中提取用户信息和节点 ID
 * 4. 支持上下文感知的权限检查
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(IPERMISSION_SERVICE)
    private readonly permissionService: IPermissionService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // 获取装饰器设置的权限
    const requiredPermissions = this.reflector.getAllAndOverride<
      SystemPermission[]
    >(PERMISSIONS_KEY, [context.getHandler(), context.getClass()]);

    // 如果没有设置权限，则允许访问
    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    // 获取权限检查模式
    const mode =
      this.reflector.getAllAndOverride<PermissionCheckMode>(
        PERMISSIONS_MODE_KEY,
        [context.getHandler(), context.getClass()]
      ) || PermissionCheckMode.ALL;

    // 获取请求对象
    const request = context.switchToHttp().getRequest();
    const userId = request.user?.id;

    if (!userId) {
      const isOptionalAuth = this.reflector.getAllAndOverride<boolean>(
        IS_OPTIONAL_AUTH_KEY,
        [context.getHandler(), context.getClass()]
      );
      if (isOptionalAuth) {
        return true;
      }
      throw new ForbiddenException(
        I18nContext.current()?.t('error.auth.unauthorized') ?? '用户未认证'
      );
    }

    // 按用户实际权限检查（基于 userId 实时解析用户当前角色 + 继承，走 system_perm 缓存），
    // 不依赖 JWT/请求中的角色名，避免角色级缓存残留导致"有权限却被拒"
    const hasPermission = await this.checkSystemPermissionsByUser(
      userId,
      requiredPermissions,
      mode
    );

    if (!hasPermission) {
      throw new ForbiddenException(
        I18nContext.current()?.t('error.auth.permission_insufficient') ??
          '权限不足'
      );
    }

    return true;
  }

  /**
   * 按用户检查系统权限（基于 userId 查用户当前角色权限 + 继承）
   */
  private async checkSystemPermissionsByUser(
    userId: string,
    requiredPermissions: SystemPermission[],
    mode: PermissionCheckMode
  ): Promise<boolean> {
    if (mode === PermissionCheckMode.ALL) {
      for (const permission of requiredPermissions) {
        const hasPermission =
          await this.permissionService.checkSystemPermission(
            userId,
            permission
          );
        if (!hasPermission) {
          return false;
        }
      }
      return true;
    } else {
      for (const permission of requiredPermissions) {
        const hasPermission =
          await this.permissionService.checkSystemPermission(
            userId,
            permission
          );
        if (hasPermission) {
          return true;
        }
      }
      return false;
    }
  }
}
