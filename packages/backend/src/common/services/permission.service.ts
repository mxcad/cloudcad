import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import {
  NODE_ACCESS_PERMISSIONS,
  NodeAccessRole,
  Permission,
  UserRole,
} from '../enums/permissions.enum';
import { PermissionCacheService } from './permission-cache.service';

export interface Role {
  id: string;
  name: string;
  description?: string;
  category?: string;
  isSystem: boolean;
  permissions?: { permission: Permission }[];
}

export interface UserWithPermissions {
  id: string;
  email: string;
  username: string;
  nickname?: string;
  avatar?: string;
  role: Role;
  status: string;
}

/**
 * 统一权限检查服务
 *
 * 功能：
 * 1. 检查用户是否具有指定权限
 * 2. 支持系统权限和节点权限
 * 3. 使用缓存优化性能
 * 4. 支持权限继承
 */
@Injectable()
export class PermissionService {
  private readonly logger = new Logger(PermissionService.name);

  constructor(
    private readonly prisma: DatabaseService,
    private readonly cacheService: PermissionCacheService,
  ) {}

  /**
   * 统一权限检查入口
   *
   * @param userId 用户 ID
   * @param nodeId 节点 ID（可选，用于节点权限检查）
   * @param permission 权限
   * @returns 是否具有权限
   */
  async checkPermission(
    userId: string,
    nodeId: string | undefined,
    permission: Permission,
  ): Promise<boolean> {
    try {
      // 1. 检查缓存
      const cacheKey = `perm:${userId}:${nodeId || 'system'}:${permission}`;
      const cached = this.cacheService.get<boolean>(cacheKey);
      if (cached !== null) {
        return cached;
      }

      // 2. 检查系统管理员权限
      const isAdmin = await this.isSystemAdmin(userId);
      if (isAdmin) {
        this.cacheService.set(cacheKey, true, 600000); // 10 分钟
        return true;
      }

      // 3. 如果没有节点 ID，只检查系统权限
      if (!nodeId) {
        const hasPermission = await this.checkSystemPermission(userId, permission);
        this.cacheService.set(cacheKey, hasPermission, 300000); // 5 分钟
        return hasPermission;
      }

      // 4. 检查节点权限
      const hasPermission = await this.checkNodePermission(userId, nodeId, permission);
      this.cacheService.set(cacheKey, hasPermission, 300000); // 5 分钟
      return hasPermission;
    } catch (error) {
      this.logger.error(`权限检查失败: ${error.message}`, error.stack);
      return false;
    }
  }

  /**
   * 检查用户是否为系统管理员
   */
  private async isSystemAdmin(userId: string): Promise<boolean> {
    const cacheKey = `is_admin:${userId}`;
    const cached = this.cacheService.get<boolean>(cacheKey);
    if (cached !== null) {
      return cached;
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        role: {
          select: {
            name: true,
          },
        },
      },
    });

    const isAdmin = user?.role?.name === UserRole.ADMIN;
    this.cacheService.set(cacheKey, isAdmin, 600000); // 10 分钟
    return isAdmin;
  }

  /**
   * 检查系统权限
   */
  private async checkSystemPermission(userId: string, permission: Permission): Promise<boolean> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          role: {
            include: {
              permissions: true,
            },
          },
        },
      });

      if (!user?.role) {
        return false;
      }

      const userPermissions = user.role.permissions.map((p) => p.permission as Permission);
      return userPermissions.includes(permission as Permission);
    } catch (error) {
      this.logger.error(`检查系统权限失败: ${error.message}`, error.stack);
      return false;
    }
  }

  /**
   * 检查节点权限
   */
  private async checkNodePermission(
    userId: string,
    nodeId: string,
    permission: Permission,
  ): Promise<boolean> {
    try {
      const role = await this.getNodeAccessRole(userId, nodeId);
      if (!role) {
        return false;
      }

      const permissions = NODE_ACCESS_PERMISSIONS[role] || [];
      return permissions.includes(permission as Permission);
    } catch (error) {
      this.logger.error(`检查节点权限失败: ${error.message}`, error.stack);
      return false;
    }
  }

  /**
   * 获取用户在节点上的访问角色
   */
  async getNodeAccessRole(userId: string, nodeId: string): Promise<NodeAccessRole | null> {
    try {
      // 先检查缓存
      const cachedRole = this.cacheService.getNodeAccessRole(userId, nodeId);
      if (cachedRole) {
        return cachedRole;
      }

      // 查询节点信息
      const node = await this.prisma.fileSystemNode.findUnique({
        where: { id: nodeId },
        select: { ownerId: true, deletedAt: true, isRoot: true },
      });

      if (!node || node.deletedAt) {
        return null;
      }

      // 如果是所有者，直接返回 OWNER
      if (node.ownerId === userId) {
        this.cacheService.cacheNodeAccessRole(userId, nodeId, NodeAccessRole.OWNER);
        return NodeAccessRole.OWNER;
      }

      // 优先检查 ProjectMember 表（新系统）
      const projectMember = await this.prisma.projectMember.findUnique({
        where: {
          projectId_userId: {
            projectId: node.isRoot ? nodeId : await this.getProjectRootId(nodeId),
            userId,
          },
        },
        include: {
          role: {
            select: {
              name: true,
            },
          },
        },
      });

      if (projectMember) {
        const nodeAccessRole = this.mapRoleNameToNodeAccessRole(projectMember.role.name);
        if (nodeAccessRole) {
          this.cacheService.cacheNodeAccessRole(userId, nodeId, nodeAccessRole);
          return nodeAccessRole;
        }
      }

      return null;
    } catch (error) {
      this.logger.error(`获取节点访问角色失败: ${error.message}`, error.stack);
      return null;
    }
  }

  /**
   * 获取项目的根节点 ID
   */
  private async getProjectRootId(nodeId: string): Promise<string> {
    const rootNode = await this.findRootNode(nodeId);
    return rootNode?.id || nodeId;
  }

  /**
   * 查找项目根节点
   */
  private async findRootNode(nodeId: string) {
    let currentNode = await this.prisma.fileSystemNode.findUnique({
      where: { id: nodeId },
      select: { id: true, isRoot: true, parentId: true },
    });

    if (!currentNode) return null;
    if (currentNode.isRoot) return currentNode;

    while (currentNode && !currentNode.isRoot && currentNode.parentId) {
      currentNode = await this.prisma.fileSystemNode.findUnique({
        where: { id: currentNode.parentId },
        select: { id: true, isRoot: true, parentId: true },
      });
    }

    return currentNode?.isRoot ? currentNode : null;
  }

  /**
   * 将系统角色名称映射到 NodeAccessRole
   */
  private mapRoleNameToNodeAccessRole(roleName: string): NodeAccessRole | null {
    const roleMap: Record<string, NodeAccessRole> = {
      PROJECT_OWNER: NodeAccessRole.OWNER,
      PROJECT_ADMIN: NodeAccessRole.ADMIN,
      PROJECT_MEMBER: NodeAccessRole.MEMBER,
      PROJECT_EDITOR: NodeAccessRole.EDITOR,
      PROJECT_VIEWER: NodeAccessRole.VIEWER,
    };

    return roleMap[roleName] || null;
  }

  /**
   * 检查用户是否具有指定角色之一
   */
  async hasNodeAccessRole(
    user: UserWithPermissions,
    nodeId: string,
    roles: NodeAccessRole[],
  ): Promise<boolean> {
    // 系统管理员拥有所有权限
    if (user.role?.name === UserRole.ADMIN) {
      return true;
    }

    const role = await this.getNodeAccessRole(user.id, nodeId);
    return role ? roles.includes(role) : false;
  }

  /**
   * 获取用户在节点上的所有权限
   */
  async getNodePermissions(userId: string, nodeId: string): Promise<Permission[]> {
    const role = await this.getNodeAccessRole(userId, nodeId);
    if (!role) {
      return [];
    }
    return NODE_ACCESS_PERMISSIONS[role] || [];
  }

  /**
   * 检查用户是否具有指定用户角色
   */
  hasRole(user: UserWithPermissions, roleNames: string[]): boolean {
    return roleNames.includes(user.role?.name || '');
  }

  /**
   * 获取用户的系统权限
   */
  async getUserPermissions(user: UserWithPermissions): Promise<Permission[]> {
    try {
      return user.role?.permissions?.map((p) => p.permission) || [];
    } catch (error) {
      this.logger.error(`获取用户权限失败: ${error.message}`, error.stack);
      return [];
    }
  }

  /**
   * 清除用户权限缓存
   */
  clearUserCache(userId: string): void {
    this.cacheService.clearUserCache(userId);
  }

  /**
   * 清除节点权限缓存
   */
  clearNodeCache(nodeId: string): void {
    this.cacheService.clearNodeCache(nodeId);
  }
}
