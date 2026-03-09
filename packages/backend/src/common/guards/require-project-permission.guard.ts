import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ProjectPermissionService } from '../../roles/project-permission.service';
import {
  REQUIRE_PROJECT_PERMISSION_KEY,
  REQUIRE_PROJECT_PERMISSION_MODE_KEY,
  ProjectPermissionCheckMode,
} from '../decorators/require-project-permission.decorator';
import { ProjectPermission } from '../enums/permissions.enum';
import { DatabaseService } from '../../database/database.service';

/**
 * 项目权限检查 Guard
 *
 * 功能：
 * 1. 检查用户是否具有所需的项目权限
 * 2. 支持 AND 和 OR 逻辑
 * 3. 自动从请求中提取用户信息和项目 ID
 * 4. 项目所有者自动通过所有权限检查
 */
@Injectable()
export class RequireProjectPermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly projectPermissionService: ProjectPermissionService,
    private readonly prisma: DatabaseService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // 获取当前处理的类和处理器方法
    const targetClass = context.getClass();
    const targetHandler = context.getHandler();

    // 获取装饰器设置的权限 - 先从方法级别读取，再从类级别读取
    const requiredPermissions =
      this.reflector.get<ProjectPermission[]>(
        REQUIRE_PROJECT_PERMISSION_KEY,
        targetHandler
      ) ||
      this.reflector.get<ProjectPermission[]>(
        REQUIRE_PROJECT_PERMISSION_KEY,
        targetClass
      );

    // 如果没有设置权限，则允许访问
    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    // 获取权限检查模式 - 先从方法级别读取，再从类级别读取
    const mode =
      this.reflector.get<ProjectPermissionCheckMode>(
        REQUIRE_PROJECT_PERMISSION_MODE_KEY,
        targetHandler
      ) ||
      this.reflector.get<ProjectPermissionCheckMode>(
        REQUIRE_PROJECT_PERMISSION_MODE_KEY,
        targetClass
      ) ||
      ProjectPermissionCheckMode.ALL;

    // 获取请求对象
    const request = context.switchToHttp().getRequest();
    const userId = request.user?.id;

    if (!userId) {
      throw new ForbiddenException('用户未认证');
    }

    // 从请求中获取项目ID
    const projectId = await this.extractProjectId(request);
    console.log(
      '[RequireProjectPermissionGuard] 提取到的 projectId:',
      projectId
    );
    if (!projectId) {
      throw new BadRequestException('缺少项目ID参数');
    }

    // 检查权限（所有用户都基于权限验证，包括项目所有者）
    const hasPermission = await this.checkPermissions(
      userId,
      projectId,
      requiredPermissions,
      mode
    );
    console.log('[RequireProjectPermissionGuard] 权限检查结果:', hasPermission);

    if (!hasPermission) {
      throw new ForbiddenException('您没有权限执行此操作');
    }

    return true;
  }

  /**
   * 从请求中提取项目ID
   */
  private async extractProjectId(request: {
    params?: { projectId?: string; nodeId?: string };
    query?: { projectId?: string };
    body?: { projectId?: string; nodeId?: string };
  }): Promise<string | null> {
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

    // 如果有 nodeId，从数据库查找其所属的项目
    const nodeId = request.params?.nodeId || request.body?.nodeId;

    if (nodeId) {
      try {
        const node = await this.prisma.fileSystemNode.findUnique({
          where: { id: nodeId },
          select: { id: true, isRoot: true, parentId: true },
        });
        if (node) {
          // 如果节点本身是项目根节点，直接返回其ID
          if (node.isRoot) {
            return node.id;
          }
          // 否则查找项目根节点
          return this.findProjectRoot(nodeId);
        }
      } catch {
        return null;
      }
    }

    return null;
  }

  /**
   * 查找节点的项目根节点
   */
  private async findProjectRoot(nodeId: string): Promise<string | null> {
    try {
      const node = await this.prisma.fileSystemNode.findUnique({
        where: { id: nodeId },
        select: { id: true, isRoot: true, parentId: true },
      });
      if (!node) {
        return null;
      }

      if (node.isRoot) {
        return node.id;
      }

      if (node.parentId) {
        return this.findProjectRoot(node.parentId);
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * 检查权限
   */
  private async checkPermissions(
    userId: string,
    projectId: string,
    requiredPermissions: ProjectPermission[],
    mode: ProjectPermissionCheckMode
  ): Promise<boolean> {
    if (mode === ProjectPermissionCheckMode.ALL) {
      // AND 逻辑：所有权限都必须满足
      for (const permission of requiredPermissions) {
        const hasPermission =
          await this.projectPermissionService.checkPermission(
            userId,
            projectId,
            permission
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
          await this.projectPermissionService.checkPermission(
            userId,
            projectId,
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
