import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  NODE_ACCESS_PERMISSIONS,
  NodeAccessRole,
  Permission,
} from '../common/enums/permissions.enum';
import { PermissionCacheService } from '../common/services/permission-cache.service';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class FileSystemPermissionService {
  private readonly logger = new Logger(FileSystemPermissionService.name);

  constructor(
    private readonly prisma: DatabaseService,
    private readonly cache: PermissionCacheService
  ) {}

  async checkNodePermission(
    userId: string,
    nodeId: string,
    requiredPermission: Permission
  ): Promise<boolean> {
    const cacheKey = `perm:${userId}:${nodeId}:${requiredPermission}`;
    const cached = this.cache.get<boolean>(cacheKey);
    if (cached !== null) return cached;

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

    if (user?.role?.name === 'ADMIN') {
      this.cache.set(cacheKey, true, 600000);
      return true;
    }

    const node = await this.prisma.fileSystemNode.findUnique({
      where: { id: nodeId },
      select: { ownerId: true, isRoot: true, parentId: true, deletedAt: true },
    });

    if (!node || node.deletedAt) {
      throw new NotFoundException('节点不存在');
    }

    if (node.ownerId === userId) {
      this.cache.set(cacheKey, true, 600000);
      return true;
    }

    const nodeAccess = await this.prisma.fileAccess.findUnique({
      where: { userId_nodeId: { userId, nodeId } },
    });

    if (nodeAccess) {
      const permissions = NODE_ACCESS_PERMISSIONS[nodeAccess.role] || [];
      const hasPermission = permissions.includes(requiredPermission);
      this.cache.set(cacheKey, hasPermission, 300000);
      return hasPermission;
    }

    const rootNode = await this.findRootNode(nodeId);
    if (rootNode && rootNode.id !== nodeId) {
      const rootAccess = await this.prisma.fileAccess.findUnique({
        where: { userId_nodeId: { userId, nodeId: rootNode.id } },
      });

      if (rootAccess) {
        const permissions = NODE_ACCESS_PERMISSIONS[rootAccess.role] || [];
        const hasPermission = permissions.includes(requiredPermission);
        this.cache.set(cacheKey, hasPermission, 300000);
        return hasPermission;
      }
    }

    this.cache.set(cacheKey, false, 300000);
    return false;
  }

  /**
   * 获取用户在节点上的访问角色
   */
  async getNodeAccessRole(
    userId: string,
    nodeId: string
  ): Promise<NodeAccessRole | null> {
    const node = await this.prisma.fileSystemNode.findUnique({
      where: { id: nodeId },
      select: { ownerId: true, deletedAt: true },
    });

    if (!node || node.deletedAt) {
      return null;
    }

    if (node.ownerId === userId) {
      return NodeAccessRole.OWNER;
    }

    const directAccess = await this.prisma.fileAccess.findUnique({
      where: { userId_nodeId: { userId, nodeId } },
    });

    if (directAccess) {
      return directAccess.role as NodeAccessRole;
    }

    const rootNode = await this.findRootNode(nodeId);
    if (rootNode && rootNode.id !== nodeId) {
      const rootAccess = await this.prisma.fileAccess.findUnique({
        where: { userId_nodeId: { userId, nodeId: rootNode.id } },
      });

      if (rootAccess) {
        return rootAccess.role as NodeAccessRole;
      }
    }

    return null;
  }

  /**
   * 检查用户是否具有指定角色之一
   */
  async hasNodeAccessRole(
    userId: string,
    nodeId: string,
    roles: NodeAccessRole[]
  ): Promise<boolean> {
    const role = await this.getNodeAccessRole(userId, nodeId);
    return role ? roles.includes(role) : false;
  }

  /**
   * 设置节点访问权限
   */
  async setNodeAccess(
    userId: string,
    nodeId: string,
    role: NodeAccessRole
  ): Promise<void> {
    await this.prisma.fileAccess.upsert({
      where: { userId_nodeId: { userId, nodeId } },
      update: { role },
      create: { userId, nodeId, role },
    });

    this.cache.clearNodeCache(nodeId);
  }

  /**
   * 移除节点访问权限
   */
  async removeNodeAccess(userId: string, nodeId: string): Promise<void> {
    await this.prisma.fileAccess.deleteMany({
      where: { userId, nodeId },
    });

    this.cache.clearNodeCache(nodeId);
  }

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
}
