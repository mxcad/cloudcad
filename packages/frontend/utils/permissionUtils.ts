/**
 * 权限检查工具
 * 统一权限检查逻辑
 */

import { logger } from './logger';

export type Role = 'ADMIN' | 'USER' | 'VIEWER';

export interface User {
  id: string;
  email: string;
  role?: {
    name: Role;
  };
}

/**
 * 节点访问角色
 */
export type NodeAccessRole = 'OWNER' | 'ADMIN' | 'MEMBER' | 'EDITOR' | 'VIEWER';

/**
 * 节点权限缓存
 */
const nodePermissionCache = new Map<string, NodeAccessRole | null>();

/**
 * 清除节点权限缓存
 */
export const clearNodePermissionCache = (nodeId?: string) => {
  if (nodeId) {
    nodePermissionCache.delete(nodeId);
  } else {
    nodePermissionCache.clear();
  }
};

/**
 * 检查用户是否具有指定角色
 * @param user - 用户对象
 * @param requiredRole - 需要的角色
 * @returns boolean - 是否具有该角色
 */
export const hasRole = (user: User | null, requiredRole: Role): boolean => {
  if (!user?.role) {
    return false;
  }

  // ADMIN 拥有所有权限
  if (user.role.name === 'ADMIN') {
    return true;
  }

  return user.role.name === requiredRole;
};

/**
 * 检查用户是否是管理员
 * @param user - 用户对象
 * @returns boolean - 是否是管理员
 */
export const isAdmin = (user: User | null): boolean => {
  return hasRole(user, 'ADMIN');
};

/**
 * 检查用户是否可以执行管理操作
 * @param user - 用户对象
 * @returns boolean - 是否可以执行管理操作
 */
export const canManage = (user: User | null): boolean => {
  return isAdmin(user);
};

/**
 * 检查用户是否可以编辑
 * @param user - 用户对象
 * @returns boolean - 是否可以编辑
 */
export const canEdit = (user: User | null): boolean => {
  if (!user) {
    return false;
  }

  // ADMIN 和 USER 都可以编辑
  return user.role?.name === 'ADMIN' || user.role?.name === 'USER';
};

/**
 * 检查用户是否可以查看
 * @param user - 用户对象
 * @returns boolean - 是否可以查看
 */
export const canView = (user: User | null): boolean => {
  return user !== null;
};

/**
 * 检查用户是否具有节点访问权限
 * @param user - 用户对象
 * @param nodeId - 节点 ID
 * @param requiredRoles - 需要的角色列表
 * @returns boolean - 是否具有权限
 */
export const hasNodePermission = async (
  user: User | null,
  nodeId: string,
  requiredRoles: NodeAccessRole[]
): Promise<boolean> => {
  if (!user) {
    return false;
  }

  // 管理员拥有所有权限
  if (user.role?.name === 'ADMIN') {
    return true;
  }

  // 检查缓存
  if (nodePermissionCache.has(nodeId)) {
    const role = nodePermissionCache.get(nodeId);
    return role ? requiredRoles.includes(role) : false;
  }

  // TODO: 调用 API 获取用户在节点上的角色
  // 目前先返回 false，等待后端提供获取节点权限的 API
  logger.warn('节点权限检查功能尚未完全实现，需要后端 API 支持');
  return false;
};

/**
 * 检查用户是否可以编辑节点
 * @param user - 用户对象
 * @param nodeId - 节点 ID
 * @returns boolean - 是否可以编辑
 */
export const canEditNode = async (
  user: User | null,
  nodeId: string
): Promise<boolean> => {
  return hasNodePermission(user, nodeId, ['OWNER', 'ADMIN', 'MEMBER', 'EDITOR']);
};

/**
 * 检查用户是否可以删除节点
 * @param user - 用户对象
 * @param nodeId - 节点 ID
 * @returns boolean - 是否可以删除
 */
export const canDeleteNode = async (
  user: User | null,
  nodeId: string
): Promise<boolean> => {
  return hasNodePermission(user, nodeId, ['OWNER', 'ADMIN']);
};

/**
 * 检查用户是否可以管理节点成员
 * @param user - 用户对象
 * @param nodeId - 节点 ID
 * @returns boolean - 是否可以管理成员
 */
export const canManageNodeMembers = async (
  user: User | null,
  nodeId: string
): Promise<boolean> => {
  return hasNodePermission(user, nodeId, ['OWNER', 'ADMIN']);
};

/**
 * 检查用户是否可以查看节点
 * @param user - 用户对象
 * @param nodeId - 节点 ID
 * @returns boolean - 是否可以查看
 */
export const canViewNode = async (
  user: User | null,
  nodeId: string
): Promise<boolean> => {
  return hasNodePermission(user, nodeId, [
    'OWNER',
    'ADMIN',
    'MEMBER',
    'EDITOR',
    'VIEWER',
  ]);
};
