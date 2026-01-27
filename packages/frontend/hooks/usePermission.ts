import { useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';

/**
 * 权限枚举类型
 */
export enum Permission {
  // 用户权限
  USER_READ = 'user:read',
  USER_WRITE = 'user:write',
  USER_DELETE = 'user:delete',
  USER_ADMIN = 'user:admin',

  // 项目权限
  PROJECT_CREATE = 'project:create',
  PROJECT_READ = 'project:read',
  PROJECT_WRITE = 'project:write',
  PROJECT_DELETE = 'project:delete',
  PROJECT_ADMIN = 'project:admin',
  PROJECT_MEMBER_MANAGE = 'project:member:manage',

  // 文件权限
  FILE_CREATE = 'file:create',
  FILE_READ = 'file:read',
  FILE_WRITE = 'file:write',
  FILE_DELETE = 'file:delete',
  FILE_SHARE = 'file:share',
  FILE_DOWNLOAD = 'file:download',
  FILE_COMMENT = 'file:comment', // 批注权限
  FILE_PRINT = 'file:print', // 打印权限
  FILE_COMPARE = 'file:compare', // 图纸比对权限

  // 版本管理权限
  VERSION_READ = 'version:read',
  VERSION_CREATE = 'version:create',
  VERSION_DELETE = 'version:delete',
  VERSION_RESTORE = 'version:restore',

  // 字体管理权限
  FONT_MANAGE = 'font:manage',

  // 审图配置权限
  REVIEW_CONFIG = 'review:config',

  // 回收站权限
  TRASH_MANAGE = 'trash:manage',

  // 系统权限
  SYSTEM_ADMIN = 'system:admin',
  SYSTEM_MONITOR = 'system:monitor',
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
 * 角色权限映射
 */
const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  [UserRole.ADMIN]: [
    Permission.USER_READ,
    Permission.USER_WRITE,
    Permission.USER_DELETE,
    Permission.USER_ADMIN,
    Permission.PROJECT_CREATE,
    Permission.PROJECT_READ,
    Permission.PROJECT_WRITE,
    Permission.PROJECT_DELETE,
    Permission.PROJECT_ADMIN,
    Permission.PROJECT_MEMBER_MANAGE,
    Permission.FILE_CREATE,
    Permission.FILE_READ,
    Permission.FILE_WRITE,
    Permission.FILE_DELETE,
    Permission.FILE_SHARE,
    Permission.FILE_DOWNLOAD,
    Permission.SYSTEM_ADMIN,
    Permission.SYSTEM_MONITOR,
  ],
  [UserRole.USER]: [
    Permission.PROJECT_CREATE,
    Permission.PROJECT_READ,
    Permission.FILE_CREATE,
    Permission.FILE_READ,
    Permission.FILE_WRITE,
    Permission.FILE_SHARE,
    Permission.FILE_DOWNLOAD,
  ],
};

/**
 * 节点访问权限映射
 */
const NODE_ACCESS_PERMISSIONS: Record<NodeAccessRole, Permission[]> = {
  [NodeAccessRole.OWNER]: [
    Permission.PROJECT_READ,
    Permission.PROJECT_WRITE,
    Permission.PROJECT_DELETE,
    Permission.PROJECT_ADMIN,
    Permission.PROJECT_MEMBER_MANAGE,
    Permission.FILE_CREATE,
    Permission.FILE_READ,
    Permission.FILE_WRITE,
    Permission.FILE_DELETE,
    Permission.FILE_SHARE,
    Permission.FILE_DOWNLOAD,
    Permission.FILE_COMMENT,
    Permission.FILE_PRINT,
    Permission.FILE_COMPARE,
    Permission.VERSION_READ,
    Permission.VERSION_CREATE,
    Permission.VERSION_DELETE,
    Permission.VERSION_RESTORE,
    Permission.FONT_MANAGE,
    Permission.REVIEW_CONFIG,
    Permission.TRASH_MANAGE,
  ],
  [NodeAccessRole.ADMIN]: [
    Permission.PROJECT_READ,
    Permission.PROJECT_WRITE,
    Permission.PROJECT_MEMBER_MANAGE,
    Permission.FILE_CREATE,
    Permission.FILE_READ,
    Permission.FILE_WRITE,
    Permission.FILE_DELETE,
    Permission.FILE_SHARE,
    Permission.FILE_DOWNLOAD,
    Permission.FILE_COMMENT,
    Permission.FILE_PRINT,
    Permission.FILE_COMPARE,
    Permission.VERSION_READ,
    Permission.VERSION_CREATE,
    Permission.VERSION_DELETE,
    Permission.VERSION_RESTORE,
    Permission.FONT_MANAGE,
    Permission.REVIEW_CONFIG,
    Permission.TRASH_MANAGE,
  ],
  [NodeAccessRole.MEMBER]: [
    Permission.PROJECT_READ,
    Permission.FILE_CREATE,
    Permission.FILE_READ,
    Permission.FILE_WRITE,
    Permission.FILE_SHARE,
    Permission.FILE_DOWNLOAD,
    Permission.FILE_COMMENT,
    Permission.FILE_PRINT,
    Permission.FILE_COMPARE,
    Permission.VERSION_READ,
    Permission.VERSION_CREATE,
  ],
  [NodeAccessRole.EDITOR]: [
    Permission.FILE_READ,
    Permission.FILE_WRITE,
    Permission.FILE_SHARE,
    Permission.FILE_DOWNLOAD,
    Permission.FILE_COMMENT,
    Permission.FILE_PRINT,
    Permission.FILE_COMPARE,
    Permission.VERSION_READ,
  ],
  [NodeAccessRole.VIEWER]: [
    Permission.FILE_READ,
    Permission.FILE_DOWNLOAD,
    Permission.FILE_COMMENT, // 查看者可以批注文件
  ],
};

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
    const userRole = getUserRole();
    if (!userRole) {
      return false;
    }

    const permissions = ROLE_PERMISSIONS[userRole] || [];
    return permissions.includes(permission);
  };

  /**
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
   * 检查用户在节点上是否具有指定权限
   */
  const hasNodePermission = (
    nodeAccessRole: NodeAccessRole,
    permission: Permission
  ): boolean => {
    const permissions = NODE_ACCESS_PERMISSIONS[nodeAccessRole] || [];
    return permissions.includes(permission);
  };

  /**
   * 获取用户的所有权限
   */
  const getUserPermissions = (): Permission[] => {
    const userRole = getUserRole();
    if (!userRole) {
      return [];
    }

    return ROLE_PERMISSIONS[userRole] || [];
  };

  /**
   * 获取节点访问角色的所有权限
   */
  const getNodePermissions = (nodeAccessRole: NodeAccessRole): Permission[] => {
    return NODE_ACCESS_PERMISSIONS[nodeAccessRole] || [];
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
