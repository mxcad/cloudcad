import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { NODE_PERMISSION_KEY } from '../decorators/project-permission.decorator';
import { NodeAccessRole } from '../enums/permissions.enum';
import { PermissionCacheService } from '../services/permission-cache.service';
import {
  PermissionService,
  UserWithPermissions,
} from '../services/permission.service';

@Injectable()
export class NodePermissionGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private permissionService: PermissionService,
    private cacheService: PermissionCacheService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<NodeAccessRole[]>(
      NODE_PERMISSION_KEY,
      [context.getHandler(), context.getClass()]
    );

    if (!requiredRoles) {
      return true; // 没有权限要求，允许访问
    }

    const request = context.switchToHttp().getRequest();
    const user: UserWithPermissions = request.user;

    if (!user) {
      throw new ForbiddenException('用户未认证');
    }

    // 从请求参数中获取节点ID（项目ID或文件夹ID）
    const nodeId = this.extractNodeId(request);
    if (!nodeId) {
      throw new BadRequestException('缺少节点ID参数');
    }

    // 先检查缓存
    const cachedRole = this.cacheService.getNodeAccessRole(user.id, nodeId);
    if (cachedRole && requiredRoles.includes(cachedRole)) {
      request.nodeId = nodeId;
      return true;
    }

    const hasPermission = await this.permissionService.hasNodeAccessRole(
      user,
      nodeId,
      requiredRoles
    );

    if (!hasPermission) {
      throw new ForbiddenException('用户没有足够的节点访问权限');
    }

    // 将节点信息添加到请求中，供后续使用
    request.nodeId = nodeId;
    return true;
  }

  private extractNodeId(request: any): string | null {
    // 从路由参数中获取（优先使用 nodeId，其次 projectId）
    if (
      request.params?.nodeId !== undefined &&
      request.params?.nodeId !== null
    ) {
      return request.params.nodeId;
    }
    if (
      request.params?.projectId !== undefined &&
      request.params?.projectId !== null
    ) {
      return request.params.projectId;
    }

    // 从查询参数中获取
    if (request.query?.nodeId !== undefined && request.query?.nodeId !== null) {
      return request.query.nodeId;
    }
    if (
      request.query?.projectId !== undefined &&
      request.query?.projectId !== null
    ) {
      return request.query.projectId;
    }

    // 从请求体中获取
    if (request.body?.nodeId !== undefined && request.body?.nodeId !== null) {
      return request.body.nodeId;
    }
    if (
      request.body?.projectId !== undefined &&
      request.body?.projectId !== null
    ) {
      return request.body.projectId;
    }

    return null;
  }
}

// 向后兼容：重命名原 ProjectPermissionGuard
@Injectable()
export class ProjectPermissionGuard extends NodePermissionGuard {
  constructor(
    reflector: Reflector,
    permissionService: PermissionService,
    cacheService: PermissionCacheService
  ) {
    super(reflector, permissionService, cacheService);
  }
}
