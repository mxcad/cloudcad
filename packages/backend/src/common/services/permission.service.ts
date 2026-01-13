import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import {
  NODE_ACCESS_PERMISSIONS,
  NodeAccessRole,
  Permission,
  ROLE_PERMISSIONS,
  UserRole,
} from '../enums/permissions.enum';
import { PermissionCacheService } from './permission-cache.service';

export interface Role {
  id: string;
  name: string;
  description?: string;
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

@Injectable()
export class PermissionService {
  private readonly logger = new Logger(PermissionService.name);

  constructor(
    private readonly prisma: DatabaseService,
    private readonly cacheService: PermissionCacheService
  ) {}

  async hasPermission(
    user: UserWithPermissions,
    permission: Permission,
    resourceId?: { nodeId?: string }
  ): Promise<boolean> {
    const resourceInfo = resourceId
      ? ` (资源: ${JSON.stringify(resourceId)})`
      : '';
    this.logger.debug(
      `检查用户权限: ${user.id} (${user.username}) - ${permission}${resourceInfo}`
    );

    try {
      // 从角色的权限列表中检查
      const userPermissions = user.role?.permissions?.map(p => p.permission) || [];
      if (userPermissions.includes(permission)) {
        this.logger.debug(
          `用户 ${user.id} 通过角色权限检查: ${permission}`
        );
        return true;
      }

      // 检查节点访问权限
      if (resourceId?.nodeId) {
        return this.checkNodePermission(user, resourceId.nodeId, permission);
      }

      return false;
    } catch (error) {
      this.logger.error(`权限检查失败: ${error.message}`, error.stack);
      return false;
    }
  }

  /**
   * 检查节点访问权限
   */
  async checkNodePermission(
    user: UserWithPermissions,
    nodeId: string,
    permission: Permission
  ): Promise<boolean> {
    try {
      const role = await this.getNodeAccessRole(user.id, nodeId);
      if (!role) {
        return false;
      }

      const permissions = NODE_ACCESS_PERMISSIONS[role] || [];
      return permissions.includes(permission);
    } catch (error) {
      this.logger.error(`检查节点权限失败: ${error.message}`, error.stack);
      return false;
    }
  }

  /**
   * 获取用户在节点上的访问角色
   */
  async getNodeAccessRole(
    userId: string,
    nodeId: string
  ): Promise<NodeAccessRole | null> {
    try {
      // 先检查缓存
      const cachedRole = this.cacheService.getNodeAccessRole(userId, nodeId);
      if (cachedRole) {
        return cachedRole;
      }

      // 查询数据库
      const node = await this.prisma.fileSystemNode.findUnique({
        where: { id: nodeId },
        select: { ownerId: true, deletedAt: true },
      });

      if (!node || node.deletedAt) {
        return null;
      }

      // 如果是所有者，直接返回 OWNER
      if (node.ownerId === userId) {
        this.cacheService.cacheNodeAccessRole(
          userId,
          nodeId,
          NodeAccessRole.OWNER
        );
        return NodeAccessRole.OWNER;
      }

      // 查询 FileAccess 表获取角色
      const access = await this.prisma.fileAccess.findUnique({
        where: {
          userId_nodeId: { userId, nodeId },
        },
      });

      if (access) {
        this.cacheService.cacheNodeAccessRole(
          userId,
          nodeId,
          access.role as NodeAccessRole
        );
        return access.role as NodeAccessRole;
      }

      return null;
    } catch (error) {
      this.logger.error(`获取节点访问角色失败: ${error.message}`, error.stack);
      return null;
    }
  }

  /**
   * 检查用户是否具有指定角色之一
   */
  async hasNodeAccessRole(
    user: UserWithPermissions,
    nodeId: string,
    roles: NodeAccessRole[]
  ): Promise<boolean> {
    const role = await this.getNodeAccessRole(user.id, nodeId);
    return role ? roles.includes(role) : false;
  }

  /**
   * 获取用户在节点上的所有权限
   */
  async getNodePermissions(
    userId: string,
    nodeId: string
  ): Promise<Permission[]> {
    const role = await this.getNodeAccessRole(userId, nodeId);
    if (!role) {
      return [];
    }
    return NODE_ACCESS_PERMISSIONS[role] || [];
  }

  hasRole(user: UserWithPermissions, roleNames: string[]): boolean {
    return roleNames.includes(user.role?.name || '');
  }

  async getUserPermissions(user: UserWithPermissions): Promise<Permission[]> {
    try {
      return user.role?.permissions?.map(p => p.permission) || [];
    } catch (error) {
      this.logger.error(`获取用户权限失败: ${error.message}`, error.stack);
      return [];
    }
  }
}
