import { Injectable, Logger } from '@nestjs/common';
import { NodeType } from '@cloudcad/db';
import { DatabaseService } from '../../database/database.service';
import { FileTreeService } from '../../file-system/file-tree/file-tree.service';
import { NodeContext, RequestLike } from './node-context.types';

@Injectable()
export class NodeContextResolver {
  private readonly logger = new Logger(NodeContextResolver.name);

  constructor(
    private readonly prisma: DatabaseService,
    private readonly fileTreeService: FileTreeService
  ) {}

  async resolve(request: RequestLike): Promise<NodeContext> {
    const nodeId = this.extractNodeId(request);
    let nodeType: string | null = null;
    let ownerId: string | null = null;

    if (nodeId) {
      try {
        const meta = await this.fileTreeService.getNodeTypeAndOwner(nodeId);
        nodeType = meta.nodeType;
        ownerId = meta.ownerId;
      } catch (error) {
        this.logger.warn(
          `获取节点类型失败 nodeId=${nodeId}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    let isLibraryNode =
      nodeType === NodeType.LIBRARY_DRAWING ||
      nodeType === NodeType.LIBRARY_BLOCK;
    let libraryRootType: string | null = null;
    if (isLibraryNode) {
      libraryRootType = nodeType;
    } else if (
      nodeId &&
      (nodeType === NodeType.FILE || nodeType === NodeType.FOLDER)
    ) {
      // 库内子节点（文件/文件夹）上溯识别公共资源库根，与 TreeWalker.resolveProjectId 语义对齐
      libraryRootType = await this.lookupLibraryRootType(nodeId);
      isLibraryNode = libraryRootType !== null;
    }
    const isPersonalSpace = nodeType === NodeType.PERSONAL_SPACE;

    let projectId: string | null = null;
    if (nodeId && !isLibraryNode && !isPersonalSpace) {
      projectId = await this.extractProjectIdFromNode(nodeId);
    }
    if (!projectId) {
      projectId = await this.extractProjectId(request);
    }

    return {
      nodeId,
      projectId,
      nodeType,
      ownerId,
      isLibraryNode,
      isPersonalSpace,
      libraryRootType,
    };
  }

  extractNodeId(request: RequestLike): string | null {
    const body = request.body ?? {};
    return (
      request.params?.nodeId ??
      request.params?.parentId ??
      (body.nodeId as string | undefined) ??
      (body.parentId as string | undefined) ??
      (body.itemIds as string[] | undefined)?.[0] ??
      (body.nodeIds as string[] | undefined)?.[0] ??
      request.query?.nodeId ??
      request.query?.parentId ??
      null
    );
  }

  async extractProjectId(request: RequestLike): Promise<string | null> {
    for (const source of [
      request.params,
      request.query,
      request.body,
    ] as const) {
      const pid = source?.projectId as string | undefined;
      if (pid) {
        const resolved = await this.lookupNodeProjectId(pid);
        if (resolved) return resolved;
        return pid;
      }
    }

    const nodeId = this.extractNodeId(request);
    if (nodeId) {
      return this.extractProjectIdFromNode(nodeId);
    }

    return null;
  }

  async extractProjectIdFromNode(nodeId: string): Promise<string | null> {
    try {
      const resolved = await this.lookupNodeProjectId(nodeId);
      return resolved ?? null;
    } catch (error) {
      this.logger.warn(
        `提取项目ID失败 nodeId=${nodeId}: ${error instanceof Error ? error.message : String(error)}`
      );
      return null;
    }
  }

  private async lookupNodeProjectId(id: string): Promise<string | null> {
    try {
      const node = await this.prisma.fileSystemNode.findUnique({
        where: { id },
        select: { id: true, nodeType: true, projectId: true, parentId: true },
      });
      if (!node) return null;
      if (node.nodeType === NodeType.PROJECT) return node.id;
      // 公共资源库根节点视为库内节点的"项目根"（与 TreeWalker.resolveProjectId 语义对齐）
      if (
        node.nodeType === NodeType.LIBRARY_DRAWING ||
        node.nodeType === NodeType.LIBRARY_BLOCK
      ) {
        return node.id;
      }
      if (node.projectId) return node.projectId;
      if (node.parentId) return this.extractProjectIdFromNode(node.parentId);
      return null;
    } catch (error) {
      this.logger.warn(
        `lookupNodeProjectId失败 id=${id}: ${error instanceof Error ? error.message : String(error)}`
      );
      return null;
    }
  }

  /**
   * 沿 parentId 上溯查找公共资源库根节点类型（LIBRARY_DRAWING / LIBRARY_BLOCK）。
   * 仅对 FILE/FOLDER 节点调用；上溯到库根返回其类型，否则返回 null。
   */
  private async lookupLibraryRootType(nodeId: string): Promise<string | null> {
    try {
      const node = await this.prisma.fileSystemNode.findUnique({
        where: { id: nodeId },
        select: { nodeType: true, parentId: true },
      });
      if (!node) return null;
      if (
        node.nodeType === NodeType.LIBRARY_DRAWING ||
        node.nodeType === NodeType.LIBRARY_BLOCK
      ) {
        return node.nodeType;
      }
      if (
        node.nodeType !== NodeType.FILE &&
        node.nodeType !== NodeType.FOLDER
      ) {
        return null;
      }
      if (node.parentId) return this.lookupLibraryRootType(node.parentId);
      return null;
    } catch (error) {
      this.logger.warn(
        `lookupLibraryRootType失败 id=${nodeId}: ${error instanceof Error ? error.message : String(error)}`
      );
      return null;
    }
  }
}
