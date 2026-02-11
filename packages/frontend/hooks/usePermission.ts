import { useMemo } from 'react';
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
 */
export const usePermission = () => {
  const { user } = useAuth();

  /**
   * 获取用户的权限列表（从缓存）
   */
  const getUserPermissions = (): Permission[] => {
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
  };

  /**
   * 检查用户是否具有指定权限
   * @param permission 权限（使用 SystemPermission 或 ProjectPermission 常量）
   * @example hasPermission(SystemPermission.USER_READ)
   * @example hasPermission(ProjectPermission.FILE_UPLOAD)
   */
  const hasPermission = (permission: Permission): boolean => {
    const permissions = getUserPermissions();
    return permissions.includes(permission);
  };

  /**
   * 检查用户是否具有任意一个指定权限
   * @param permissions 权限数组
   * @example hasAnyPermission([SystemPermission.USER_READ, SystemPermission.USER_WRITE])
   */
  const hasAnyPermission = (permissions: Permission[]): boolean => {
    return permissions.some((perm) => hasPermission(perm));
  };

  /**
   * 检查用户是否具有所有指定权限
   * @param permissions 权限数组
   * @example hasAllPermissions([SystemPermission.USER_READ, SystemPermission.USER_WRITE])
   */
  const hasAllPermissions = (permissions: Permission[]): boolean => {
    return permissions.every((perm) => hasPermission(perm));
  };

  /**
   * 获取用户角色
   */
  const getUserRole = (): string | null => {
    return user?.role?.name || null;
  };

  /**
   * 检查用户是否具有指定角色
   * @param roles 角色字符串或数组（如 'ADMIN' 或 ['ADMIN', 'USER']）
   */
  const hasRole = (roles: string | string[]): boolean => {
    const userRole = getUserRole();
    if (!userRole) {
      return false;
    }

    const roleArray = Array.isArray(roles) ? roles : [roles];
    return roleArray.includes(userRole);
  };

  /**
   * 检查是否为系统管理员
   * 注意：此方法仅用于 UI 展示，权限控制应该使用 hasPermission
   */
  const isAdmin = (): boolean => {
    return hasPermission(SystemPermission.SYSTEM_ADMIN);
  };

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
    [user]
  );
};
