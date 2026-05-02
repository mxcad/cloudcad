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
import { ProjectPermission, SystemPermission } from '../enums/permissions.enum';
import { DatabaseService } from '../../database/database.service';
import { PermissionService } from '../services/permission.service';
import { FileTreeService } from '../../file-system/services/file-tree.service';

/**
 * 项目权限检查 Guard
 *
 * 功能：
 * 1. 检查用户是否具有所需的项目权限
 * 2. 支持 AND 和 OR 逻辑
 * 3. 自动从请求中提取用户信息和项目 ID
 * 4. 项目所有者自动通过所有权限检查
 * 5. **智能节点类型判断**：自动检测公开资源库节点并检查系统权限
 */
@Injectable()
export class RequireProjectPermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly projectPermissionService: ProjectPermissionService,
    private readonly systemPermissionService: PermissionService,
    private readonly prisma: DatabaseService,
    private readonly fileTreeService: FileTreeService
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

    // 智能节点类型判断：检查是否为公开资源库节点
    const nodeId = this.extractNodeId(request);
    let projectId: string | null = null;

    if (nodeId) {
      const isLibraryNode = await this.fileTreeService.getLibraryKey(nodeId);
      if (isLibraryNode) {
        // 公开资源库：检查系统权限
        const hasPermission = await this.checkLibraryPermission(
          userId,
          isLibraryNode
        );

        if (!hasPermission) {
          throw new ForbiddenException('没有访问该资源库的权限');
        }

        return true;
      }

      // 不是公开资源库节点：直接用 nodeId 查 projectId
      // 这解决了 multipart/form-data 请求中 body 未解析的问题
      projectId = await this.extractProjectIdFromNode(nodeId);
    }

    // 如果上面的方式没拿到 projectId，尝试从请求中获取
    if (!projectId) {
      projectId = await this.extractProjectId(request);
    }

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

    if (!hasPermission) {
      throw new ForbiddenException('您没有权限执行此操作');
    }

    return true;
  }

  /**
   * 从请求中提取节点ID
   *
   * 支持多种参数名：
   * - nodeId: 直接的节点ID
   * - parentId: 父节点ID（用于创建子节点等操作）
   */
  private extractNodeId(request: {
    params?: { nodeId?: string; parentId?: string };
    query?: { nodeId?: string; parentId?: string };
    body?: { nodeId?: string; parentId?: string };
  }): string | null {
    return (
      request.params?.nodeId ||
      request.params?.parentId ||
      request.body?.nodeId ||
      request.body?.parentId ||
      request.query?.nodeId ||
      request.query?.parentId ||
      null
    );
  }

  /**
   * 检查公开资源库权限
   */
  private async checkLibraryPermission(
    userId: string,
    libraryKey: 'drawing' | 'block'
  ): Promise<boolean> {
    const requiredPermission =
      libraryKey === 'drawing'
        ? SystemPermission.LIBRARY_DRAWING_MANAGE
        : SystemPermission.LIBRARY_BLOCK_MANAGE;

    return this.systemPermissionService.checkSystemPermission(
      userId,
      requiredPermission
    );
  }

  /**
   * 从请求中提取项目ID
   *
   * 逻辑：
   * 1. 优先从 params/query/body 中获取 projectId
   * 2. 如果没有，则通过 nodeId 查找节点
   * 3. 如果节点是根节点（isRoot = true），nodeId 就是 projectId
   * 4. 如果节点不是根节点，返回节点的 projectId
   */
  private async extractProjectId(request: {
    params?: { projectId?: string; nodeId?: string; parentId?: string };
    query?: { projectId?: string; nodeId?: string; parentId?: string };
    body?: { projectId?: string; nodeId?: string; parentId?: string };
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

    // 通过 nodeId 或 parentId 查找其所属的项目
    const nodeId =
      request.params?.nodeId ||
      request.params?.parentId ||
      request.body?.nodeId ||
      request.body?.parentId ||
      request.query?.nodeId ||
      request.query?.parentId;

    if (!nodeId) {
      return null;
    }

    return this.extractProjectIdFromNode(nodeId);
  }

  /**
   * 直接通过节点 ID 获取项目 ID
   *
   * 逻辑：
   * 1. 查找节点
   * 2. 如果是根节点（isRoot = true），nodeId 就是 projectId
   * 3. 如果不是根节点，返回节点的 projectId
   * 4. 如果节点的 projectId 为 null，尝试递归查找父节点的 projectId
   */
  private async extractProjectIdFromNode(
    nodeId: string
  ): Promise<string | null> {
    try {
      const node = await this.prisma.fileSystemNode.findUnique({
        where: { id: nodeId },
        select: { id: true, isRoot: true, projectId: true, parentId: true },
      });

      if (!node) {
        return null;
      }

      // 如果是根节点，nodeId 就是 projectId
      if (node.isRoot) {
        return node.id;
      }

      // 如果节点有 projectId，直接返回
      if (node.projectId) {
        return node.projectId;
      }

      // 如果节点的 projectId 为 null，尝试递归查找父节点的 projectId
      if (node.parentId) {
        return this.extractProjectIdFromNode(node.parentId);
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
