import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  ProjectPermission,
  ProjectRole,
} from '../common/enums/permissions.enum';
import { ProjectPermissionService } from '../roles/project-permission.service';
import { DatabaseService } from '../database/database.service';

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
  private readonly logger = new Logger(FileSystemPermissionService.name);

  constructor(
    private readonly prisma: DatabaseService,
    private readonly projectPermissionService: ProjectPermissionService
  ) {}

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
      select: { id: true, deletedAt: true, isRoot: true, parentId: true },
    });

    if (!node || node.deletedAt) {
      throw new NotFoundException('节点不存在');
    }

    // 找到项目根节点 ID
    let projectId: string | null;
    if (node.isRoot) {
      projectId = nodeId;
    } else {
      projectId = await this.findProjectRootId(nodeId);
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
  ): Promise<string | null> {
    // 1. 获取节点信息，包括 ownerId 和项目根节点信息
    const node = await this.prisma.fileSystemNode.findUnique({
      where: { id: nodeId },
      select: { ownerId: true, isRoot: true, parentId: true },
    });

    if (!node) {
      return null;
    }

    // 2. 找到项目根节点 ID
    let projectId: string | null;
    if (node.isRoot) {
      // 如果是项目根节点，直接使用
      projectId = nodeId;
    } else {
      // 如果是子节点，需要向上查找项目根节点
      projectId = await this.findProjectRootId(nodeId);
      if (!projectId) {
        return null;
      }
    }

    // 3. 检查是否是项目所有者
    const project = await this.prisma.fileSystemNode.findUnique({
      where: { id: projectId },
      select: { ownerId: true },
    });

    if (project?.ownerId === userId) {
      return ProjectRole.OWNER;
    }

    // 4. 检查是否是项目成员
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

    return member?.projectRole?.name || null;
  }

  /**
   * 最大递归深度限制，防止循环引用导致的无限递归
   */
  private static readonly MAX_RECURSION_DEPTH = 50;

  /**
   * 查找节点的项目根节点 ID
   * @param nodeId 节点ID
   * @param depth 当前递归深度（内部使用）
   * @returns 项目根节点ID
   */
  private async findProjectRootId(
    nodeId: string,
    depth: number = 0
  ): Promise<string | null> {
    // 检查递归深度，防止无限递归
    if (depth > FileSystemPermissionService.MAX_RECURSION_DEPTH) {
      this.logger.error(
        `[findProjectRootId] 超过最大递归深度限制，可能存在循环引用: ${nodeId}`
      );
      return null;
    }

    try {
      const node = await this.prisma.fileSystemNode.findUnique({
        where: { id: nodeId },
        select: { isRoot: true, parentId: true },
      });

      if (!node) {
        return null;
      }

      // 如果是项目根节点，直接返回
      if (node.isRoot) {
        return nodeId;
      }

      // 如果有父节点，递归查找
      if (node.parentId) {
        return this.findProjectRootId(node.parentId, depth + 1);
      }

      return null;
    } catch (error) {
      this.logger.error(`[findProjectRootId] 查找项目根节点失败: ${error}`);
      return null;
    }
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
    return role ? roles.includes(role as ProjectRole) : false;
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
   * 清除特定用户在特定项目的缓存
   *
   * @param userId 用户 ID
   * @param projectId 项目 ID
   */
  async clearUserProjectCache(
    userId: string,
    projectId: string
  ): Promise<void> {
    await this.projectPermissionService.clearUserCache(userId, projectId);
  }

  /**
   * 清除用户权限缓存
   *
   * @param userId 用户 ID
   * @param projectId 项目 ID（可选）
   */
  async clearUserCache(userId: string, projectId?: string): Promise<void> {
    if (projectId) {
      await this.projectPermissionService.clearUserCache(userId, projectId);
    }
    // TODO: 如果没有 projectId，需要清除用户在所有项目中的缓存
    // 这需要查询用户参与的所有项目，然后逐个清除
  }
}
