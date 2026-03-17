///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement
// 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
// This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionService } from '../services/permission.service';
import {
  PERMISSIONS_KEY,
  PERMISSIONS_MODE_KEY,
  PermissionCheckMode,
} from '../decorators/require-permissions.decorator';
import { SystemPermission } from '../enums/permissions.enum';
import { PermissionContext } from '../utils/permission.util';

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
    private readonly permissionService: PermissionService
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
      throw new ForbiddenException('用户未认证');
    }

    // 提取上下文信息
    const permissionContext = this.extractContext(request);

    // 检查权限
    const hasPermission = await this.checkPermissions(
      userId,
      requiredPermissions,
      mode,
      permissionContext
    );

    if (!hasPermission) {
      throw new ForbiddenException('权限不足');
    }

    return true;
  }

  /**
   * 从请求中提取上下文信息
   */
  private extractContext(request: any): PermissionContext {
    return {
      ipAddress: request.ip || request.connection.remoteAddress,
      userAgent: request.headers['user-agent'],
      time: new Date(),
      // 可以根据需要添加更多上下文信息
    };
  }

  /**
   * 检查权限
   */
  private async checkPermissions(
    userId: string,
    requiredPermissions: SystemPermission[],
    mode: PermissionCheckMode,
    context: PermissionContext
  ): Promise<boolean> {
    if (mode === PermissionCheckMode.ALL) {
      // AND 逻辑：所有权限都必须满足
      for (const permission of requiredPermissions) {
        const hasPermission =
          await this.permissionService.checkSystemPermissionWithContext(
            userId,
            permission,
            context
          );
        if (!hasPermission) {
          return false;
        }
      }
      return true;
    } else {
      // OR 逻辑：满足任意一个权限即可
      for (const permission of requiredPermissions) {
        const hasPermission =
          await this.permissionService.checkSystemPermissionWithContext(
            userId,
            permission,
            context
          );
        if (hasPermission) {
          return true;
        }
      }
      return false;
    }
  }
}
