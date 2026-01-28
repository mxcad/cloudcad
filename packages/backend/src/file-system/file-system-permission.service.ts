import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ProjectPermission } from '../common/enums/permissions.enum';
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
      select: { id: true, deletedAt: true },
    });

    if (!node || node.deletedAt) {
      throw new NotFoundException('节点不存在');
    }

    // 使用项目权限服务检查权限
    return await this.projectPermissionService.checkPermission(
      userId,
      nodeId,
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
    const member = await this.prisma.projectMember.findUnique({
      where: {
        projectId_userId: {
          projectId: nodeId,
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
    roles: string[]
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
   *
   * @param nodeId 节点 ID
   */
  clearNodeCache(nodeId: string): void {
    // 暂时不实现，因为 ProjectPermissionService 没有这个方法
    // 可以通过清除所有用户的缓存来实现
  }

  /**
   * 清除用户权限缓存
   *
   * @param userId 用户 ID
   */
  clearUserCache(userId: string): void {
    // 暂时不实现，因为 ProjectPermissionService 需要 projectId
  }
}
