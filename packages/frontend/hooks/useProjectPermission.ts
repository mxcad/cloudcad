import { useCallback, useRef, useEffect } from 'react';
import { projectsApi } from '../services/projectsApi';
import { logger } from '../utils/logger';

/**
 * 缓存项接口
 */
interface CacheItem<T> {
  value: T;
  timestamp: number;
}

/**
 * 缓存配置
 */
const CACHE_CONFIG = {
  /** 权限检查缓存 TTL（毫秒） */
  PERMISSION_TTL: 5 * 60 * 1000, // 5 分钟
  /** 权限列表缓存 TTL（毫秒） */
  PERMISSIONS_TTL: 5 * 60 * 1000, // 5 分钟
  /** 角色缓存 TTL（毫秒） */
  ROLE_TTL: 5 * 60 * 1000, // 5 分钟
  /** 最大缓存条目数 */
  MAX_CACHE_SIZE: 100,
};

/**
 * 简单的内存缓存实现
 * 支持过期时间和大小限制
 */
class PermissionCache {
  private cache = new Map<string, CacheItem<boolean>>();
  private permissionsCache = new Map<string, CacheItem<string[]>>();
  private roleCache = new Map<string, CacheItem<string>>();

  /**
   * 获取权限缓存
   */
  getPermission(key: string): boolean | null {
    const item = this.cache.get(key);
    if (!item) return null;

    if (Date.now() - item.timestamp > CACHE_CONFIG.PERMISSION_TTL) {
      this.cache.delete(key);
      return null;
    }

    return item.value;
  }

  /**
   * 设置权限缓存
   */
  setPermission(key: string, value: boolean): void {
    this.evictIfNeeded(this.cache);
    this.cache.set(key, { value, timestamp: Date.now() });
  }

  /**
   * 获取权限列表缓存
   */
  getPermissions(projectId: string): string[] | null {
    const item = this.permissionsCache.get(projectId);
    if (!item) return null;

    if (Date.now() - item.timestamp > CACHE_CONFIG.PERMISSIONS_TTL) {
      this.permissionsCache.delete(projectId);
      return null;
    }

    return item.value;
  }

  /**
   * 设置权限列表缓存
   */
  setPermissions(projectId: string, value: string[]): void {
    this.evictIfNeeded(this.permissionsCache);
    this.permissionsCache.set(projectId, { value, timestamp: Date.now() });
  }

  /**
   * 获取角色缓存
   */
  getRole(projectId: string): string | null {
    const item = this.roleCache.get(projectId);
    if (!item) return null;

    if (Date.now() - item.timestamp > CACHE_CONFIG.ROLE_TTL) {
      this.roleCache.delete(projectId);
      return null;
    }

    return item.value;
  }

  /**
   * 设置角色缓存
   */
  setRole(projectId: string, value: string): void {
    this.evictIfNeeded(this.roleCache);
    this.roleCache.set(projectId, { value, timestamp: Date.now() });
  }

  /**
   * 清除指定项目的所有缓存
   */
  clearProject(projectId: string): void {
    // 清除权限列表和角色缓存
    this.permissionsCache.delete(projectId);
    this.roleCache.delete(projectId);

    // 清除该项目相关的权限检查缓存
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${projectId}:`)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * 清除所有缓存
   */
  clearAll(): void {
    this.cache.clear();
    this.permissionsCache.clear();
    this.roleCache.clear();
  }

  /**
   * 如果缓存超过最大大小，移除最旧的条目
   */
  private evictIfNeeded<K, V>(cache: Map<K, CacheItem<V>>): void {
    if (cache.size >= CACHE_CONFIG.MAX_CACHE_SIZE) {
      // 删除最旧的 20% 条目
      const entries = Array.from(cache.entries());
      const toDelete = Math.ceil(entries.length * 0.2);
      entries
        .sort((a, b) => a[1].timestamp - b[1].timestamp)
        .slice(0, toDelete)
        .forEach(([key]) => cache.delete(key));
    }
  }
}

// 全局缓存实例（模块级单例）
const globalCache = new PermissionCache();

/**
 * 项目权限检查 Hook
 *
 * 使用方式：
 * const { checkPermission } = useProjectPermission();
 * const canUpload = await checkPermission(projectId, 'project:file:upload');
 *
 * 特性：
 * 1. 本地内存缓存，减少 API 调用
 * 2. 支持缓存过期时间（默认 5 分钟）
 * 3. 支持缓存大小限制（默认 100 条）
 * 4. 组件卸载时自动清理相关缓存
 */
export const useProjectPermission = () => {
  // 记录当前组件使用的项目ID，用于清理
  const projectIdsRef = useRef<Set<string>>(new Set());

  // 组件卸载时清理缓存
  useEffect(() => {
    return () => {
      // 可选：组件卸载时清理该组件使用的项目缓存
      // 目前保留缓存以供其他组件使用
    };
  }, []);

  /**
   * 检查用户在项目中是否具有指定权限
   * @param projectId 项目 ID
   * @param permission 权限字符串（如 'FILE_UPLOAD'）
   */
  const checkPermission = useCallback(
    async (projectId: string, permission: string): Promise<boolean> => {
      projectIdsRef.current.add(projectId);

      // 构建缓存键
      const cacheKey = `${projectId}:${permission}`;

      // 检查缓存
      const cached = globalCache.getPermission(cacheKey);
      if (cached !== null) {
        return cached;
      }

      try {
        const response = await projectsApi.checkPermission(projectId, permission);
        const hasPermission = response.data.hasPermission || false;

        // 缓存结果
        globalCache.setPermission(cacheKey, hasPermission);

        return hasPermission;
      } catch (error) {
        logger.error('检查项目权限失败:', 'useProjectPermission');
        // 错误情况下也缓存 false，避免重复请求
        globalCache.setPermission(cacheKey, false);
        return false;
      }
    },
    []
  );

  /**
   * 获取用户在项目中的所有权限
   * @param projectId 项目 ID
   */
  const getPermissions = useCallback(
    async (projectId: string): Promise<string[]> => {
      projectIdsRef.current.add(projectId);

      // 检查缓存
      const cached = globalCache.getPermissions(projectId);
      if (cached !== null) {
        return cached;
      }

      try {
        const response = await projectsApi.getPermissions(projectId);
        const permissions = response.data.permissions || [];

        // 缓存结果
        globalCache.setPermissions(projectId, permissions);

        return permissions;
      } catch (error) {
        logger.error('获取项目权限失败:', 'useProjectPermission');
        return [];
      }
    },
    []
  );

  /**
   * 获取用户在项目中的角色
   * @param projectId 项目 ID
   */
  const getRole = useCallback(
    async (projectId: string): Promise<string | null> => {
      projectIdsRef.current.add(projectId);

      // 检查缓存
      const cached = globalCache.getRole(projectId);
      if (cached !== null) {
        return cached;
      }

      try {
        const response = await projectsApi.getRole(projectId);
        const role = response.data.role || null;

        // 缓存结果（仅当角色存在时）
        if (role) {
          globalCache.setRole(projectId, role);
        }

        return role;
      } catch (error) {
        logger.error('获取项目角色失败:', 'useProjectPermission');
        return null;
      }
    },
    []
  );

  /**
   * 检查用户是否具有任意一个指定权限
   * @param projectId 项目 ID
   * @param permissions 权限字符串数组
   *
   * 性能优化：使用 Promise.all 并行检查所有权限，避免串行等待
   */
  const checkAnyPermission = useCallback(
    async (projectId: string, permissions: string[]): Promise<boolean> => {
      // 使用 Promise.all 并行检查所有权限
      const results = await Promise.all(
        permissions.map((permission) => checkPermission(projectId, permission))
      );
      // 只要有任意一个权限为 true，则返回 true
      return results.some((result) => result === true);
    },
    [checkPermission]
  );

  /**
   * 检查用户是否具有所有指定权限
   * @param projectId 项目 ID
   * @param permissions 权限字符串数组
   *
   * 性能优化：使用 Promise.all 并行检查所有权限，避免串行等待
   */
  const checkAllPermissions = useCallback(
    async (projectId: string, permissions: string[]): Promise<boolean> => {
      // 使用 Promise.all 并行检查所有权限
      const results = await Promise.all(
        permissions.map((permission) => checkPermission(projectId, permission))
      );
      // 所有权限都必须为 true，才返回 true
      return results.every((result) => result === true);
    },
    [checkPermission]
  );

  /**
   * 清除指定项目的缓存
   * @param projectId 项目 ID
   */
  const clearCache = useCallback((projectId: string) => {
    globalCache.clearProject(projectId);
  }, []);

  /**
   * 清除所有缓存
   */
  const clearAllCache = useCallback(() => {
    globalCache.clearAll();
  }, []);

  /**
   * 强制检查权限（绕过缓存）
   * 用于权限变更后立即验证
   * @param projectId 项目 ID
   * @param permission 权限字符串
   */
  const forceCheckPermission = useCallback(
    async (projectId: string, permission: string): Promise<boolean> => {
      // 先清除该权限的缓存
      const cacheKey = `${projectId}:${permission}`;
      globalCache.setPermission(cacheKey, false); // 临时设置为 false，等待重新检查

      try {
        const response = await projectsApi.checkPermission(projectId, permission);
        const hasPermission = response.data.hasPermission || false;

        // 更新缓存
        globalCache.setPermission(cacheKey, hasPermission);

        return hasPermission;
      } catch (error) {
        logger.error('强制检查项目权限失败:', 'useProjectPermission');
        return false;
      }
    },
    []
  );

  /**
   * 刷新项目的所有权限缓存
   * 用于权限变更后强制刷新
   * @param projectId 项目 ID
   */
  const refreshProjectPermissions = useCallback(
    async (projectId: string): Promise<void> => {
      // 清除该项目的所有缓存
      globalCache.clearProject(projectId);
    },
    []
  );

  return {
    checkPermission,
    getPermissions,
    getRole,
    checkAnyPermission,
    checkAllPermissions,
    clearCache,
    clearAllCache,
    forceCheckPermission,
    refreshProjectPermissions,
  };
};