import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Permission } from '../common/enums/permissions.enum';
import { PermissionCacheService } from '../common/services/permission-cache.service';
import { DatabaseService } from '../database/database.service';

const PROJECT_MEMBER_PERMISSIONS = {
  OWNER: [
    Permission.FILE_READ,
    Permission.FILE_WRITE,
    Permission.FILE_DELETE,
    Permission.PROJECT_MEMBER_MANAGE,
  ],
  ADMIN: [Permission.FILE_READ, Permission.FILE_WRITE, Permission.FILE_DELETE],
  MEMBER: [Permission.FILE_READ, Permission.FILE_WRITE],
  VIEWER: [Permission.FILE_READ],
};

const FILE_ACCESS_PERMISSIONS = {
  OWNER: [Permission.FILE_READ, Permission.FILE_WRITE, Permission.FILE_DELETE],
  EDITOR: [Permission.FILE_READ, Permission.FILE_WRITE],
  VIEWER: [Permission.FILE_READ],
};

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

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (user?.role === UserRole.ADMIN) {
      this.cache.set(cacheKey, true, 600000);
      return true;
    }

    const node = await this.prisma.fileSystemNode.findUnique({
      where: { id: nodeId },
      select: { ownerId: true, isRoot: true, parentId: true },
    });

    if (!node) {
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
      const hasPermission = FILE_ACCESS_PERMISSIONS[nodeAccess.role].includes(
        requiredPermission
      );
      this.cache.set(cacheKey, hasPermission, 300000);
      return hasPermission;
    }

    const rootNode = await this.findRootNode(nodeId);
    if (rootNode) {
      const membership = await this.prisma.projectMember.findUnique({
        where: { userId_nodeId: { userId, nodeId: rootNode.id } },
      });
      if (membership) {
        const hasPermission = PROJECT_MEMBER_PERMISSIONS[
          membership.role
        ].includes(requiredPermission);
        this.cache.set(cacheKey, hasPermission, 300000);
        return hasPermission;
      }
    }

    this.cache.set(cacheKey, false, 300000);
    return false;
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
