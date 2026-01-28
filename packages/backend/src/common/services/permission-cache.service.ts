import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';
import { SystemPermission } from '../enums/permissions.enum';

/**
 * 缓存失效事件类型
 */
interface CacheInvalidationEvent {
  type: 'user';
  id: string;
  timestamp: number;
}

@Injectable()
export class PermissionCacheService implements OnModuleDestroy {
  private readonly logger = new Logger(PermissionCacheService.name);
  private readonly cache = new Map<string, any>();
  private readonly cacheExpiry = new Map<string, number>();
  private readonly defaultTTL = 5 * 60 * 1000; // 5分钟
  private readonly CHANNEL_PREFIX = 'permission:cache:invalidation';

  constructor(@InjectRedis() private readonly redis: Redis) {
    this.subscribeToInvalidationEvents();
  }

  async onModuleDestroy() {
    // 清理订阅
    await this.redis.unsubscribe(`${this.CHANNEL_PREFIX}:user`);
  }

  /**
   * 订阅缓存失效事件
   */
  private async subscribeToInvalidationEvents() {
    try {
      const subscriber = this.redis.duplicate();

      // 订阅用户缓存失效事件
      subscriber.subscribe(`${this.CHANNEL_PREFIX}:user`, (err) => {
        if (err) {
          this.logger.error(`订阅用户缓存失效事件失败: ${err.message}`);
        }
      });

      // 处理消息
      subscriber.on('message', (channel, message) => {
        try {
          const event: CacheInvalidationEvent = JSON.parse(message);
          this.handleInvalidationEvent(event);
        } catch (error) {
          this.logger.error(`处理缓存失效事件失败: ${error.message}`);
        }
      });

      this.logger.log('缓存失效事件订阅已启动');
    } catch (error) {
      this.logger.error(`订阅缓存失效事件失败: ${error.message}`);
    }
  }

  /**
   * 处理缓存失效事件
   * 忽略超过 5 秒的事件，防止处理过期的本地发布事件
   */
  private handleInvalidationEvent(event: CacheInvalidationEvent) {
    try {
      // 忽略超过 5 秒的事件，防止无限循环
      const eventAge = Date.now() - event.timestamp;
      if (eventAge > 5000) {
        this.logger.debug(
          `忽略过期缓存失效事件: ${event.type}:${event.id} (age: ${eventAge}ms)`
        );
        return;
      }

      if (event.type === 'user') {
        this.clearUserCacheInternal(event.id);
      }
      this.logger.debug(`处理缓存失效事件: ${event.type}:${event.id}`);
    } catch (error) {
      this.logger.error(`处理缓存失效事件失败: ${error.message}`);
    }
  }

  /**
   * 发布缓存失效事件
   */
  private async publishInvalidationEvent(
    type: 'user',
    id: string
  ): Promise<void> {
    try {
      const event: CacheInvalidationEvent = {
        type,
        id,
        timestamp: Date.now(),
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
    type: 'user',
    userId: string,
    permission?: SystemPermission
  ): string {
    return `${type}:${userId}${permission ? `:${permission}` : ''}`;
  }

  /**
   * 设置缓存
   */
  set<T>(key: string, value: T, ttl: number = this.defaultTTL): void {
    this.cache.set(key, value);
    this.cacheExpiry.set(key, Date.now() + ttl);
  }

  /**
   * 获取缓存
   */
  get<T>(key: string): T | null {
    const expiry = this.cacheExpiry.get(key);
    if (!expiry || Date.now() > expiry) {
      this.delete(key);
      return null;
    }
    return this.cache.get(key) || null;
  }

  /**
   * 删除缓存
   */
  delete(key: string): void {
    this.cache.delete(key);
    this.cacheExpiry.delete(key);
  }

  /**
   * 清除用户相关缓存（对外接口）
   */
  async clearUserCache(userId: string): Promise<void> {
    // 先发布事件（不触发本地处理）
    await this.publishInvalidationEvent('user', userId);
    // 然后执行本地清理
    this.clearUserCacheInternal(userId);
  }

  /**
   * 清除用户相关缓存（内部实现，不发布事件）
   */
  private clearUserCacheInternal(userId: string): void {
    const keysToDelete: string[] = [];

    for (const key of this.cache.keys()) {
      if (key.includes(`:${userId}:`) || key.endsWith(`:${userId}`)) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach((key) => this.delete(key));
    this.logger.log(`清除用户 ${userId} 的权限缓存`);
  }

  /**
   * 缓存用户系统权限
   */
  cacheUserPermissions(userId: string, permissions: SystemPermission[]): void {
    const key = this.generateCacheKey('user', userId);
    this.set(key, permissions);
  }

  /**
   * 获取用户系统权限缓存
   */
  getUserPermissions(userId: string): SystemPermission[] | null {
    const key = this.generateCacheKey('user', userId);
    return this.get<SystemPermission[]>(key);
  }

  /**
   * 缓存用户角色
   */
  cacheUserRole(userId: string, role: string): void {
    const key = `role:user:${userId}`;
    this.set(key, role, 10 * 60 * 1000); // 用户角色缓存10分钟
  }

  /**
   * 获取用户角色缓存
   */
  getUserRole(userId: string): string | null {
    const key = `role:user:${userId}`;
    return this.get<string>(key);
  }

  /**
   * 清理过期缓存
   */
  cleanup(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [key, expiry] of this.cacheExpiry.entries()) {
      if (now > expiry) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach((key) => {
      this.cache.delete(key);
      this.cacheExpiry.delete(key);
    });

    if (keysToDelete.length > 0) {
      this.logger.log(`清理了 ${keysToDelete.length} 个过期的权限缓存`);
    }
  }

  /**
   * 获取缓存统计信息
   */
  getStats(): {
    totalEntries: number;
    expiredEntries: number;
    memoryUsage: string;
  } {
    const now = Date.now();
    let expiredCount = 0;

    for (const expiry of this.cacheExpiry.values()) {
      if (now > expiry) {
        expiredCount++;
      }
    }

    return {
      totalEntries: this.cache.size,
      expiredEntries: expiredCount,
      memoryUsage: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
    };
  }
}
