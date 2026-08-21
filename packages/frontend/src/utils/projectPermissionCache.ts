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

/**
 * 项目权限共享缓存
 *
 * 供 useProjectPermission（hook）与 permissionUtils（纯函数）复用，
 * 避免两处各自维护一套项目权限缓存。
 */

/**
 * 缓存项接口
 */
interface CacheItem<T> {
  value: T;
  timestamp: number;
}

/**
 * 项目权限数据（含角色）
 */
export interface ProjectPermissionData {
  permissions: string[];
  role: string | null;
}

/**
 * 缓存配置
 */
const CACHE_CONFIG = {
  /** 权限数据缓存 TTL（毫秒） */
  PERMISSIONS_TTL: 5 * 60 * 1000,
  /** 最大缓存条目数 */
  MAX_CACHE_SIZE: 100,
};

/**
 * 简单的内存缓存实现
 * 支持过期时间和大小限制
 */
export class PermissionCache {
  private permissionsCache = new Map<
    string,
    CacheItem<ProjectPermissionData>
  >();
  private singleCheckCache = new Map<string, CacheItem<boolean>>();

  /**
   * 获取项目权限数据（含角色）
   */
  getProjectPermissions(projectId: string): ProjectPermissionData | null {
    const item = this.permissionsCache.get(projectId);
    if (!item) return null;

    if (Date.now() - item.timestamp > CACHE_CONFIG.PERMISSIONS_TTL) {
      this.permissionsCache.delete(projectId);
      return null;
    }

    return item.value;
  }

  /**
   * 设置项目权限数据
   */
  setProjectPermissions(projectId: string, data: ProjectPermissionData): void {
    this.evictIfNeeded(this.permissionsCache);
    this.permissionsCache.set(projectId, {
      value: data,
      timestamp: Date.now(),
    });
  }

  /**
   * 获取单权限检查缓存（用于兼容旧调用方）
   */
  getSingleCheck(key: string): boolean | null {
    const item = this.singleCheckCache.get(key);
    if (!item) return null;
    if (Date.now() - item.timestamp > CACHE_CONFIG.PERMISSIONS_TTL) {
      this.singleCheckCache.delete(key);
      return null;
    }
    return item.value;
  }

  setSingleCheck(key: string, value: boolean): void {
    this.evictIfNeeded(this.singleCheckCache);
    this.singleCheckCache.set(key, { value, timestamp: Date.now() });
  }

  /**
   * 清除指定项目的所有缓存
   */
  clearProject(projectId: string): void {
    this.permissionsCache.delete(projectId);
    for (const key of this.singleCheckCache.keys()) {
      if (key.startsWith(`${projectId}:`)) {
        this.singleCheckCache.delete(key);
      }
    }
  }

  /**
   * 清除所有缓存
   */
  clearAll(): void {
    this.permissionsCache.clear();
    this.singleCheckCache.clear();
  }

  private evictIfNeeded<K>(cache: Map<K, CacheItem<unknown>>): void {
    if (cache.size >= CACHE_CONFIG.MAX_CACHE_SIZE) {
      const entries = Array.from(cache.entries());
      const toDelete = Math.ceil(entries.length * 0.2);
      entries
        .sort((a, b) => a[1].timestamp - b[1].timestamp)
        .slice(0, toDelete)
        .forEach(([key]) => cache.delete(key));
    }
  }
}

/**
 * 全局缓存实例（模块级单例）
 */
export const globalPermissionCache = new PermissionCache();
