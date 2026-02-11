import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { NODE_PERMISSION_KEY } from '../decorators/project-permission.decorator';
import { ProjectRole } from '../enums/permissions.enum';
import { ProjectPermissionService } from '../../roles/project-permission.service';
import { FileSystemService } from '../../file-system/file-system.service';

/**
 * 项目权限守卫
 * 检查用户在项目中的权限
 */
@Injectable()
export class NodePermissionGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private projectPermissionService: ProjectPermissionService,
    private fileSystemService: FileSystemService
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
    const projectId = await this.extractProjectId(request);
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

  /**
   * 从请求中提取项目ID
   */
  private async extractProjectId(request: any): Promise<string | null> {
    // 从路由参数中获取
    if (request.params?.projectId) {
      return request.params.projectId;
    }

    // 从查询参数中获取
    if (request.query?.projectId) {
      return request.query.projectId;
    }

    // 从请求体中获取（包括 FormData 字段）
    if (request.body?.projectId) {
      return request.body.projectId;
    }

    // 如果有 nodeId，从数据库查找其所属的项目根节点
    // 注意：nodeId 可能来自 request.body（FormData）或 request.params
    let nodeId = request.params?.nodeId || request.body?.nodeId;

    if (nodeId) {
      try {
        // 使用 getNodeTree 而不是 getNode，因为 getNode 会过滤已删除的节点（deletedAt: null）
        // 对于回收站中的项目，我们需要能够获取节点信息
        const node = await this.fileSystemService.getNodeTree(nodeId);

        if (node) {
          // 如果节点本身是项目根节点，直接返回其ID
          if (node.isRoot) {
            return node.id;
          }

          // 如果节点不是项目根节点，返回其所属项目的根节点ID
          // 通过向上遍历找到项目根节点
          const projectRoot = await this.findProjectRoot(nodeId);
          return projectRoot;
        }
        // 节点不存在（可能是已删除的节点，如回收站中的项目），返回 null 让请求继续
        return null;
      } catch (error) {
        if (error instanceof NotFoundException) {
          // 节点不存在，可能是已删除的节点，返回 null
          return null;
        }
        console.error('[NodePermissionGuard] 从节点ID推导项目ID失败:', error);
        // 查询失败时继续尝试其他方式
        return null;
      }
    }

    return null;
  }

  /**
   * 查找节点的项目根节点
   * @param nodeId 节点ID
   * @returns 项目根节点ID
   */
  private async findProjectRoot(nodeId: string): Promise<string | null> {
    try {
      // 使用 getNodeTree 而不是 getNode，因为 getNode 会过滤已删除的节点（deletedAt: null）
      // 对于回收站中的节点，我们需要能够获取节点信息并向上查找项目根节点
      const node = await this.fileSystemService.getNodeTree(nodeId);

      if (!node) {
        return null;
      }

      // 如果是项目根节点，直接返回
      if (node.isRoot) {
        return node.id;
      }

      // 如果有父节点，递归查找
      if (node.parentId) {
        return this.findProjectRoot(node.parentId);
      }

      return null;
    } catch (error) {
      if (error instanceof NotFoundException) {
        // 节点不存在（可能是已删除的节点），返回 null
        return null;
      }
      console.error('[findProjectRoot] 查找项目根节点失败:', error);
      return null;
    }
  }
}

// 别名：ProjectPermissionGuard = NodePermissionGuard
@Injectable()
export class ProjectPermissionGuard extends NodePermissionGuard {}
