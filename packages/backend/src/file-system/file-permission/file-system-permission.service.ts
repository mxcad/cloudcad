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
  NotFoundException,
  ForbiddenException,
  Inject,
} from '@nestjs/common';
import { NodeType } from '@cloudcad/db';
import {
  ProjectPermission,
  ProjectRole,
  SystemPermission,
} from '../../common/enums/permissions.enum';
import { IPROJECT_PERMISSION_SERVICE, IProjectPermissionService } from '../../roles/interfaces/project-permission-service.interface';
import { IPERMISSION_SERVICE, IPermissionService } from '../../permission/interfaces/permission-service.interface';
import { DatabaseService } from '../../database/database.service';
import { TreeWalker } from '../file-tree/tree-walker.service';

import { I18nContext } from 'nestjs-i18n';
/**
 * 文件系统权限服务
 *
 * 功能：
 * 1. 检查文件系统节点权限
 * 2. 管理项目成员权限
 * 3. 使用项目权限系统进行权限检查
 */
@Injectable()
export class FileSystemPermissionService {
  constructor(
    private readonly prisma: DatabaseService,
    @Inject(IPROJECT_PERMISSION_SERVICE) private readonly projectPermissionService: IProjectPermissionService,
    private readonly treeWalker: TreeWalker,
    @Inject(IPERMISSION_SERVICE) private readonly systemPermissionService: IPermissionService
  ) {}

  /**
   * 断言用户可访问节点（fail-closed，服务层节点访问断言的唯一出口）。
   *
   * 语义与 RequireProjectPermissionGuard 对齐：
   * - 资源库上下文（节点本身是库根，或其所属根为库根）：要求对应 LIBRARY_*_MANAGE 系统权限；
   * - 项目/个人空间上下文：要求指定项目权限（owner 自动通过，个人空间经权限存储按
   *   ownerId 判定，见 prisma-permission-store）。
   * 节点不存在抛 NotFoundException；根不可解析时拒绝（fail-closed）。
   * 删除/跨项目/跨个人空间的节点级越权（IDOR）由此统一拦截，调用方无需各自推导根归属。
   */
  async assertNodeAccess(
    userId: string,
    nodeId: string,
    requiredPermission: ProjectPermission
  ): Promise<void> {
    const node = await this.prisma.fileSystemNode.findUnique({
      where: { id: nodeId },
      select: { id: true, nodeType: true, projectId: true },
    });
    if (!node) {
      throw new NotFoundException(
        I18nContext.current()?.t('error.node.not_found') ?? '节点不存在'
      );
    }

    const rootType = await this.resolveRootNodeType(node);
    if (
      rootType === NodeType.LIBRARY_DRAWING ||
      rootType === NodeType.LIBRARY_BLOCK
    ) {
      const requiredSystemPermission =
        rootType === NodeType.LIBRARY_DRAWING
          ? SystemPermission.LIBRARY_DRAWING_MANAGE
          : SystemPermission.LIBRARY_BLOCK_MANAGE;
      const hasSystemPermission =
        await this.systemPermissionService.checkSystemPermission(
          userId,
          requiredSystemPermission
        );
      if (!hasSystemPermission) {
        throw new ForbiddenException(
          I18nContext.current()?.t('error.file.no_repo_access') ??
            '没有访问该资源库的权限'
        );
      }
      return;
    }

    const hasPermission = await this.checkNodePermission(
      userId,
      nodeId,
      requiredPermission
    );
    if (!hasPermission) {
      throw new ForbiddenException(
        I18nContext.current()?.t('error.auth.permission_denied') ??
          '您没有权限执行此操作'
      );
    }
  }

  /**
   * 解析节点所属根节点类型（PROJECT / PERSONAL_SPACE / LIBRARY_*）。
   * 节点自身即根时直接返回；否则优先取 projectId 字段，缺失时经 TreeWalker 上溯。
   * 根不可解析返回 null（调用方按 fail-closed 处理）。
   */
  private async resolveRootNodeType(
    node: { id: string; nodeType: NodeType; projectId: string | null }
  ): Promise<NodeType | null> {
    if (
      node.nodeType === NodeType.PROJECT ||
      node.nodeType === NodeType.PERSONAL_SPACE ||
      node.nodeType === NodeType.LIBRARY_DRAWING ||
      node.nodeType === NodeType.LIBRARY_BLOCK
    ) {
      return node.nodeType;
    }
    const rootId =
      node.projectId || (await this.treeWalker.resolveProjectId(node.id));
    if (!rootId) return null;
    const root = await this.prisma.fileSystemNode.findUnique({
      where: { id: rootId },
      select: { nodeType: true },
    });
    return root?.nodeType ?? null;
  }

  /**
   * 检查节点权限
   *
   * @param userId 用户 ID
   * @param nodeId 节点 ID
   * @param requiredPermission 所需权限
   * @returns 是否具有权限
   */
  async checkNodePermission(
    userId: string,
    nodeId: string,
    requiredPermission: ProjectPermission
  ): Promise<boolean> {
    // 验证节点存在
    const node = await this.prisma.fileSystemNode.findUnique({
      where: { id: nodeId },
      select: { id: true, deletedAt: true, nodeType: true, parentId: true },
    });

    if (!node) {
      throw new NotFoundException(I18nContext.current()?.t('error.node.not_found') ?? '节点不存在');
    }

    if (node.deletedAt) {
      return false;
    }

    // 找到项目根节点 ID
    let projectId: string | null;
    if (node.nodeType === NodeType.PROJECT) {
      projectId = nodeId;
    } else {
      projectId = await this.treeWalker.resolveProjectId(nodeId);
      if (!projectId) {
        return false;
      }
    }

    // 使用项目权限服务检查权限
    return await this.projectPermissionService.checkPermission(
      userId,
      projectId,
      requiredPermission
    );
  }

  /**
   * 获取用户在节点上的访问角色
   *
   * @param userId 用户 ID
   * @param nodeId 节点 ID
   * @returns 访问角色
   */
  async getNodeAccessRole(
    userId: string,
    nodeId: string
  ): Promise<ProjectRole | null> {
    // 1. 获取节点信息
    const node = await this.prisma.fileSystemNode.findUnique({
      where: { id: nodeId },
      select: { ownerId: true, nodeType: true, parentId: true },
    });

    if (!node) {
      return null;
    }

    // 2. 检查是否是公共资源库（新增）
    const isLibrary = await this.isLibraryNode(nodeId);
    if (isLibrary) {
      // 公共资源库允许任何人访问，返回 VIEWER 角色
      return ProjectRole.VIEWER;
    }

    // 3. 找到项目根节点 ID
    let projectId: string | null;
    if (node.nodeType === NodeType.PROJECT) {
      projectId = nodeId;
    } else {
      projectId = await this.treeWalker.resolveProjectId(nodeId);
      if (!projectId) {
        return null;
      }
    }

    // 4. 检查是否是项目所有者
    const project = await this.prisma.fileSystemNode.findUnique({
      where: { id: projectId },
      select: { ownerId: true },
    });

    if (project?.ownerId === userId) {
      return ProjectRole.OWNER;
    }

    // 5. 检查是否是项目成员
    const member = await this.prisma.projectMember.findUnique({
      where: {
        projectId_userId: {
          projectId,
          userId,
        },
      },
      include: {
        projectRole: true,
      },
    });

    return (member?.projectRole?.name as ProjectRole) || null;
  }

  /**
   * 检查节点是否属于公共资源库
   * @param nodeId 节点 ID
   * @returns 是否属于公共资源库
   */
  async isLibraryNode(nodeId: string): Promise<boolean> {
    const node = await this.prisma.fileSystemNode.findUnique({
      where: { id: nodeId },
      select: { nodeType: true },
    });
    return node?.nodeType === NodeType.LIBRARY_DRAWING || node?.nodeType === NodeType.LIBRARY_BLOCK;
  }

  /**
   * 检查用户是否具有指定角色之一
   *
   * @param userId 用户 ID
   * @param nodeId 节点 ID
   * @param roles 角色列表
   * @returns 是否具有指定角色
   */
  async hasNodeAccessRole(
    userId: string,
    nodeId: string,
    roles: ProjectRole[]
  ): Promise<boolean> {
    const role = await this.getNodeAccessRole(userId, nodeId);
    return role ? roles.includes(role) : false;
  }

  /**
   * 设置项目成员权限
   *
   * @param projectId 项目 ID
   * @param userId 用户 ID
   * @param projectRoleId 项目角色 ID
   */
  async setProjectMemberRole(
    projectId: string,
    userId: string,
    projectRoleId: string
  ): Promise<void> {
    await this.prisma.projectMember.upsert({
      where: {
        projectId_userId: {
          projectId,
          userId,
        },
      },
      update: {
        projectRoleId,
      },
      create: {
        projectId,
        userId,
        projectRoleId,
      },
    });

    // 清除缓存
    this.projectPermissionService.clearUserCache(userId, projectId);
  }

  /**
   * 移除项目成员
   *
   * @param projectId 项目 ID
   * @param userId 用户 ID
   */
  async removeProjectMember(projectId: string, userId: string): Promise<void> {
    await this.prisma.projectMember.deleteMany({
      where: {
        projectId,
        userId,
      },
    });

    // 清除缓存
    this.projectPermissionService.clearUserCache(userId, projectId);
  }

  /**
   * 获取项目成员列表
   *
   * @param projectId 项目 ID
   * @returns 项目成员列表
   */
  async getProjectMembers(projectId: string) {
    return await this.prisma.projectMember.findMany({
      where: {
        projectId,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            username: true,
            nickname: true,
            avatar: true,
          },
        },
        projectRole: {
          select: {
            id: true,
            name: true,
            description: true,
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });
  }

  /**
   * 批量添加项目成员
   *
   * @param projectId 项目 ID
   * @param members 成员列表
   */
  async batchAddProjectMembers(
    projectId: string,
    members: Array<{ userId: string; projectRoleId: string }>
  ): Promise<void> {
    await this.prisma.$transaction(
      members.map((member) =>
        this.prisma.projectMember.upsert({
          where: {
            projectId_userId: {
              projectId,
              userId: member.userId,
            },
          },
          update: {
            projectRoleId: member.projectRoleId,
          },
          create: {
            projectId,
            userId: member.userId,
            projectRoleId: member.projectRoleId,
          },
        })
      )
    );

    // 清除缓存
    members.forEach((member) => {
      this.projectPermissionService.clearUserCache(member.userId, projectId);
    });
  }

  /**
   * 批量更新项目成员角色
   *
   * @param projectId 项目 ID
   * @param updates 更新列表
   */
  async batchUpdateProjectMembers(
    projectId: string,
    updates: Array<{ userId: string; projectRoleId: string }>
  ): Promise<void> {
    await this.prisma.$transaction(
      updates.map((update) =>
        this.prisma.projectMember.update({
          where: {
            projectId_userId: {
              projectId,
              userId: update.userId,
            },
          },
          data: {
            projectRoleId: update.projectRoleId,
          },
        })
      )
    );

    // 清除缓存
    updates.forEach((update) => {
      this.projectPermissionService.clearUserCache(update.userId, projectId);
    });
  }

  /**
   * 清除节点权限缓存
   * 注意：此方法会清除项目中所有成员的缓存
   *
   * @param nodeId 节点 ID（项目根节点 ID）
   */
  async clearNodeCache(nodeId: string): Promise<void> {
    // 获取项目的所有成员
    const members = await this.prisma.projectMember.findMany({
      where: { projectId: nodeId },
      select: { userId: true },
    });

    // 清除每个成员的缓存
    for (const member of members) {
      await this.projectPermissionService.clearUserCache(member.userId, nodeId);
    }

    // 还需要清除项目所有者的缓存
    const project = await this.prisma.fileSystemNode.findUnique({
      where: { id: nodeId },
      select: { ownerId: true },
    });

    if (project?.ownerId) {
      await this.projectPermissionService.clearUserCache(
        project.ownerId,
        nodeId
      );
    }
  }

  /**
   * 清除用户权限缓存
   *
   * @param userId 用户 ID
   * @param projectId 项目 ID（可选，缺省时清除用户所有项目的缓存）
   */
  async clearUserCache(userId: string, projectId?: string): Promise<void> {
    if (projectId) {
      await this.projectPermissionService.clearUserCache(userId, projectId);
      return;
    }
    // 无 projectId：查询用户参与的所有项目，逐个清除
    const memberships = await this.prisma.projectMember.findMany({
      where: { userId },
      select: { projectId: true },
    });
    await Promise.all(
      memberships.map((membership) =>
        this.projectPermissionService.clearUserCache(
          userId,
          membership.projectId
        )
      )
    );
  }
}
