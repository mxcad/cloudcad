import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { UserRole } from '../enums/permissions.enum';
import { PermissionCacheService } from '../services/permission-cache.service';
import {
  PermissionService,
  UserWithPermissions,
} from '../services/permission.service';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private permissionService: PermissionService,
    private cacheService: PermissionCacheService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
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
    const cachedRole = this.cacheService.getUserRole(user.id);
    if (cachedRole) {
      return requiredRoles.includes(cachedRole);
    }

    // 缓存未命中，检查实际角色并缓存
    const hasRole = this.permissionService.hasRole(user, requiredRoles);
    if (hasRole) {
      this.cacheService.cacheUserRole(user.id, user.role);
    }

    return hasRole;
  }
}
