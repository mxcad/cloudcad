///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement
// 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
// This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import {
  Injectable,
  Logger,
  OnModuleInit,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../../database/database.service';
import { RedisCacheService } from './redis-cache.service';
import { SystemPermission, ProjectRole } from '../enums/permissions.enum';

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
  private readonly maxUsersToWarmup: number;
  private readonly maxProjectsToWarmup: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: DatabaseService,
    private readonly redisCacheService: RedisCacheService
  ) {
    const cacheWarmup = this.configService.get('cacheWarmup', { infer: true });
    this.maxUsersToWarmup = cacheWarmup.maxUsers;
    this.maxProjectsToWarmup = cacheWarmup.maxProjects;
  }

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
        take: this.maxUsersToWarmup,
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
          await this.redisCacheService.cacheUserPermissions(
            user.id,
            permissions
          );

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
        take: this.maxProjectsToWarmup,
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
              projectRole: true,
              user: {
                select: {
                  id: true,
                },
              },
            },
          });

          // 预热每个成员的访问角色
          for (const member of members) {
            const accessRole = this.mapRoleToAccessRole(
              member.projectRole.name
            );
            await this.redisCacheService.cacheNodeAccessRole(
              member.user.id,
              project.id,
              accessRole
            );
          }

          // 预热项目所有者的访问角色
          await this.redisCacheService.cacheNodeAccessRole(
            project.ownerId,
            project.id,
            ProjectRole.OWNER
          );

          this.logger.debug(
            `预热项目 ${project.id} 的成员权限成功，共 ${members.length} 个成员`
          );
        } catch (error) {
          this.logger.error(
            `预热项目 ${project.id} 的成员权限失败: ${error.message}`
          );
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
  private getPermissionsByRole(role: string): SystemPermission[] {
    const rolePermissions: Record<string, SystemPermission[]> = {
      ADMIN: [
        SystemPermission.SYSTEM_USER_READ,
        SystemPermission.SYSTEM_USER_CREATE,
        SystemPermission.SYSTEM_USER_UPDATE,
        SystemPermission.SYSTEM_USER_DELETE,
        SystemPermission.SYSTEM_ROLE_READ,
        SystemPermission.SYSTEM_ROLE_CREATE,
        SystemPermission.SYSTEM_ROLE_UPDATE,
        SystemPermission.SYSTEM_ROLE_DELETE,
        SystemPermission.SYSTEM_ROLE_PERMISSION_MANAGE,
        SystemPermission.SYSTEM_FONT_READ,
        SystemPermission.SYSTEM_FONT_UPLOAD,
        SystemPermission.SYSTEM_FONT_DELETE,
        SystemPermission.SYSTEM_FONT_DOWNLOAD,
        SystemPermission.SYSTEM_ADMIN,
        SystemPermission.SYSTEM_MONITOR,
      ],
      USER: [],
    };

    return rolePermissions[role] || [];
  }

  /**
   * 将角色名称映射到访问角色
   */
  private mapRoleToAccessRole(roleName: string): ProjectRole {
    const roleMap: Record<string, ProjectRole> = {
      PROJECT_OWNER: ProjectRole.OWNER,
      PROJECT_ADMIN: ProjectRole.ADMIN,
      PROJECT_MEMBER: ProjectRole.MEMBER,
      PROJECT_EDITOR: ProjectRole.EDITOR,
      PROJECT_VIEWER: ProjectRole.VIEWER,
    };

    return roleMap[roleName] || ProjectRole.VIEWER;
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
        throw new NotFoundException(`用户 ${userId} 不存在`);
      }

      // 缓存用户角色
      await this.redisCacheService.cacheUserRole(user.id, user.role);

      // 缓存用户权限
      const permissions = this.getPermissionsByRole(user.role.name);
      await this.redisCacheService.cacheUserPermissions(user.id, permissions);

      this.logger.log(`预热用户 ${userId} 的缓存成功`);
    } catch (error) {
      this.logger.error(
        `预热用户 ${userId} 的缓存失败: ${error.message}`,
        error.stack
      );
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
        throw new NotFoundException(`项目 ${projectId} 不存在`);
      }

      // 获取项目的所有成员
      const members = await this.prisma.projectMember.findMany({
        where: {
          projectId: project.id,
        },
        include: {
          projectRole: true,
          user: {
            select: {
              id: true,
            },
          },
        },
      });

      // 预热每个成员的访问角色
      for (const member of members) {
        const accessRole = this.mapRoleToAccessRole(member.projectRole.name);
        await this.redisCacheService.cacheNodeAccessRole(
          member.user.id,
          project.id,
          accessRole
        );
      }

      // 预热项目所有者的访问角色
      await this.redisCacheService.cacheNodeAccessRole(
        project.ownerId,
        project.id,
        ProjectRole.OWNER
      );

      this.logger.log(
        `预热项目 ${projectId} 的缓存成功，共 ${members.length} 个成员`
      );
    } catch (error) {
      this.logger.error(
        `预热项目 ${projectId} 的缓存失败: ${error.message}`,
        error.stack
      );
      throw error;
    }
  }
}
