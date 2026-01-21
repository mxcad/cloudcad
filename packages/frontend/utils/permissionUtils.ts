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