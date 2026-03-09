import {
  Injectable,
  Logger,
  OnModuleDestroy,
  Inject,
  Optional,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';
import { SystemPermission, ProjectPermission } from '../enums/permissions.enum';
import { MultiLevelCacheService } from '../../cache-architecture/services/multi-level-cache.service';
import { CacheKeyUtil } from '../../cache-architecture/utils/cache-key.util';
import {
  CacheVersionService,
  CacheVersionType,
} from '../../cache-architecture/services/cache-version.service';

/**
 * 缓存失效事件
 */
interface CacheInvalidationEvent {
  type: 'user' | 'project' | 'role' | 'all';
  id?: string;
  timestamp: number;
  source?: string;
}

@Injectable()
export class PermissionCacheService implements OnModuleDestroy {
  private readonly logger = new Logger(PermissionCacheService.name);
  private readonly defaultTTL = 5 * 60; // 5 分钟
  private readonly CHANNEL_PREFIX = 'permission:cache:invalidation';
  private subscriber: Redis | null = null;

  constructor(
    @InjectRedis() private readonly redis: Redis,
    private readonly multiLevelCache: MultiLevelCacheService,
    @Optional()
    @Inject(CacheVersionService)
    private readonly cacheVersionService?: CacheVersionService
  ) {
    this.subscribeToInvalidationEvents();
    this.setupVersionControl();
  }

  async onModuleDestroy() {
    // 取消订阅
    if (this.subscriber) {
      await Promise.all([
        this.subscriber.unsubscribe(`${this.CHANNEL_PREFIX}:user`),
        this.subscriber.unsubscribe(`${this.CHANNEL_PREFIX}:project`),
        this.subscriber.unsubscribe(`${this.CHANNEL_PREFIX}:role`),
        this.subscriber.unsubscribe(`${this.CHANNEL_PREFIX}:all`),
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

      // 订阅各种类型的缓存失效事件
      const channels = [
        `${this.CHANNEL_PREFIX}:user`,
        `${this.CHANNEL_PREFIX}:project`,
        `${this.CHANNEL_PREFIX}:role`,
        `${this.CHANNEL_PREFIX}:all`,
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
          `忽略过期缓存失效事件: ${event.type}:${event.id || 'all'} (age: ${eventAge}ms)`
        );
        return;
      }

      switch (event.type) {
        case 'user':
          if (event.id) {
            this.clearUserCacheInternal(event.id);
          }
          break;
        case 'project':
          if (event.id) {
            this.clearProjectCacheInternal(event.id);
          }
          break;
        case 'role':
          if (event.id) {
            this.clearRoleCacheInternal(event.id);
          }
          break;
        case 'all':
          this.clearAllCacheInternal();
          break;
      }

      this.logger.debug(`处理缓存失效事件: ${event.type}:${event.id || 'all'}`);
    } catch (error) {
      this.logger.error(`处理缓存失效事件失败: ${error.message}`);
    }
  }

  /**
   * 发布缓存失效事件
   */
  private async publishInvalidationEvent(
    type: 'user' | 'project' | 'role' | 'all',
    id?: string,
    source?: string
  ): Promise<void> {
    try {
      const event: CacheInvalidationEvent = {
        type,
        id,
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
   * 生成缓存键
   */
  private generateCacheKey(
    type: 'user' | 'project',
    id: string,
    permission?: SystemPermission | ProjectPermission
  ): string {
    const idNum = parseInt(id, 10);

    switch (type) {
      case 'user':
        return CacheKeyUtil.userPermissions(idNum);
      case 'project':
        return CacheKeyUtil.projectPermissions(idNum);
      default:
        throw new InternalServerErrorException(`不支持的缓存类型: ${type}`);
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
    // 然后执行本地清除
    this.clearUserCacheInternal(userId);
  }

  /**
   * 清除用户缓存（内部实现，不发布事件）
   * 使用多级缓存进行删除
   */
  private clearUserCacheInternal(userId: string): void {
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
    this.multiLevelCache.deleteMany(keysToDelete);
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
    // 然后执行本地清除
    this.clearProjectCacheInternal(projectId);
  }

  /**
   * 清除项目缓存（内部实现）
   */
  private clearProjectCacheInternal(projectId: string): void {
    const projectIdNum = parseInt(projectId, 10);
    // 生成需要删除的缓存键
    const keysToDelete = [
      CacheKeyUtil.projectPermissions(projectIdNum),
      CacheKeyUtil.project(projectIdNum),
    ];

    this.multiLevelCache.deleteMany(keysToDelete);
    this.logger.debug(`清除项目 ${projectId} 的 ${keysToDelete.length} 个缓存`);
  }

  /**
   * 清除角色缓存（公共接口）
   */
  async clearRoleCache(roleName: string): Promise<void> {
    // 更新版本号
    if (this.cacheVersionService) {
      await this.cacheVersionService.updateVersion(
        CacheVersionType.ROLE_PERMISSIONS,
        roleName,
        `Role ${roleName} permissions updated`
      );
    }

    // 先发布事件
    await this.publishInvalidationEvent('role', roleName, 'clearRoleCache');
    // 然后执行本地清除
    this.clearRoleCacheInternal(roleName);
  }

  /**
   * 清除角色缓存（内部实现）
   */
  private clearRoleCacheInternal(roleName: string): void {
    const keysToDelete = [
      CacheKeyUtil.custom('role', roleName),
      // 删除该角色的权限缓存
      `role:permissions:${roleName}`,
      `role:path:${roleName}`,
    ];

    this.multiLevelCache.deleteMany(keysToDelete);
    this.logger.debug(`清除角色 ${roleName} 的 ${keysToDelete.length} 个缓存`);
  }

  /**
   * 清除所有缓存（公共接口）
   */
  async clearAllCache(): Promise<void> {
    // 更新所有版本号
    if (this.cacheVersionService) {
      await Promise.all([
        this.cacheVersionService.updateVersion(
          CacheVersionType.USER_PERMISSIONS,
          undefined,
          'All user permissions cleared'
        ),
        this.cacheVersionService.updateVersion(
          CacheVersionType.PROJECT_PERMISSIONS,
          undefined,
          'All project permissions cleared'
        ),
        this.cacheVersionService.updateVersion(
          CacheVersionType.ROLE_PERMISSIONS,
          undefined,
          'All role permissions cleared'
        ),
      ]);
    }

    // 先发布事件
    await this.publishInvalidationEvent('all', undefined, 'clearAllCache');
    // 然后执行本地清除
    this.clearAllCacheInternal();
  }

  /**
   * 清除所有缓存（内部实现）
   */
  private clearAllCacheInternal(): void {
    this.multiLevelCache.clear();
    this.logger.debug('清除所有缓存');
  }

  /**
   * 批量清除用户缓存
   */
  async clearMultipleUserCache(userIds: string[]): Promise<void> {
    await Promise.all(userIds.map((userId) => this.clearUserCache(userId)));
    this.logger.debug(`批量清除 ${userIds.length} 个用户的缓存`);
  }

  /**
   * 批量清除项目缓存
   */
  async clearMultipleProjectCache(projectIds: string[]): Promise<void> {
    await Promise.all(
      projectIds.map((projectId) => this.clearProjectCache(projectId))
    );
    this.logger.debug(`批量清除 ${projectIds.length} 个项目的缓存`);
  }

  /**
   * 缓存用户系统权限
   */
  async cacheUserPermissions(
    userId: string,
    permissions: SystemPermission[]
  ): Promise<void> {
    const key = this.generateCacheKey('user', userId);
    await this.set(key, permissions);
  }

  /**
   * 获取用户系统权限缓存
   */
  async getUserPermissions(userId: string): Promise<SystemPermission[] | null> {
    const key = this.generateCacheKey('user', userId);
    return this.get<SystemPermission[]>(key);
  }

  /**
   * 缓存用户角色
   */
  async cacheUserRole(userId: string, role: string): Promise<void> {
    const key = CacheKeyUtil.user(parseInt(userId, 10));
    await this.set(key, role, 10 * 60); // 用户角色缓存 10 分钟
  }

  /**
   * 获取用户角色缓存
   */
  async getUserRole(userId: string): Promise<string | null> {
    const key = CacheKeyUtil.user(parseInt(userId, 10));
    return this.get<string>(key);
  }

  /**
   * 缓存项目权限
   */
  async cacheProjectPermissions(
    projectId: string,
    permissions: ProjectPermission[]
  ): Promise<void> {
    const key = this.generateCacheKey('project', projectId);
    await this.set(key, permissions);
  }

  /**
   * 获取项目权限缓存
   */
  async getProjectPermissions(
    projectId: string
  ): Promise<ProjectPermission[] | null> {
    const key = this.generateCacheKey('project', projectId);
    return this.get<ProjectPermission[]>(key);
  }

  /**
   * 获取或加载用户权限
   */
  async getOrLoadUserPermissions(
    userId: string,
    loader: () => Promise<SystemPermission[]>
  ): Promise<SystemPermission[]> {
    const key = this.generateCacheKey('user', userId);
    return this.multiLevelCache.getOrLoad(key, loader);
  }

  /**
   * 获取或加载项目权限
   */
  async getOrLoadProjectPermissions(
    projectId: string,
    loader: () => Promise<ProjectPermission[]>
  ): Promise<ProjectPermission[]> {
    const key = this.generateCacheKey('project', projectId);
    return this.multiLevelCache.getOrLoad(key, loader);
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
   * 获取缓存大小
   */
  async size(): Promise<number> {
    const stats = await this.multiLevelCache.getStats();
    return stats.summary.totalRequests;
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
        stats.levels.L1.size + stats.levels.L2.size + stats.levels.L3.size,
      capacity: 1000,
      memoryUsage: `${Math.round(stats.summary.totalMemoryUsage / 1024 / 1024)}MB`,
      hitRate: stats.summary.overallHitRate,
    };
  }
}
