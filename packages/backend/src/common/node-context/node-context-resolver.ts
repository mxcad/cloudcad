import { Injectable, Logger } from '@nestjs/common';
import { NodeType } from '@cloudcad/db';
import { FileTreeService } from '../../file-system/file-tree/file-tree.service';
import { TreeWalker } from '../../file-system/file-tree/tree-walker.service';
import {
  LibraryRootType,
  NodeContext,
  RequestLike,
} from './node-context.types';

@Injectable()
export class NodeContextResolver {
  private readonly logger = new Logger(NodeContextResolver.name);

  constructor(
    private readonly fileTreeService: FileTreeService,
    private readonly treeWalker: TreeWalker
  ) {}

  /**
   * 解析请求节点上下文（判别联合，见 NodeContext）。
   * 归属根一律经 TreeWalker.resolveRootContext 一次 CTE 解析
   * （父链唯一事实源，不读 projectId 字段短路）；
   * 库内子节点（FILE/FOLDER）直接归入 library 分支。
   */
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

    const root = nodeId
      ? await this.treeWalker.resolveRootContext(nodeId)
      : null;
    const libraryRootType: LibraryRootType | null =
      root &&
      (root.rootType === NodeType.LIBRARY_DRAWING ||
        root.rootType === NodeType.LIBRARY_BLOCK)
        ? (root.rootType as LibraryRootType)
        : null;
    const isPersonalSpace = nodeType === NodeType.PERSONAL_SPACE;

    let projectId: string | null = null;
    if (nodeId && !libraryRootType && !isPersonalSpace) {
      projectId = root?.rootId ?? null;
    }
    if (!projectId) {
      projectId = await this.extractProjectId(request);
    }

    if (libraryRootType) {
      return {
        kind: 'library',
        rootType: libraryRootType,
        nodeId,
        ownerId,
      };
    }
    if (isPersonalSpace) {
      return { kind: 'personalSpace', nodeId, ownerId };
    }
    if (projectId) {
      return { kind: 'project', projectId, nodeId, ownerId };
    }
    if (nodeId && nodeType) {
      return { kind: 'nodeOwner', nodeId, nodeType, ownerId };
    }
    return { kind: 'none', nodeId, ownerId };
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
        try {
          const root = await this.treeWalker.resolveRootContext(pid);
          return root?.rootId ?? pid;
        } catch (error) {
          this.logger.warn(
            `解析请求 projectId 失败 pid=${pid}: ${error instanceof Error ? error.message : String(error)}`
          );
          return pid;
        }
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
      const root = await this.treeWalker.resolveRootContext(nodeId);
      return root?.rootId ?? null;
    } catch (error) {
      this.logger.warn(
        `提取项目ID失败 nodeId=${nodeId}: ${error instanceof Error ? error.message : String(error)}`
      );
      return null;
    }
  }
}
