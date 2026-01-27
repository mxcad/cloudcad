import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { RedisCacheService } from './redis-cache.service';
import { Permission } from '../enums/permissions.enum';
import { NodeAccessRole } from '../enums/permissions.enum';

/**
 * 缓存预热服务
 *
 * 功能：
 * 1. 在系统启动时预热常用权限数据
 * 2. 预热活跃用户的权限
 * 3. 预热活跃项目的成员权限
 * 4. 提供手动触发预热的功能
 */
@Injectable()
export class CacheWarmupService implements OnModuleInit {
  private readonly logger = new Logger(CacheWarmupService.name);
  private readonly MAX_USERS_TO_WARMUP = 100; // 最多预热100个用户
  private readonly MAX_PROJECTS_TO_WARMUP = 50; // 最多预热50个项目

  constructor(
    private readonly prisma: DatabaseService,
    private readonly redisCacheService: RedisCacheService,
  ) {}

  /**
   * 模块初始化时自动执行缓存预热
   */
  async onModuleInit(): Promise<void> {
    this.logger.log('开始缓存预热...');
    try {
      await this.warmupCache();
      this.logger.log('缓存预热完成');
    } catch (error) {
      this.logger.error(`缓存预热失败: ${error.message}`, error.stack);
    }
  }

  /**
   * 执行缓存预热
   */
  async warmupCache(): Promise<void> {
    const startTime = Date.now();

    // 1. 预热活跃用户的权限
    await this.warmupActiveUsers();

    // 2. 预热活跃项目的成员权限
    await this.warmupActiveProjects();

    const duration = Date.now() - startTime;
    this.logger.log(`缓存预热完成，耗时 ${duration}ms`);
  }

  /**
   * 预热活跃用户的权限
   */
  private async warmupActiveUsers(): Promise<void> {
    try {
      // 获取最近登录的活跃用户
      const activeUsers = await this.prisma.user.findMany({
        where: {
          status: 'ACTIVE',
        },
        orderBy: {
          updatedAt: 'desc',
        },
        take: this.MAX_USERS_TO_WARMUP,
        select: {
          id: true,
          role: true,
        },
      });

      this.logger.log(`开始预热 ${activeUsers.length} 个活跃用户的权限`);

      for (const user of activeUsers) {
        try {
          // 缓存用户角色
          await this.redisCacheService.cacheUserRole(user.id, user.role);

          // 缓存用户权限（基于角色）
          const permissions = this.getPermissionsByRole(user.role.name);
          await this.redisCacheService.cacheUserPermissions(user.id, permissions);

          this.logger.debug(`预热用户 ${user.id} 的权限成功`);
        } catch (error) {
          this.logger.error(`预热用户 ${user.id} 的权限失败: ${error.message}`);
        }
      }

      this.logger.log(`活跃用户权限预热完成`);
    } catch (error) {
      this.logger.error(`预热活跃用户失败: ${error.message}`, error.stack);
    }
  }

  /**
   * 预热活跃项目的成员权限
   */
  private async warmupActiveProjects(): Promise<void> {
    try {
      // 获取最近更新的活跃项目
      const activeProjects = await this.prisma.fileSystemNode.findMany({
        where: {
          isRoot: true,
          deletedAt: null,
        },
        orderBy: {
          updatedAt: 'desc',
        },
        take: this.MAX_PROJECTS_TO_WARMUP,
        select: {
          id: true,
          ownerId: true,
        },
      });

      this.logger.log(`开始预热 ${activeProjects.length} 个活跃项目的成员权限`);

      for (const project of activeProjects) {
        try {
          // 获取项目的所有成员
          const members = await this.prisma.projectMember.findMany({
            where: {
              projectId: project.id,
            },
            include: {
              role: true,
              user: {
                select: {
                  id: true,
                },
              },
            },
          });

          // 预热每个成员的访问角色
          for (const member of members) {
            const accessRole = this.mapRoleToAccessRole(member.role.name);
            await this.redisCacheService.cacheNodeAccessRole(
              member.user.id,
              project.id,
              accessRole,
            );
          }

          // 预热项目所有者的访问角色
          await this.redisCacheService.cacheNodeAccessRole(
            project.ownerId,
            project.id,
            NodeAccessRole.OWNER,
          );

          this.logger.debug(`预热项目 ${project.id} 的成员权限成功，共 ${members.length} 个成员`);
        } catch (error) {
          this.logger.error(`预热项目 ${project.id} 的成员权限失败: ${error.message}`);
        }
      }

      this.logger.log(`活跃项目成员权限预热完成`);
    } catch (error) {
      this.logger.error(`预热活跃项目失败: ${error.message}`, error.stack);
    }
  }

  /**
   * 根据角色获取权限列表
   */
  private getPermissionsByRole(role: string): Permission[] {
    const rolePermissions: Record<string, Permission[]> = {
      ADMIN: [
        Permission.USER_READ,
        Permission.USER_WRITE,
        Permission.USER_DELETE,
        Permission.USER_ADMIN,
        Permission.PROJECT_CREATE,
        Permission.PROJECT_READ,
        Permission.PROJECT_WRITE,
        Permission.PROJECT_DELETE,
        Permission.PROJECT_ADMIN,
        Permission.PROJECT_MEMBER_MANAGE,
        Permission.FILE_CREATE,
        Permission.FILE_READ,
        Permission.FILE_WRITE,
        Permission.FILE_DELETE,
        Permission.FILE_SHARE,
        Permission.FILE_DOWNLOAD,
        Permission.SYSTEM_ADMIN,
        Permission.SYSTEM_MONITOR,
      ],
      USER: [
        Permission.PROJECT_CREATE,
        Permission.PROJECT_READ,
        Permission.FILE_CREATE,
        Permission.FILE_READ,
        Permission.FILE_WRITE,
        Permission.FILE_SHARE,
        Permission.FILE_DOWNLOAD,
      ],
    };

    return rolePermissions[role] || [];
  }

  /**
   * 将角色名称映射到访问角色
   */
  private mapRoleToAccessRole(roleName: string): NodeAccessRole {
    const roleMap: Record<string, NodeAccessRole> = {
      PROJECT_OWNER: NodeAccessRole.OWNER,
      PROJECT_ADMIN: NodeAccessRole.ADMIN,
      PROJECT_MEMBER: NodeAccessRole.MEMBER,
      PROJECT_EDITOR: NodeAccessRole.EDITOR,
      PROJECT_VIEWER: NodeAccessRole.VIEWER,
    };

    return roleMap[roleName] || NodeAccessRole.VIEWER;
  }

  /**
   * 手动触发缓存预热
   */
  async manualWarmup(): Promise<{
    success: boolean;
    message: string;
    duration: number;
  }> {
    const startTime = Date.now();

    try {
      await this.warmupCache();
      const duration = Date.now() - startTime;

      return {
        success: true,
        message: '缓存预热成功',
        duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;

      return {
        success: false,
        message: `缓存预热失败: ${error.message}`,
        duration,
      };
    }
  }

  /**
   * 预热指定用户的缓存
   */
  async warmupUser(userId: string): Promise<void> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          role: true,
        },
      });

      if (!user) {
        throw new Error(`用户 ${userId} 不存在`);
      }

      // 缓存用户角色
      await this.redisCacheService.cacheUserRole(user.id, user.role);

      // 缓存用户权限
      const permissions = this.getPermissionsByRole(user.role.name);
      await this.redisCacheService.cacheUserPermissions(user.id, permissions);

      this.logger.log(`预热用户 ${userId} 的缓存成功`);
    } catch (error) {
      this.logger.error(`预热用户 ${userId} 的缓存失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 预热指定项目的缓存
   */
  async warmupProject(projectId: string): Promise<void> {
    try {
      const project = await this.prisma.fileSystemNode.findUnique({
        where: { id: projectId, isRoot: true },
        select: {
          id: true,
          ownerId: true,
        },
      });

      if (!project) {
        throw new Error(`项目 ${projectId} 不存在`);
      }

      // 获取项目的所有成员
      const members = await this.prisma.projectMember.findMany({
        where: {
          projectId: project.id,
        },
        include: {
          role: true,
          user: {
            select: {
              id: true,
            },
          },
        },
      });

      // 预热每个成员的访问角色
      for (const member of members) {
        const accessRole = this.mapRoleToAccessRole(member.role.name);
        await this.redisCacheService.cacheNodeAccessRole(
          member.user.id,
          project.id,
          accessRole,
        );
      }

      // 预热项目所有者的访问角色
      await this.redisCacheService.cacheNodeAccessRole(
        project.ownerId,
        project.id,
        NodeAccessRole.OWNER,
      );

      this.logger.log(`预热项目 ${projectId} 的缓存成功，共 ${members.length} 个成员`);
    } catch (error) {
      this.logger.error(`预热项目 ${projectId} 的缓存失败: ${error.message}`, error.stack);
      throw error;
    }
  }
}