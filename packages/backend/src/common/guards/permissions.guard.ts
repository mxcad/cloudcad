import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionService } from '../services/permission.service';
import { PERMISSIONS_KEY, PERMISSIONS_MODE_KEY, PermissionCheckMode } from '../decorators/require-permissions.decorator';
import { Permission } from '../enums/permissions.enum';

/**
 * 统一权限检查 Guard
 *
 * 功能：
 * 1. 检查用户是否具有所需的权限
 * 2. 支持 AND 和 OR 逻辑
 * 3. 自动从请求中提取用户信息和节点 ID
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissionService: PermissionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // 获取装饰器设置的权限
    const requiredPermissions = this.reflector.getAllAndOverride<Permission[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    // 如果没有设置权限，则允许访问
    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    // 获取权限检查模式
    const mode = this.reflector.getAllAndOverride<PermissionCheckMode>(
      PERMISSIONS_MODE_KEY,
      [context.getHandler(), context.getClass()],
    ) || PermissionCheckMode.ALL;

    // 获取请求对象
    const request = context.switchToHttp().getRequest();
    const userId = request.user?.id;

    if (!userId) {
      throw new ForbiddenException('用户未认证');
    }

    // 获取节点 ID（如果有）
    const nodeId = this.extractNodeId(request);

    // 检查权限
    const hasPermission = await this.checkPermissions(
      userId,
      nodeId,
      requiredPermissions,
      mode,
    );

    if (!hasPermission) {
      throw new ForbiddenException('权限不足');
    }

    return true;
  }

  /**
   * 从请求中提取节点 ID
   */
  private extractNodeId(request: any): string | undefined {
    // 优先从请求体中获取
    if (request.body?.nodeId) {
      return request.body.nodeId;
    }

    // 其次从路由参数中获取
    if (request.params?.nodeId) {
      return request.params.nodeId;
    }

    // 再次从查询参数中获取
    if (request.query?.nodeId) {
      return request.query.nodeId;
    }

    // 最后从 parent 参数获取（用于文件系统操作）
    if (request.params?.id) {
      return request.params.id;
    }

    if (request.params?.projectId) {
      return request.params.projectId;
    }

    return undefined;
  }

  /**
   * 检查权限
   */
  private async checkPermissions(
    userId: string,
    nodeId: string | undefined,
    requiredPermissions: Permission[],
    mode: PermissionCheckMode,
  ): Promise<boolean> {
    if (mode === PermissionCheckMode.ALL) {
      // AND 逻辑：所有权限都必须满足
      for (const permission of requiredPermissions) {
        const hasPermission = await this.permissionService.checkPermission(
          userId,
          nodeId,
          permission,
        );
        if (!hasPermission) {
          return false;
        }
      }
      return true;
    } else {
      // OR 逻辑：满足任意一个权限即可
      for (const permission of requiredPermissions) {
        const hasPermission = await this.permissionService.checkPermission(
          userId,
          nodeId,
          permission,
        );
        if (hasPermission) {
          return true;
        }
      }
      return false;
    }
  }
}