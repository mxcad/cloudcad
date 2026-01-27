import { useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';

/**
 * 权限枚举类型
 * 注意：权限值必须与后端 Prisma 枚举保持一致（大写格式）
 */
export enum Permission {
  // 用户权限
  USER_READ = 'USER_READ',
  USER_WRITE = 'USER_WRITE',
  USER_DELETE = 'USER_DELETE',
  USER_ADMIN = 'USER_ADMIN',

  // 项目权限
  PROJECT_CREATE = 'PROJECT_CREATE',
  PROJECT_READ = 'PROJECT_READ',
  PROJECT_WRITE = 'PROJECT_WRITE',
  PROJECT_DELETE = 'PROJECT_DELETE',
  PROJECT_ADMIN = 'PROJECT_ADMIN',
  PROJECT_MEMBER_MANAGE = 'PROJECT_MEMBER_MANAGE',

  // 文件权限
  FILE_CREATE = 'FILE_CREATE',
  FILE_READ = 'FILE_READ',
  FILE_WRITE = 'FILE_WRITE',
  FILE_DELETE = 'FILE_DELETE',
  FILE_SHARE = 'FILE_SHARE',
  FILE_DOWNLOAD = 'FILE_DOWNLOAD',
  FILE_COMMENT = 'FILE_COMMENT', // 批注权限
  FILE_PRINT = 'FILE_PRINT', // 打印权限
  FILE_COMPARE = 'FILE_COMPARE', // 图纸比对权限

  // CAD 图纸权限
  CAD_SAVE = 'CAD_SAVE',
  CAD_EXPORT = 'CAD_EXPORT',
  CAD_EXTERNAL_REFERENCE = 'CAD_EXTERNAL_REFERENCE',

  // 图库权限
  GALLERY_USE = 'GALLERY_USE',

  // 版本管理权限
  VERSION_READ = 'VERSION_READ',
  VERSION_CREATE = 'VERSION_CREATE',
  VERSION_DELETE = 'VERSION_DELETE',
  VERSION_RESTORE = 'VERSION_RESTORE',

  // 字体管理权限
  FONT_MANAGE = 'FONT_MANAGE',

  // 审图配置权限
  REVIEW_CONFIG = 'REVIEW_CONFIG',

  // 回收站权限
  TRASH_MANAGE = 'TRASH_MANAGE',

  // 系统权限
  SYSTEM_ADMIN = 'SYSTEM_ADMIN',
  SYSTEM_MONITOR = 'SYSTEM_MONITOR',
}

/**
 * 用户角色枚举
 */
export enum UserRole {
  ADMIN = 'ADMIN',
  USER = 'USER',
}

/**
 * 节点访问角色枚举
 */
export enum NodeAccessRole {
  OWNER = 'OWNER',
  ADMIN = 'ADMIN',
  MEMBER = 'MEMBER',
  EDITOR = 'EDITOR',
  VIEWER = 'VIEWER',
}

/**
 * 角色权限映射（已废弃）
 * 注意：所有权限检查现在完全依赖 API 返回的实际权限列表
 * 硬编码映射已被移除以避免权限不一致问题
 *
 * 如果需要检查项目成员的节点权限，请使用：
 * @see ../utils/permissionUtils.ts - 中的 hasNodePermission 方法（动态调用 API）
 */

/**
 * 权限管理 Hook
 * 提供统一的权限检查方法
 */
export const usePermission = () => {
  const { user } = useAuth();

  /**
   * 获取用户角色
   */
  const getUserRole = (): UserRole | null => {
    if (!user?.role?.name) {
      return null;
    }
    return user.role.name as UserRole;
  };

  /**
   * 检查用户是否具有指定角色
   */
  const hasRole = (roles: UserRole | UserRole[]): boolean => {
    const userRole = getUserRole();
    if (!userRole) {
      return false;
    }

    const roleArray = Array.isArray(roles) ? roles : [roles];
    return roleArray.includes(userRole);
  };

  /**
   * 检查用户是否具有指定权限
   */
      const hasPermission = (permission: Permission): boolean => {
        if (!user?.role) {
          return false;
        }
  
        // 必须使用从 API 返回的实际权限列表
        // 自定义角色的权限完全由数据库控制，不依赖硬编码
        if (user.role.permissions && Array.isArray(user.role.permissions)) {
          const userPermissions = user.role.permissions.map((p) => p.permission as Permission);
          return userPermissions.includes(permission);
        }
  
        // 如果角色没有权限列表，说明：
        // 1. 后端没有正确返回权限数据
        // 2. 这是系统默认角色且需要兼容旧版本
        // 此时返回 false，要求后端修复
        console.warn(`[Permission Warning] User role "${user.role.name}" has no permissions data. Please check backend API.`);
        return false;
      };  /**
   * 检查用户是否具有任意一个指定权限
   */
  const hasAnyPermission = (permissions: Permission[]): boolean => {
    return permissions.some((perm) => hasPermission(perm));
  };

  /**
   * 检查用户是否具有所有指定权限
   */
  const hasAllPermissions = (permissions: Permission[]): boolean => {
    return permissions.every((perm) => hasPermission(perm));
  };

  /**
   * 检查用户在节点上是否具有指定角色
   */
  const hasNodeAccessRole = (
    nodeAccessRoles: NodeAccessRole | NodeAccessRole[]
  ): boolean => {
    const userRole = getUserRole();
    if (!userRole) {
      return false;
    }

    // 管理员拥有所有权限
    if (userRole === UserRole.ADMIN) {
      return true;
    }

    // 检查节点访问角色
    const roleArray = Array.isArray(nodeAccessRoles)
      ? nodeAccessRoles
      : [nodeAccessRoles];

    // 这里需要根据实际的节点访问角色进行判断
    // 由于前端没有节点访问角色的完整信息，这里返回 true
    // 实际应用中应该从 API 获取用户的节点访问角色
    return true;
  };

  /**

   * 检查用户在节点上是否具有指定权限（已废弃）

   * 

   * @deprecated 此方法已被废弃，因为它使用硬编码的权限映射

   * 请使用 @see ../utils/permissionUtils.ts 中的 hasNodePermission 方法

   * 该方法会动态调用 API 获取实际的成员角色和权限

   */

    const hasNodePermission = (

      nodeAccessRole: NodeAccessRole,

      permission: Permission

    ): boolean => {

      console.warn('[usePermission] hasNodePermission is deprecated. Use permissionUtils.hasNodePermission instead.');

      return false;

    };

  

    /**

     * 获取用户的所有权限

   */

    const getUserPermissions = (): Permission[] => {

      if (!user?.role) {

        return [];

      }

  

      // 只返回从 API 返回的实际权限列表

      if (user.role.permissions && Array.isArray(user.role.permissions)) {

        return user.role.permissions.map((p) => p.permission as Permission);

      }

  

      // 如果角色没有权限列表，返回空数组

      console.warn(`[Permission Warning] User role "${user.role.name}" has no permissions data.`);

      return [];

    };

  

    /**

     * 获取节点访问角色的所有权限（已废弃）

     *

     * @deprecated 此方法已被废弃，因为它使用硬编码的权限映射

     * 节点权限应该从 API 动态获取，而不是硬编码

     */

    const getNodePermissions = (nodeAccessRole: NodeAccessRole): Permission[] => {

      console.warn('[usePermission] getNodePermissions is deprecated. Node permissions should be fetched from API.');

      return [];

    };

  /**
   * 检查是否为管理员
   */
  const isAdmin = (): boolean => {
    return hasRole(UserRole.ADMIN);
  };

  /**
   * 检查是否为普通用户
   */
  const isUser = (): boolean => {
    return hasRole(UserRole.USER);
  };

  return useMemo(
    () => ({
      getUserRole,
      hasRole,
      hasPermission,
      hasAnyPermission,
      hasAllPermissions,
      hasNodeAccessRole,
      hasNodePermission,
      getUserPermissions,
      getNodePermissions,
      isAdmin,
      isUser,
    }),
    [user]
  );
};
