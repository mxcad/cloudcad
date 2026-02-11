import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { NODE_PERMISSION_KEY } from '../common/decorators/project-permission.decorator';
import { ProjectRole } from '../common/enums/permissions.enum';
import { ProjectPermissionService } from '../roles/project-permission.service';

/**
 * 版本控制权限守卫
 * 专门用于版本控制 API 的权限检查，从查询参数中获取 projectId
 */
@Injectable()
export class VersionControlPermissionGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private projectPermissionService: ProjectPermissionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<ProjectRole[]>(
      NODE_PERMISSION_KEY,
      [context.getHandler(), context.getClass()]
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('用户未认证');
    }

    // 从查询参数中获取 projectId
    const projectId = request.query?.projectId;
    if (!projectId) {
      throw new BadRequestException('缺少项目ID参数');
    }

    // 1. 先检查是否是项目所有者（如果要求包含 OWNER 角色）
    if (requiredRoles.includes(ProjectRole.OWNER)) {
      const isOwner = await this.projectPermissionService.isProjectOwner(
        user.id,
        projectId
      );
      if (isOwner) {
        return true;
      }
    }

    // 2. 检查用户是否具有任意一个所需角色
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
}