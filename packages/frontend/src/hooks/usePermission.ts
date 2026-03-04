import { useMemo, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import type { Permission } from '../constants/permissions';
import { SystemPermission } from '../constants/permissions';

/**
 * 权限管理 Hook
 * 提供权限检查方法
 *
 * 核心设计：
 * 1. 权限定义在后端，前端通过 OpenAPI 自动生成
 * 2. 用户登录时获取权限列表并缓存
 * 3. 权限检查使用类型安全的权限常量
 * 4. 权限变更只修改后端，运行 `pnpm generate:types` 重新生成前端类型
 * 5. 使用 Set 数据结构优化权限搜索，将 O(n) 复杂度降为 O(1)
 */
export const usePermission = () => {
  const { user } = useAuth();

  /**
   * 获取用户的权限列表（从缓存）
   */
  const getUserPermissions = useCallback((): Permission[] => {
    if (!user?.role?.permissions || !Array.isArray(user.role.permissions)) {
      return [];
    }

    // 后端返回的权限格式验证
    const permissions: Permission[] = [];
    for (const p of user.role.permissions) {
      // 检查权限是否为字符串
      if (typeof p === 'string') {
        permissions.push(p as Permission);
      } else if (p && typeof p.permission === 'string') {
        // 兼容后端可能返回 { permission: string } 的格式
        permissions.push(p.permission as Permission);
      } else {
        console.warn(`[usePermission] 无效的权限格式:`, p);
      }
    }

    return permissions;
  }, [user?.role?.permissions]);

  /**
   * 获取用户权限的 Set（用于高效查找）
   * 使用 useMemo 缓存 Set，避免每次检查都重新创建
   */
  const permissionSet = useMemo(() => {
    return new Set(getUserPermissions());
  }, [getUserPermissions]);

  /**
   * 检查用户是否具有指定权限
   * @param permission 权限（使用 SystemPermission 或 ProjectPermission 常量）
   * @example hasPermission(SystemPermission.USER_READ)
   * @example hasPermission(ProjectPermission.FILE_UPLOAD)
   */
  const hasPermission = useCallback(
    (permission: Permission): boolean => {
      return permissionSet.has(permission);
    },
    [permissionSet]
  );

  /**
   * 检查用户是否具有任意一个指定权限
   * @param permissions 权限数组
   * @example hasAnyPermission([SystemPermission.USER_READ, SystemPermission.USER_WRITE])
   */
  const hasAnyPermission = useCallback(
    (permissions: Permission[]): boolean => {
      return permissions.some((perm) => permissionSet.has(perm));
    },
    [permissionSet]
  );

  /**
   * 检查用户是否具有所有指定权限
   * @param permissions 权限数组
   * @example hasAllPermissions([SystemPermission.USER_READ, SystemPermission.USER_WRITE])
   */
  const hasAllPermissions = useCallback(
    (permissions: Permission[]): boolean => {
      return permissions.every((perm) => permissionSet.has(perm));
    },
    [permissionSet]
  );

  /**
   * 获取用户角色
   */
  const getUserRole = useCallback((): string | null => {
    return user?.role?.name || null;
  }, [user?.role?.name]);

  /**
   * 检查用户是否具有指定角色
   * @param roles 角色字符串或数组（如 'ADMIN' 或 ['ADMIN', 'USER']）
   */
  const hasRole = useCallback(
    (roles: string | string[]): boolean => {
      const userRole = getUserRole();
      if (!userRole) {
        return false;
      }

      const roleArray = Array.isArray(roles) ? roles : [roles];
      return roleArray.includes(userRole);
    },
    [getUserRole]
  );

  /**
   * 检查是否为系统管理员
   * 注意：此方法仅用于 UI 展示，权限控制应该使用 hasPermission
   */
  const isAdmin = useCallback((): boolean => {
    return permissionSet.has(SystemPermission.SYSTEM_ADMIN);
  }, [permissionSet]);

  return useMemo(
    () => ({
      getUserPermissions,
      hasPermission,
      hasAnyPermission,
      hasAllPermissions,
      getUserRole,
      hasRole,
      isAdmin,
    }),
    [
      getUserPermissions,
      hasPermission,
      hasAnyPermission,
      hasAllPermissions,
      getUserRole,
      hasRole,
      isAdmin,
    ]
  );
};
