import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ProjectRole, SystemPermission } from '../enums/permissions.enum';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';

/**
 * Redis 缓存服务
 *
 * 功能：
 * 1. 使用 Redis 存储权限缓存
 * 2. 支持缓存过期
 * 3. 支持缓存清理
 * 4. 提供缓存统计
 */
@Injectable()
export class RedisCacheService {
  private readonly logger = new Logger(RedisCacheService.name);
  private readonly KEY_PREFIX = 'permission:';
  private readonly defaultTTL: number;
  private readonly permissionTTL: number;

  constructor(
    private readonly configService: ConfigService,
    @InjectRedis() private readonly redis: Redis
  ) {
    const cacheTTL = this.configService.get('cacheTTL', { infer: true });
    this.defaultTTL = cacheTTL.default;
    this.permissionTTL = cacheTTL.permission;
  }

  /**
   * 生成缓存键
   */
  private generateCacheKey(
    type: 'user' | 'node' | 'role',
    userId: string,
    resourceId?: string
  ): string {
    if (type === 'user') {
      return `${this.KEY_PREFIX}user:${userId}`;
    } else if (type === 'node') {
      return `${this.KEY_PREFIX}node:${userId}:${resourceId}`;
    } else if (type === 'role') {
      return `${this.KEY_PREFIX}role:${type}:${userId}`;
    }
    return '';
  }

  /**
   * 设置缓存
   */
  async set<T>(
    key: string,
    value: T,
    ttl: number = this.defaultTTL
  ): Promise<void> {
    try {
      await this.redis.setex(key, ttl, JSON.stringify(value));
    } catch (error) {
      this.logger.error(`设置缓存失败: ${error.message}`, error.stack);
    }
  }

  /**
   * 获取缓存
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await this.redis.get(key);
      if (!value) {
        return null;
      }
      return JSON.parse(value) as T;
    } catch (error) {
      this.logger.error(`获取缓存失败: ${error.message}`, error.stack);
      return null;
    }
  }

  /**
   * 删除缓存
   */
  async delete(key: string): Promise<void> {
    try {
      await this.redis.del(key);
    } catch (error) {
      this.logger.error(`删除缓存失败: ${error.message}`, error.stack);
    }
  }

  /**
   * 清除用户相关缓存
   */
  async clearUserCache(userId: string): Promise<void> {
    try {
      const pattern = `${this.KEY_PREFIX}user:${userId}*`;
      const keys = await this.redis.keys(pattern);

      if (keys.length > 0) {
        await this.redis.del(...keys);
        this.logger.log(`清除用户 ${userId} 的权限缓存，共 ${keys.length} 个`);
      }
    } catch (error) {
      this.logger.error(`清除用户缓存失败: ${error.message}`, error.stack);
    }
  }

  /**
   * 清除节点相关缓存（项目/文件夹/文件）
   */
  async clearNodeCache(nodeId: string): Promise<void> {
    try {
      const pattern = `${this.KEY_PREFIX}node:*:${nodeId}`;
      const keys = await this.redis.keys(pattern);

      if (keys.length > 0) {
        await this.redis.del(...keys);
        this.logger.log(`清除节点 ${nodeId} 的权限缓存，共 ${keys.length} 个`);
      }
    } catch (error) {
      this.logger.error(`清除节点缓存失败: ${error.message}`, error.stack);
    }
  }

  /**
   * 清除项目缓存（向后兼容）
   * @deprecated 使用 clearNodeCache 代替
   */
  async clearProjectCache(projectId: string): Promise<void> {
    return this.clearNodeCache(projectId);
  }

  /**
   * 清除文件缓存（向后兼容）
   * @deprecated 使用 clearNodeCache 代替
   */
  async clearFileCache(fileId: string): Promise<void> {
    return this.clearNodeCache(fileId);
  }

  /**
   * 缓存用户权限
   */
  async cacheUserPermissions(
    userId: string,
    permissions: SystemPermission[]
  ): Promise<void> {
    const key = this.generateCacheKey('user', userId);
    await this.set(key, permissions, 10 * 60); // 用户权限缓存10分钟
  }

  /**
   * 获取用户权限缓存
   */
  async getUserPermissions(userId: string): Promise<SystemPermission[] | null> {
    const key = this.generateCacheKey('user', userId);
    return await this.get<SystemPermission[]>(key);
  }

  /**
   * 缓存节点访问权限（统一管理项目/文件夹/文件的访问权限）
   */
  async cacheNodeAccessRole(
    userId: string,
    nodeId: string,
    role: ProjectRole
  ): Promise<void> {
    const key = this.generateCacheKey('node', userId, nodeId);
    await this.set(key, role, 5 * 60); // 节点角色缓存5分钟
  }

  /**
   * 获取节点访问角色缓存
   */
  async getNodeAccessRole(
    userId: string,
    nodeId: string
  ): Promise<ProjectRole | null> {
    const key = this.generateCacheKey('node', userId, nodeId);
    return await this.get<ProjectRole>(key);
  }

  /**
   * 获取文件访问角色缓存（向后兼容）
   * @deprecated 使用 getNodeAccessRole 代替
   */
  async getFileAccessRole(
    userId: string,
    nodeId: string
  ): Promise<ProjectRole | null> {
    return this.getNodeAccessRole(userId, nodeId);
  }

  /**
   * 缓存用户角色
   */
  async cacheUserRole(userId: string, role: any): Promise<void> {
    const key = this.generateCacheKey('role', userId);
    const roleData = {
      id: role.id,
      name: role.name,
      description: role.description || undefined,
      category: role.category,
      isSystem: role.isSystem,
    };
    await this.set(key, roleData, 10 * 60); // 用户角色缓存10分钟
  }

  /**
   * 获取用户角色缓存
   */
  async getUserRole(userId: string): Promise<any | null> {
    const key = this.generateCacheKey('role', userId);
    return await this.get<any>(key);
  }

  /**
   * 获取缓存统计信息
   */
  async getStats(): Promise<{
    totalEntries: number;
    memoryUsage: string;
  }> {
    try {
      const pattern = `${this.KEY_PREFIX}*`;
      const keys = await this.redis.keys(pattern);
      const info = await this.redis.info('memory');

      // 解析内存使用信息
      const usedMemoryMatch = info.match(/used_memory_human:([^\r\n]+)/);
      const memoryUsage = usedMemoryMatch ? usedMemoryMatch[1] : 'N/A';

      return {
        totalEntries: keys.length,
        memoryUsage,
      };
    } catch (error) {
      this.logger.error(`获取缓存统计失败: ${error.message}`, error.stack);
      return {
        totalEntries: 0,
        memoryUsage: 'N/A',
      };
    }
  }

  /**
   * 清理所有权限缓存
   */
  async clearAll(): Promise<void> {
    try {
      const pattern = `${this.KEY_PREFIX}*`;
      const keys = await this.redis.keys(pattern);

      if (keys.length > 0) {
        await this.redis.del(...keys);
        this.logger.log(`清理所有权限缓存，共 ${keys.length} 个`);
      }
    } catch (error) {
      this.logger.error(`清理所有缓存失败: ${error.message}`, error.stack);
    }
  }
}
