///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { Injectable, Logger } from '@nestjs/common';
import { IWarmupStrategy, WarmupResult } from './warmup.strategy';
import { DatabaseService } from '../../database/database.service';
import { RedisCacheService } from '../../common/services/redis-cache.service';
import { RolePermissionsMapper } from '../utils/role-permissions.mapper';

/**
 * 权限预热策略
 * 预热活跃用户的权限数据
 */
@Injectable()
export class PermissionStrategy implements IWarmupStrategy {
  readonly name = 'permissions';
  private readonly logger = new Logger(PermissionStrategy.name);
  private readonly maxUsersToWarmup = 100;

  constructor(
    private readonly prisma: DatabaseService,
    private readonly redisCache: RedisCacheService
  ) {}

  /**
   * 执行权限预热
   */
  async warmup(): Promise<WarmupResult> {
    const startTime = Date.now();

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

      let successCount = 0;
      for (const user of activeUsers) {
        try {
          // 缓存用户角色
          await this.redisCache.cacheUserRole(user.id, user.role);

          // 缓存用户权限（基于角色）
          const permissions = RolePermissionsMapper.getPermissionsByRole(user.role.name);
          await this.redisCache.cacheUserPermissions(user.id, permissions);

          successCount++;
        } catch (error) {
          this.logger.error(
            `预热用户 ${user.id} 的权限失败: ${error.message}`
          );
        }
      }

      const duration = Date.now() - startTime;
      this.logger.log(
        `活跃用户权限预热完成: ${successCount}/${activeUsers.length}，耗时 ${duration}ms`
      );

      return {
        success: true,
        count: successCount,
        duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      this.logger.error(`权限预热失败: ${errorMessage}`, error.stack);

      return {
        success: false,
        count: 0,
        duration,
        error: errorMessage,
      };
    }
  }
}
