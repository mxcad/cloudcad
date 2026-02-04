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

  try {
    // 首先检查用户是否为项目所有者
    const { projectsApi } = await import('../services/apiService');
    const projectResponse = await projectsApi.getNode(nodeId);
    const project = projectResponse.data;

    // 如果用户是项目所有者，拥有所有权限
    if (project.ownerId === user.id) {
      return true;
    }
  } catch (error) {
    logger.error('获取项目信息失败:', error);
    return false;
  }

  // 检查缓存
  if (nodePermissionCache.has(nodeId)) {
    const role = nodePermissionCache.get(nodeId);
    return role ? requiredRoles.includes(role) : false;
  }

  try {
    // 动态导入 API 服务以避免循环依赖
    const { projectsApi } = await import('../services/apiService');

    // 获取项目成员列表
    const response = await projectsApi.getMembers(nodeId);
    const members = response.data as Array<{
      userId: string;
      role: {
        name: string;
      };
    }>;

    // 查找当前用户的角色
    const currentMember = members.find((m) => m.userId === user.id);
    const roleName = currentMember?.role.name;

    // 将系统角色名称映射到 NodeAccessRole
    const roleMap: Record<string, NodeAccessRole> = {
      PROJECT_OWNER: 'OWNER',
      PROJECT_ADMIN: 'ADMIN',
      PROJECT_MEMBER: 'MEMBER',
      PROJECT_EDITOR: 'EDITOR',
      PROJECT_VIEWER: 'VIEWER',
      // 向后兼容：旧系统的角色名称
      OWNER: 'OWNER',
      ADMIN: 'ADMIN',
      MEMBER: 'MEMBER',
      EDITOR: 'EDITOR',
      VIEWER: 'VIEWER',
    };

    const userRole = roleName
      ? ((roleMap[roleName] || roleName) as NodeAccessRole)
      : undefined;

    // 缓存用户的角色
    if (userRole) {
      nodePermissionCache.set(nodeId, userRole);
    }

    // 检查用户角色是否在所需角色列表中
    return userRole ? requiredRoles.includes(userRole) : false;
  } catch (error) {
    logger.error('获取节点权限失败:', error);
    return false;
  }
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
  return hasNodePermission(user, nodeId, [
    'OWNER',
    'ADMIN',
    'MEMBER',
    'EDITOR',
  ]);
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

/**
 * 检查用户是否可以管理节点角色
 * @param user - 用户对象
 * @param nodeId - 节点 ID（项目 ID）
 * @returns boolean - 是否可以管理角色
 */
export const canManageNodeRoles = async (
  user: User | null,
  nodeId: string
): Promise<boolean> => {
  if (!user) {
    return false;
  }

  try {
    // 动态导入 API 服务以避免循环依赖
    const { projectsApi } = await import('../services/apiService');

    // 检查用户是否具有 PROJECT_ROLE_MANAGE 权限
    const response = await projectsApi.checkPermission(
      nodeId,
      'PROJECT_ROLE_MANAGE'
    );

    return response.data?.hasPermission || false;
  } catch (error) {
    logger.error('检查角色管理权限失败:', error);
    return false;
  }
};
