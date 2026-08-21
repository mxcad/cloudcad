import { Injectable } from '@nestjs/common';
import { FileStatus, NodeType, Prisma } from '@cloudcad/db';
import { DatabaseService } from '../../database/database.service';
import { TreeWalker } from '../../file-system/file-tree/tree-walker.service';
import { SubtreeUsageScope, UsageScope } from './usage-scope';

export interface SubtreeFileNode {
  id: string;
  size: number | null;
  path: string | null;
}

/**
 * 用量聚合深 module（#224）
 *
 * 配额读侧的文件大小聚合单一入口，取代策略 / storage-info / copy-move / trash /
 * user-crud 共 7 处近似重复的 fileSystemNode.aggregate。
 * 纯查询、无缓存（强制路径必须新鲜，展示缓存是展示层包装）。
 *
 * - usageSize：聚合字节数；个人空间缺失 / 空子树返回 0（module 管「用量是多少」）
 * - getSubtreeFileNodes：子树 FILE 节点列表（调用方需要 size-null 物理兜底时用，
 *   NodeSizeResolverService 属 file-system 层，见 #215——聚合值无法表达兜底语义）
 */
@Injectable()
export class StorageUsageService {
  constructor(
    private readonly prisma: DatabaseService,
    private readonly treeWalker: TreeWalker,
  ) {}

  async usageSize(scope: UsageScope): Promise<number> {
    const where = await this.buildWhere(scope);
    if (!where) {
      return 0;
    }
    const result = await this.prisma.fileSystemNode.aggregate({
      where,
      _sum: { size: true },
    });
    return result._sum.size ?? 0;
  }

  /**
   * 子树 FILE 节点列表（不含 rootId 自身）。status 语义与 usageSize 的 subtree variant 一致，
   * 返回节点元数据而非聚合值，供需要 size-null 物理兜底（resolveFileSizes）的调用方使用。
   */
  async getSubtreeFileNodes(
    scope: SubtreeUsageScope
  ): Promise<SubtreeFileNode[]> {
    const subtreeIds = await this.treeWalker.getSubtreeIds(scope.nodeId);
    if (subtreeIds.length === 0) {
      return [];
    }
    return this.prisma.fileSystemNode.findMany({
      where: {
        id: { in: subtreeIds },
        nodeType: NodeType.FILE,
        ...(scope.status === 'completed'
          ? { fileStatus: FileStatus.COMPLETED, deletedAt: null }
          : {}),
      },
      select: { id: true, size: true, path: true },
    });
  }

  private async buildWhere(
    scope: UsageScope
  ): Promise<Prisma.FileSystemNodeWhereInput | null> {
    switch (scope.kind) {
      case 'personal': {
        const personalSpace = await this.prisma.fileSystemNode.findFirst({
          where: { ownerId: scope.userId, nodeType: NodeType.PERSONAL_SPACE },
          select: { id: true },
        });
        if (!personalSpace) {
          return null;
        }
        return {
          ownerId: scope.userId,
          projectId: personalSpace.id,
          nodeType: NodeType.FILE,
          fileStatus: FileStatus.COMPLETED,
          deletedAt: null,
        };
      }
      case 'project':
        return {
          projectId: scope.projectId,
          nodeType: NodeType.FILE,
          fileStatus: FileStatus.COMPLETED,
          deletedAt: null,
        };
      case 'subtree': {
        const subtreeIds = await this.treeWalker.getSubtreeIds(scope.nodeId);
        if (subtreeIds.length === 0) {
          return null;
        }
        return {
          id: { in: subtreeIds },
          nodeType: NodeType.FILE,
          ...(scope.status === 'completed'
            ? { fileStatus: FileStatus.COMPLETED, deletedAt: null }
            : {}),
        };
      }
      case 'owned':
        return {
          ownerId: scope.userId,
          nodeType: NodeType.FILE,
          deletedAt: null,
        };
    }
  }
}
