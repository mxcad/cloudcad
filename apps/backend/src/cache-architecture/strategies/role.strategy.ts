///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { Injectable, Logger } from '@nestjs/common';
import { IWarmupStrategy, WarmupResult } from './warmup.strategy';
import { DatabaseService } from '../../database/database.service';
import { RedisCacheService } from '../../common/services/redis-cache.service';
import { ProjectRole } from '../../common/enums/permissions.enum';
import { ProjectRoleMapper } from '../utils/project-role.mapper';

/**
 * 角色预热策略
 * 预热项目成员的角色权限
 */
@Injectable()
export class RoleStrategy implements IWarmupStrategy {
  readonly name = 'roles';
  private readonly logger = new Logger(RoleStrategy.name);
  private readonly maxProjectsToWarmup = 50;

  constructor(
    private readonly prisma: DatabaseService,
    private readonly redisCache: RedisCacheService
  ) {}

  /**
   * 执行角色预热
   */
  async warmup(): Promise<WarmupResult> {
    const startTime = Date.now();

    try {
      // 获取最近更新的活跃项目
      const activeProjects = await this.prisma.fileSystemNode.findMany({
        where: {
          isRoot: true,
          deletedAt: null,
          libraryKey: null, // 排除公共资源库
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

      this.logger.log(`开始预热 ${activeProjects.length} 个活跃项目的成员角色`);

      let totalMembersCount = 0;

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
            const accessRole = ProjectRoleMapper.mapRoleToAccessRole(
              member.projectRole.name
            );
            await this.redisCache.cacheNodeAccessRole(
              member.user.id,
              project.id,
              accessRole
            );
          }

          // 预热项目所有者的访问角色
          await this.redisCache.cacheNodeAccessRole(
            project.ownerId,
            project.id,
            ProjectRole.OWNER
          );

          totalMembersCount += members.length;
        } catch (error) {
          this.logger.error(
            `预热项目 ${project.id} 的成员角色失败: ${error.message}`
          );
        }
      }

      const duration = Date.now() - startTime;
      this.logger.log(
        `活跃项目成员角色预热完成: ${totalMembersCount} 个成员，耗时 ${duration}ms`
      );

      return {
        success: true,
        count: totalMembersCount,
        duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      this.logger.error(`角色预热失败: ${errorMessage}`, error.stack);

      return {
        success: false,
        count: 0,
        duration,
        error: errorMessage,
      };
    }
  }
}
