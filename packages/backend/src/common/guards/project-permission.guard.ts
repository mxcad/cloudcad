import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { NODE_PERMISSION_KEY } from '../decorators/project-permission.decorator';
import { ProjectRole } from '../enums/permissions.enum';
import { ProjectPermissionService } from '../../roles/project-permission.service';

/**
 * 项目权限守卫
 * 检查用户在项目中的权限
 */
@Injectable()
export class NodePermissionGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private projectPermissionService: ProjectPermissionService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<ProjectRole[]>(
      NODE_PERMISSION_KEY,
      [context.getHandler(), context.getClass()]
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true; // 没有权限要求，允许访问
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('用户未认证');
    }

    // 从请求参数中获取项目ID
    const projectId = this.extractProjectId(request);
    if (!projectId) {
      throw new BadRequestException('缺少项目ID参数');
    }

    // 检查用户是否具有任意一个所需角色
    const hasAnyRole = await this.projectPermissionService.hasRole(
      user.id,
      projectId,
      requiredRoles
    );

    if (!hasAnyRole) {
      throw new ForbiddenException('您没有权限执行此操作');
    }

    return true;
  }

  /**
   * 从请求中提取项目ID
   */
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

// 别名：ProjectPermissionGuard = NodePermissionGuard
@Injectable()
export class ProjectPermissionGuard extends NodePermissionGuard {}
