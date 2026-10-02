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
  Logger,
  OnModuleInit,
  OnModuleDestroy,
  Inject,
  Optional,
  forwardRef,
} from '@nestjs/common';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';
import { SystemPermission } from '../../common/enums/permissions.enum';
import { MultiLevelCacheService } from '../../cache-architecture/services/multi-level-cache.service';
import { CacheKeyUtil } from '../../cache-architecture/utils/cache-key.utils';
import {
  CacheVersionService,
  CacheVersionType,
} from '../../cache-architecture/services/cache-version.service';

/**
 * 缓存失效事件
 */
interface CacheInvalidationEvent {
  type: 'user' | 'project' | 'role' | 'all' | 'pattern';
  id?: string;
  pattern?: string;
  timestamp: number;
  source?: string;
}

@Injectable()
export class PermissionCacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PermissionCacheService.name);
  private readonly defaultTTL = 5 * 60; // 5 分钟
  private readonly CHANNEL_PREFIX = 'permission:cache:invalidation';
  private subscriber: Redis | null = null;

  constructor(
    @InjectRedis() private readonly redis: Redis,
    @Inject(forwardRef(() => MultiLevelCacheService))
    private readonly multiLevelCache: MultiLevelCacheService,
    @Optional()
    @Inject(forwardRef(() => CacheVersionService))
    private readonly cacheVersionService?: CacheVersionService
  ) {
    this.setupVersionControl();
  }

  /**
   * 模块初始化时建立订阅（不阻塞启动）。
   * 注意：不能在构造器中发起订阅——subscribe 命令会触发 ioredis 自动连接，
   * Redis 不可达时若客户端没有 error 监听器，将抛出未处理的 error 事件导致进程崩溃
   * （实例：Redis 未启动时 pnpm build 的 generate:swagger 直接崩溃）。
   */
  async onModuleInit() {
    this.subscribeToInvalidationEvents();
  }

  async onModuleDestroy() {
    // 取消订阅
    if (this.subscriber) {
      await Promise.all([
        this.subscriber.unsubscribe(`${this.CHANNEL_PREFIX}:user`),
        this.subscriber.unsubscribe(`${this.CHANNEL_PREFIX}:project`),
        this.subscriber.unsubscribe(`${this.CHANNEL_PREFIX}:role`),
        this.subscriber.unsubscribe(`${this.CHANNEL_PREFIX}:all`),
        this.subscriber.unsubscribe(`${this.CHANNEL_PREFIX}:pattern`),
      ]);
    }
  }

  /**
   * 设置版本控制
   */
  private setupVersionControl(): void {
    // 用户权限版本控制
    this.multiLevelCache.enableVersionControl(
      CacheVersionType.USER_PERMISSIONS
    );

    this.logger.debug('权限缓存版本控制已启用');
  }

  /**
   * 订阅缓存失效事件
   */
  private async subscribeToInvalidationEvents() {
    try {
      this.subscriber = this.redis.duplicate();

      // 必须挂 error 监听：subscribe 会触发自动连接，Redis 不可达时 ioredis
      // 发出 error 事件，无监听器会被 Node 视为未处理错误事件直接崩溃进程
      this.subscriber.on('error', (err) => {
        this.logger.error(`缓存失效订阅客户端错误: ${err.message}`);
      });

      // 订阅各种类型的缓存失效事件
      const channels = [
        `${this.CHANNEL_PREFIX}:user`,
        `${this.CHANNEL_PREFIX}:project`,
        `${this.CHANNEL_PREFIX}:role`,
        `${this.CHANNEL_PREFIX}:all`,
        `${this.CHANNEL_PREFIX}:pattern`,
      ];

      // 分别订阅每个频道
      for (const channel of channels) {
        await this.subscriber.subscribe(channel, (err) => {
          if (err) {
            this.logger.error(
              `订阅缓存失效事件失败: ${channel} - ${err.message}`
            );
          }
        });
      }

      // 处理消息
      this.subscriber.on('message', (channel, message) => {
        try {
          const event: CacheInvalidationEvent = JSON.parse(message);
          this.handleInvalidationEvent(event);
        } catch (error: unknown) {
          this.logger.error(
            `处理缓存失效事件失败: ${(error as Error).message}`
          );
        }
      });

      this.logger.log('缓存失效事件订阅已启动');
    } catch (error: unknown) {
      this.logger.error(`订阅缓存失效事件失败: ${(error as Error).message}`);
    }
  }

  /**
   * 处理缓存失效事件
   * 只处理 5 秒内的事件，防止过期的事件在重启的地方再次处理
   */
  private handleInvalidationEvent(event: CacheInvalidationEvent) {
    try {
      // 只处理 5 秒内的事件，防止循环
      const eventAge = Date.now() - event.timestamp;
      if (eventAge > 5000) {
        this.logger.debug(
          `忽略过期缓存失效事件: ${event.type}:${event.id || event.pattern || 'all'} (age: ${eventAge}ms)`
        );
        return;
      }

      switch (event.type) {
        case 'user':
          if (event.id) {
            // fire-and-forget：内部方法捕获异常，不会产生 unhandledRejection
            void this.clearUserCacheInternal(event.id);
          }
          break;
        case 'project':
          if (event.id) {
            // fire-and-forget：内部方法捕获异常，不会产生 unhandledRejection
            void this.clearProjectCacheInternal(event.id);
          }
          break;
        case 'role':
          if (event.id) {
            // fire-and-forget：内部方法捕获异常，不会产生 unhandledRejection
            void this.clearRoleCacheInternal(event.id);
          }
          break;
        case 'all':
          // fire-and-forget：内部方法捕获异常，不会产生 unhandledRejection
          void this.clearAllCacheInternal();
          break;
        case 'pattern': {
          // 兼容旧实例广播的 {type:'pattern', id} 事件（pattern 字段为独立字段后引入）
          const pattern = event.pattern ?? event.id;
          if (pattern) {
            // fire-and-forget：clearPatternInternal 内部捕获异常，不会产生 unhandledRejection
            void this.clearPatternInternal(pattern);
          }
          break;
        }
      }

      this.logger.debug(`处理缓存失效事件: ${event.type}:${event.id || event.pattern || 'all'}`);
    } catch (error) {
      this.logger.error(`处理缓存失效事件失败: ${error.message}`);
    }
  }

  /**
   * 发布缓存失效事件
   */
  private async publishInvalidationEvent(
    type: 'user' | 'project' | 'role' | 'all' | 'pattern',
    id?: string,
    source?: string,
    pattern?: string
  ): Promise<void> {
    try {
      const event: CacheInvalidationEvent = {
        type,
        id,
        pattern,
        timestamp: Date.now(),
        source,
      };

      await this.redis.publish(
        `${this.CHANNEL_PREFIX}:${type}`,
        JSON.stringify(event)
      );
    } catch (error) {
      this.logger.error(`发布缓存失效事件失败: ${error.message}`);
    }
  }

  /**
   * 设置缓存
   */
  async set<T>(
    key: string,
    value: T,
    ttl: number = this.defaultTTL
  ): Promise<void> {
    await this.multiLevelCache.set(key, value, ttl);
  }

  /**
   * 获取缓存
   */
  async get<T>(key: string): Promise<T | null> {
    return this.multiLevelCache.get<T>(key);
  }

  /**
   * 删除缓存
   */
  async delete(key: string): Promise<void> {
    await this.multiLevelCache.delete(key);
  }

  /**
   * 清除用户缓存（公共接口）
   */
  async clearUserCache(userId: string): Promise<void> {
    // 更新版本号
    if (this.cacheVersionService) {
      await this.cacheVersionService.updateVersion(
        CacheVersionType.USER_PERMISSIONS,
        userId,
        `User ${userId} permissions updated`
      );
    }

    // 先发布事件，确保其他实例也清除缓存
    await this.publishInvalidationEvent('user', userId, 'clearUserCache');
    // 然后执行本地清除（await：删除完成才算清除生效）
    await this.clearUserCacheInternal(userId);
  }

  /**
   * 清除用户缓存（内部实现，不发布事件）
   * 使用多级缓存进行删除，失败仅记录不抛出
   */
  private async clearUserCacheInternal(userId: string): Promise<void> {
    const userIdNum = parseInt(userId, 10);
    // 生成需要删除的缓存键
    const keysToDelete = [
      CacheKeyUtil.userPermissions(userIdNum),
      CacheKeyUtil.user(userIdNum),
      // 删除 is_admin 缓存
      `is_admin:${userId}`,
      // 删除所有单个权限缓存
      ...Object.values(SystemPermission).map(
        (perm) => `system_perm:${userId}:${perm}`
      ),
    ];

    // 使用多级缓存进行删除
    try {
      await this.multiLevelCache.deleteMany(keysToDelete);
    } catch (error: unknown) {
      this.logger.error(
        `清除用户缓存失败: ${userId} - ${(error as Error).message}`
      );
    }
    this.logger.debug(`清除用户 ${userId} 的 ${keysToDelete.length} 个缓存`);
  }

  /**
   * 清除项目缓存（公共接口）
   */
  async clearProjectCache(projectId: string): Promise<void> {
    // 更新版本号
    if (this.cacheVersionService) {
      await this.cacheVersionService.updateVersion(
        CacheVersionType.PROJECT_PERMISSIONS,
        projectId,
        `Project ${projectId} permissions updated`
      );
    }

    // 先发布事件
    await this.publishInvalidationEvent(
      'project',
      projectId,
      'clearProjectCache'
    );
    // 然后执行本地清除（await：删除完成才算清除生效）
    await this.clearProjectCacheInternal(projectId);
  }

  /**
   * 清除项目缓存（内部实现，不发布事件）
   * 失败仅记录不抛出
   */
  private async clearProjectCacheInternal(projectId: string): Promise<void> {
    const projectIdNum = parseInt(projectId, 10);
    // 生成需要删除的缓存键
    const keysToDelete = [
      CacheKeyUtil.projectPermissions(projectIdNum),
      CacheKeyUtil.project(projectIdNum),
    ];

    try {
      await this.multiLevelCache.deleteMany(keysToDelete);
    } catch (error: unknown) {
      this.logger.error(
        `清除项目缓存失败: ${projectId} - ${(error as Error).message}`
      );
    }
    this.logger.debug(`清除项目 ${projectId} 的 ${keysToDelete.length} 个缓存`);
  }

  /**
   * 清除角色缓存（公共接口）
   */
  async clearRoleCache(roleName: string): Promise<void> {
    // 更新角色权限版本
    if (this.cacheVersionService) {
      await this.cacheVersionService.updateVersion(
        CacheVersionType.ROLE_PERMISSIONS,
        roleName,
        `Role ${roleName} permissions updated`
      );

      // 同时更新用户权限版本，使 system_perm 缓存失效
      await this.cacheVersionService.updateVersion(
        CacheVersionType.USER_PERMISSIONS,
        'global',
        `Role ${roleName} permissions updated, invalidating all user permission caches`
      );
    }

    // 先发布事件
    await this.publishInvalidationEvent('role', roleName, 'clearRoleCache');
    // 然后执行本地清除（await：删除完成才算清除生效）
    await this.clearRoleCacheInternal(roleName);
  }

  /**
   * 清除角色缓存（内部实现，不发布事件）
   * 失败仅记录不抛出
   */
  private async clearRoleCacheInternal(roleName: string): Promise<void> {
    const keysToDelete = [
      CacheKeyUtil.custom('role', roleName),
      // 删除该角色的权限缓存
      `role:permissions:${roleName}`,
      `role:path:${roleName}`,
    ];

    try {
      await this.multiLevelCache.deleteMany(keysToDelete);
    } catch (error: unknown) {
      this.logger.error(
        `清除角色缓存失败: ${roleName} - ${(error as Error).message}`
      );
    }
    this.logger.debug(`清除角色 ${roleName} 的 ${keysToDelete.length} 个缓存`);
  }

  /**
   * 清除所有缓存（内部实现，不发布事件）
   * 保留 'all' 频道订阅：滚动部署期间旧实例仍可能广播 all 事件，失败仅记录不抛出
   */
  private async clearAllCacheInternal(): Promise<void> {
    try {
      await this.multiLevelCache.clear();
    } catch (error: unknown) {
      this.logger.error(`清除所有缓存失败: ${(error as Error).message}`);
    }
    this.logger.debug('清除所有缓存');
  }

  /**
   * 根据模式清除缓存（内部实现，不发布事件）
   * 保留 'pattern' 频道订阅：滚动部署期间旧实例仍可能广播 pattern 事件，失败仅记录不抛出
   */
  private async clearPatternInternal(pattern: string): Promise<void> {
    try {
      await this.multiLevelCache.deleteByPattern(pattern);
      this.logger.debug(`根据模式清除缓存: ${pattern}`);
    } catch (error: unknown) {
      this.logger.error(
        `根据模式清除缓存失败: ${pattern} - ${(error as Error).message}`
      );
    }
  }

  /**
   * 清理过期缓存（多级缓存自动清理，这里返回 0）
   * @returns 清理的条目数量
   */
  async cleanup(): Promise<number> {
    // 清理过期的版本
    if (this.cacheVersionService) {
      const cleaned = await this.cacheVersionService.cleanupExpiredVersions(
        CacheVersionType.USER_PERMISSIONS
      );
      return cleaned;
    }
    return 0;
  }

  /**
   * 获取缓存统计信息
   */
  async getStats(): Promise<{
    totalEntries: number;
    capacity: number;
    memoryUsage: string;
    hitRate: number;
  }> {
    const stats = await this.multiLevelCache.getStats();
    return {
      totalEntries:
        stats.levels.L1.size + stats.levels.L2.size,
      capacity: 1000,
      memoryUsage: `${Math.round(stats.summary.totalMemoryUsage / 1024 / 1024)}MB`,
      hitRate: stats.summary.overallHitRate,
    };
  }
}
