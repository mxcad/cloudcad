import { Injectable, Logger } from '@nestjs/common';
import {
  NodeAccessRole,
  Permission,
  UserRole,
} from '../enums/permissions.enum';
import { Role } from './permission.service';

@Injectable()
export class PermissionCacheService {
  private readonly logger = new Logger(PermissionCacheService.name);
  private readonly cache = new Map<string, any>();
  private readonly cacheExpiry = new Map<string, number>();
  private readonly defaultTTL = 5 * 60 * 1000; // 5分钟

  /**
   * 生成缓存键
   */
  private generateCacheKey(
    type: 'user' | 'node',
    userId: string,
    resourceId?: string
  ): string {
    return `${type}:${userId}${resourceId ? `:${resourceId}` : ''}`;
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
   * 清除用户相关缓存
   */
  clearUserCache(userId: string): void {
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
   * 清除节点相关缓存（项目/文件夹/文件）
   */
  clearNodeCache(nodeId: string): void {
    const keysToDelete: string[] = [];

    for (const key of this.cache.keys()) {
      if (key.endsWith(`:${nodeId}`)) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach((key) => this.delete(key));
    this.logger.log(`清除节点 ${nodeId} 的权限缓存`);
  }

  /**
   * 清除项目缓存（向后兼容）
   * @deprecated 使用 clearNodeCache 代替
   */
  clearProjectCache(projectId: string): void {
    this.clearNodeCache(projectId);
  }

  /**
   * 清除文件缓存（向后兼容）
   * @deprecated 使用 clearNodeCache 代替
   */
  clearFileCache(fileId: string): void {
    this.clearNodeCache(fileId);
  }

  /**
   * 缓存用户权限
   */
  cacheUserPermissions(userId: string, permissions: Permission[]): void {
    const key = this.generateCacheKey('user', userId);
    this.set(key, permissions);
  }

  /**
   * 获取用户权限缓存
   */
  getUserPermissions(userId: string): Permission[] | null {
    const key = this.generateCacheKey('user', userId);
    return this.get<Permission[]>(key);
  }

  /**
   * 缓存节点访问权限（统一管理项目/文件夹/文件的访问权限）
   */
  cacheNodeAccessRole(
    userId: string,
    nodeId: string,
    role: NodeAccessRole
  ): void {
    const key = `role:node:${userId}:${nodeId}`;
    this.set(key, role, 5 * 60 * 1000); // 节点角色缓存5分钟
  }

  /**
   * 获取节点访问角色缓存
   */
  getNodeAccessRole(userId: string, nodeId: string): NodeAccessRole | null {
    const key = `role:node:${userId}:${nodeId}`;
    return this.get<NodeAccessRole>(key);
  }

  /**
   * 获取文件访问角色缓存（向后兼容）
   * @deprecated 使用 getNodeAccessRole 代替
   */
  getFileAccessRole(userId: string, nodeId: string): NodeAccessRole | null {
    return this.getNodeAccessRole(userId, nodeId);
  }

  /**
   * 缓存用户角色
   */
  cacheUserRole(userId: string, role: Role): void {
    const key = `role:user:${userId}`;
    this.set(key, role, 10 * 60 * 1000); // 用户角色缓存10分钟
  }

  /**
   * 获取用户角色缓存
   */
  getUserRole(userId: string): any | null {
    const key = `role:user:${userId}`;
    return this.get<any>(key);
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
