import { Injectable, Logger } from '@nestjs/common';
import {
  FileAccessRole,
  Permission,
  ProjectMemberRole,
  UserRole,
} from '../enums/permissions.enum';

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
    type: 'user' | 'project' | 'file',
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
   * 清除项目相关缓存
   */
  clearProjectCache(projectId: string): void {
    const keysToDelete: string[] = [];

    for (const key of this.cache.keys()) {
      if (key.includes(`project:${projectId}`)) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach((key) => this.delete(key));
    this.logger.log(`清除项目 ${projectId} 的权限缓存`);
  }

  /**
   * 清除文件相关缓存
   */
  clearFileCache(fileId: string): void {
    const keysToDelete: string[] = [];

    for (const key of this.cache.keys()) {
      if (key.includes(`file:${fileId}`)) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach((key) => this.delete(key));
    this.logger.log(`清除文件 ${fileId} 的权限缓存`);
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
   * 缓存项目权限
   */
  cacheProjectPermissions(
    userId: string,
    projectId: string,
    permissions: Permission[]
  ): void {
    const key = this.generateCacheKey('project', userId, projectId);
    this.set(key, permissions);
  }

  /**
   * 获取项目权限缓存
   */
  getProjectPermissions(
    userId: string,
    projectId: string
  ): Permission[] | null {
    const key = this.generateCacheKey('project', userId, projectId);
    return this.get<Permission[]>(key);
  }

  /**
   * 缓存文件权限
   */
  cacheFilePermissions(
    userId: string,
    fileId: string,
    permissions: Permission[]
  ): void {
    const key = this.generateCacheKey('file', userId, fileId);
    this.set(key, permissions);
  }

  /**
   * 获取文件权限缓存
   */
  getFilePermissions(userId: string, fileId: string): Permission[] | null {
    const key = this.generateCacheKey('file', userId, fileId);
    return this.get<Permission[]>(key);
  }

  /**
   * 缓存用户角色
   */
  cacheUserRole(userId: string, role: UserRole): void {
    const key = `role:user:${userId}`;
    this.set(key, role, 10 * 60 * 1000); // 用户角色缓存10分钟
  }

  /**
   * 获取用户角色缓存
   */
  getUserRole(userId: string): UserRole | null {
    const key = `role:user:${userId}`;
    return this.get<UserRole>(key);
  }

  /**
   * 缓存项目成员角色
   */
  cacheProjectMemberRole(
    userId: string,
    projectId: string,
    role: ProjectMemberRole
  ): void {
    const key = `role:project:${userId}:${projectId}`;
    this.set(key, role, 5 * 60 * 1000); // 项目角色缓存5分钟
  }

  /**
   * 获取项目成员角色缓存
   */
  getProjectMemberRole(
    userId: string,
    projectId: string
  ): ProjectMemberRole | null {
    const key = `role:project:${userId}:${projectId}`;
    return this.get<ProjectMemberRole>(key);
  }

  /**
   * 缓存文件访问角色
   */
  cacheFileAccessRole(
    userId: string,
    fileId: string,
    role: FileAccessRole
  ): void {
    const key = `role:file:${userId}:${fileId}`;
    this.set(key, role, 5 * 60 * 1000); // 文件角色缓存5分钟
  }

  /**
   * 获取文件访问角色缓存
   */
  getFileAccessRole(userId: string, fileId: string): FileAccessRole | null {
    const key = `role:file:${userId}:${fileId}`;
    return this.get<FileAccessRole>(key);
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
