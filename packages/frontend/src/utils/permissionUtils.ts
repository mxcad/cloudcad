/**
 * 权限检查工具
 * 统一权限检查逻辑
 */

export type Role = string | undefined | null;

export interface User {
  id: string;
  email?: string | null;
  role?: {
    name?: Role;
  };
}

/**
 * 节点访问角色 - 与后端 ProjectRole 枚举保持一致
 */
export type NodeAccessRole =
  | 'PROJECT_OWNER'
  | 'PROJECT_ADMIN'
  | 'PROJECT_MEMBER'
  | 'PROJECT_EDITOR'
  | 'PROJECT_VIEWER';

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

  // 检查缓存
  if (nodePermissionCache.has(nodeId)) {
    const role = nodePermissionCache.get(nodeId);
    return role ? requiredRoles.includes(role) : false;
  }

  try {
    // 动态导入 API 服务以避免循环依赖
    const { projectsApi } = await import('../services/projectsApi');

    // 获取项目成员列表
    const response = await projectsApi.getMembers(nodeId);

    const members = response.data;

    // 查找当前用户的角色
    const currentMember = members.find((m) => m.id === user.id);
    const roleName = currentMember?.projectRoleName;

    // 将后端角色名称映射到 NodeAccessRole（现在应该直接匹配）
    const userRole = roleName ? (roleName as NodeAccessRole) : undefined;

    // 缓存用户的角色
    if (userRole) {
      nodePermissionCache.set(nodeId, userRole);
    }

    // 检查用户角色是否在所需角色列表中
    return userRole ? requiredRoles.includes(userRole) : false;
  } catch (error) {
    console.error('获取节点权限失败:', error);
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
  if (!user) {
    return false;
  }

  try {
    // 动态导入 API 服务以避免循环依赖
    const { projectsApi } = await import('../services/projectsApi');

    // 检查用户是否具有 PROJECT_UPDATE 权限
    const response = await projectsApi.checkPermission(
      nodeId,
      'PROJECT_UPDATE'
    );

    return response.data?.hasPermission || false;
  } catch (error) {
    console.error('检查编辑权限失败:', error);
    return false;
  }
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
  if (!user) {
    return false;
  }

  try {
    // 动态导入 API 服务以避免循环依赖
    const { projectsApi } = await import('../services/projectsApi');

    // 检查用户是否具有 PROJECT_DELETE 权限
    const response = await projectsApi.checkPermission(
      nodeId,
      'PROJECT_DELETE'
    );

    return response.data?.hasPermission || false;
  } catch (error) {
    console.error('检查删除权限失败:', error);
    return false;
  }
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
  if (!user) {
    return false;
  }

  try {
    // 动态导入 API 服务以避免循环依赖
    const { projectsApi } = await import('../services/projectsApi');

    // 检查用户是否具有 PROJECT_MEMBER_MANAGE 权限
    const response = await projectsApi.checkPermission(
      nodeId,
      'PROJECT_MEMBER_MANAGE'
    );

    return response.data?.hasPermission || false;
  } catch (error) {
    console.error('检查成员管理权限失败:', error);
    return false;
  }
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
    'PROJECT_OWNER',
    'PROJECT_ADMIN',
    'PROJECT_MEMBER',
    'PROJECT_EDITOR',
    'PROJECT_VIEWER',
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
    const { projectsApi } = await import('../services/projectsApi');

    // 检查用户是否具有 PROJECT_ROLE_MANAGE 权限
    const response = await projectsApi.checkPermission(
      nodeId,
      'PROJECT_ROLE_MANAGE'
    );

    return response.data?.hasPermission || false;
  } catch (error) {
    console.error('检查角色管理权限失败:', error);
    return false;
  }
};
