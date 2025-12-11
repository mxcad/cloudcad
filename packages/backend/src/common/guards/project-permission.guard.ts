import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PROJECT_PERMISSION_KEY } from '../decorators/project-permission.decorator';
import { ProjectMemberRole } from '../enums/permissions.enum';
import { PermissionCacheService } from '../services/permission-cache.service';
import {
  PermissionService,
  UserWithPermissions,
} from '../services/permission.service';

@Injectable()
export class ProjectPermissionGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private permissionService: PermissionService,
    private cacheService: PermissionCacheService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<ProjectMemberRole[]>(
      PROJECT_PERMISSION_KEY,
      [context.getHandler(), context.getClass()]
    );

    if (!requiredRoles) {
      return true; // 没有项目权限要求，允许访问
    }

    const request = context.switchToHttp().getRequest();
    const user: UserWithPermissions = request.user;

    if (!user) {
      throw new ForbiddenException('用户未认证');
    }

    // 从请求参数中获取项目ID
    const projectId = this.extractProjectId(request);
    if (!projectId) {
      throw new BadRequestException('缺少项目ID参数');
    }

    // 先检查缓存
    const cachedRole = this.cacheService.getProjectMemberRole(user.id, projectId);
    if (cachedRole && requiredRoles.includes(cachedRole)) {
      request.projectId = projectId;
      return true;
    }

    const hasPermission = await this.permissionService.hasProjectRole(
      user,
      projectId,
      requiredRoles
    );

    if (!hasPermission) {
      throw new ForbiddenException('用户没有足够的项目权限');
    }

    // 将项目信息添加到请求中，供后续使用
    request.projectId = projectId;
    return true;
  }

  private extractProjectId(request: any): string | null {
    // 从路由参数中获取
    if (request.params?.projectId) {
      return request.params.projectId;
    }

    // 从查询参数中获取
    if (request.query?.projectId) {
      return request.query.projectId;
    }

    // 从请求体中获取
    if (request.body?.projectId) {
      return request.body.projectId;
    }

    return null;
  }
}
