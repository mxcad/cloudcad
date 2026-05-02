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

import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { PermissionCacheService } from '../services/permission-cache.service';
import { RolesCacheService } from '../services/roles-cache.service';
import {
  PermissionService,
  UserWithPermissions,
} from '../services/permission.service';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private permissionService: PermissionService,
    private cacheService: PermissionCacheService,
    private rolesCacheService: RolesCacheService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()]
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true; // 没有角色要求或空数组，允许访问
    }

    const request = context.switchToHttp().getRequest();
    const user: UserWithPermissions = request.user;

    if (!user) {
      return false;
    }

    // 先检查缓存中的用户角色
    const cachedRole = await this.cacheService.getUserRole(user.id);
    if (cachedRole) {
      return requiredRoles.includes(cachedRole);
    }

    // 缓存未命中，检查实际角色并缓存
    // 注意：无论是否有角色都应该缓存，避免拒绝路径的缓存穿透
    const hasRole = this.permissionService.hasRole(user, requiredRoles);
    this.cacheService.cacheUserRole(user.id, user.role.name);

    return hasRole;
  }
}
