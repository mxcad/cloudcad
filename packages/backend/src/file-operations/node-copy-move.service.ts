import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { NodeType } from '@cloudcad/db';
import { DatabaseService } from '../database/database.service';
import { TreeWalker } from '../file-system/file-tree/tree-walker.service';
import { StorageManager } from '../storage-management/services/storage-manager.service';
import { NodeSizeResolverService } from '../file-system/storage-quota/node-size-resolver.service';
import { StorageUsageService } from '../vip/storage-usage/storage-usage.service';
import * as path from 'path';
import { I18nContext } from 'nestjs-i18n';
import { NodeNameService } from './node-name.service';
import { NodeMutationGuard } from './node-mutation.guard';
import { AuditLogService } from '../audit/audit-log.service';
import { AuditAction, ResourceType } from '../common/enums/audit.enum';

@Injectable()
export class NodeCopyMoveService {
  private readonly logger = new Logger(NodeCopyMoveService.name);

  constructor(
    private readonly prisma: DatabaseService,
    private readonly storageManager: StorageManager,
    private readonly treeWalker: TreeWalker,
    private readonly nodeNameService: NodeNameService,
    private readonly nodeMutationGuard: NodeMutationGuard,
    private readonly nodeSizeResolver: NodeSizeResolverService,
    private readonly storageUsageService: StorageUsageService,
    private readonly auditLogService: AuditLogService
  ) {}

  async moveNode(nodeId: string, targetParentId: string, userId?: string) {
    try {
      const node = await this.prisma.fileSystemNode.findUnique({
        where: { id: nodeId },
        select: {
          nodeType: true,
          parentId: true,
          name: true,
          ownerId: true,
          projectId: true,
          size: true,
          path: true,
        },
      });

      if (!node) {
        throw new NotFoundException(
          I18nContext.current()?.t('error.node.not_found') ?? '节点不存在'
        );
      }
      if (
        node.nodeType !== NodeType.FILE &&
        node.nodeType !== NodeType.FOLDER
      ) {
        throw new BadRequestException(
          I18nContext.current()?.t('error.file.cannot_move_root') ??
            '不能移动根节点'
        );
      }

      const targetParent = await this.prisma.fileSystemNode.findUnique({
        where: { id: targetParentId },
        select: { nodeType: true, projectId: true },
      });
      if (!targetParent) {
        throw new NotFoundException(
          I18nContext.current()?.t('error.file.target_parent_not_found') ??
            '目标父节点不存在'
        );
      }
      if (
        targetParent.nodeType !== NodeType.FOLDER &&
        targetParent.nodeType !== NodeType.PROJECT &&
        targetParent.nodeType !== NodeType.PERSONAL_SPACE &&
        targetParent.nodeType !== NodeType.LIBRARY_DRAWING &&
        targetParent.nodeType !== NodeType.LIBRARY_BLOCK
      ) {
        throw new BadRequestException(
          I18nContext.current()?.t(
            'error.file.parent_must_be_folder_or_root'
          ) ?? '目标父节点必须是文件夹或项目根目录'
        );
      }
      if (nodeId === targetParentId) {
        throw new BadRequestException(
          I18nContext.current()?.t('error.file.cannot_move_to_self') ??
            '不能将节点移动到自身'
        );
      }
      if (node.parentId === targetParentId) {
        return node;
      }

      const uniqueName = await this.nodeNameService.generateUniqueName(
        targetParentId,
        node.name,
        node.nodeType === NodeType.FOLDER
      );
      const newProjectId = await this.treeWalker.resolveProjectId(targetParentId);

      // 同项目内移动不改变项目总用量，配额增量按 0 处理；
      // 仅跨项目移动时把子树体积计入目标项目/个人空间配额（避免重复计数误拦）
      const sourceProjectId =
        node.projectId ?? (await this.treeWalker.resolveProjectId(nodeId));
      const incrementBytes =
        sourceProjectId === newProjectId
          ? 0
          : await this.getCopyTotalSize(node, nodeId);
      if (userId) {
        await this.nodeMutationGuard.assertMutationAllowed(userId, 'move', {
          node: { id: nodeId },
          target: { id: targetParentId },
          incrementBytes,
        });
      } else if (node.ownerId) {
        await this.nodeMutationGuard.assertByteQuota(
          {
            node: { id: nodeId },
            target: { id: targetParentId },
            incrementBytes,
          },
          node.ownerId
        );
      }

      const movedNode = await this.prisma.fileSystemNode.update({
        where: { id: nodeId },
        data: {
          parentId: targetParentId,
          projectId: newProjectId,
          name: uniqueName,
        },
        include: {
          owner: { select: { id: true, username: true, nickname: true } },
        },
      });

      // 跨项目移动后级联更新子树 projectId（冗余字段保持与根一致，
      // 避免 trash 恢复等直读 projectId 字段的路径取到陈旧值；查询路径由 TreeWalker 兜底）
      if (sourceProjectId !== newProjectId) {
        const subtreeIds = await this.treeWalker.getSubtreeIds(nodeId, {
          includeRoot: true,
          includeDeleted: false,
        });
        if (subtreeIds.length > 0) {
          await this.prisma.fileSystemNode.updateMany({
            where: { id: { in: subtreeIds } },
            data: { projectId: newProjectId },
          });
        }
      }

      if (node.ownerId) {
        await this.nodeMutationGuard.invalidateQuotaAfterMutation(
          node.ownerId,
          node,
          newProjectId
        );
      }

      this.logger.log(`节点移动成功: ${nodeId} -> ${targetParentId}`);
      // 移动审计（NODE_MOVE）：仅项目内节点记录；跨项目移动后归属新项目（projectId 已更新）；
      // 无操作者（匿名）不记，避免落假 actor 记录
      if (userId) {
        await this.auditLogService.logProjectNodeAction(
          AuditAction.NODE_MOVE,
          nodeId,
          userId,
          {
            oldParentId: node.parentId,
            newParentId: targetParentId,
            oldName: node.name,
            newName: uniqueName,
          },
          node.nodeType === NodeType.FOLDER
            ? ResourceType.FOLDER
            : ResourceType.FILE
        );
      }
      return movedNode;
    } catch (error) {
      this.logger.error(`节点移动失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  async copyNode(nodeId: string, targetParentId: string, userId?: string) {
    try {
      const node = await this.prisma.fileSystemNode.findUnique({
        where: { id: nodeId },
        select: {
          id: true,
          name: true,
          nodeType: true,
          originalName: true,
          path: true,
          size: true,
          mimeType: true,
          extension: true,
          fileStatus: true,
          fileHash: true,
          description: true,
          ownerId: true,
          projectId: true,
        },
      });

      if (!node) {
        throw new NotFoundException(
          I18nContext.current()?.t('error.node.not_found') ?? '节点不存在'
        );
      }
      if (
        node.nodeType !== NodeType.FILE &&
        node.nodeType !== NodeType.FOLDER
      ) {
        throw new BadRequestException(
          I18nContext.current()?.t('error.file.cannot_copy_root') ??
            '不能拷贝根节点'
        );
      }

      const targetParent = await this.prisma.fileSystemNode.findUnique({
        where: { id: targetParentId },
        select: { nodeType: true },
      });
      if (!targetParent) {
        throw new NotFoundException(
          I18nContext.current()?.t('error.file.target_parent_not_found') ??
            '目标父节点不存在'
        );
      }
      if (
        targetParent.nodeType !== NodeType.FOLDER &&
        targetParent.nodeType !== NodeType.PROJECT &&
        targetParent.nodeType !== NodeType.PERSONAL_SPACE &&
        targetParent.nodeType !== NodeType.LIBRARY_DRAWING &&
        targetParent.nodeType !== NodeType.LIBRARY_BLOCK
      ) {
        throw new BadRequestException(
          I18nContext.current()?.t(
            'error.file.parent_must_be_folder_or_root'
          ) ?? '目标父节点必须是文件夹或项目根目录'
        );
      }
      if (nodeId === targetParentId) {
        throw new BadRequestException(
          I18nContext.current()?.t('error.file.cannot_copy_to_self') ??
            '不能将节点拷贝到自身'
        );
      }

      const uniqueName = await this.nodeNameService.generateUniqueName(
        targetParentId,
        node.name,
        node.nodeType === NodeType.FOLDER
      );

      const projectId = await this.treeWalker.resolveProjectId(targetParentId);

      // 复制前校验目标项目配额（文件夹按子树文件总大小计算，排除回收站/非 COMPLETED 文件）
      const copyTotalSize = await this.getCopyTotalSize(node, nodeId);
      if (userId) {
        await this.nodeMutationGuard.assertMutationAllowed(userId, 'copy', {
          node: { id: nodeId },
          target: { id: targetParentId },
          incrementBytes: copyTotalSize,
        });
      } else if (node.ownerId) {
        await this.nodeMutationGuard.assertByteQuota(
          {
            node: { id: nodeId },
            target: { id: targetParentId },
            incrementBytes: copyTotalSize,
          },
          node.ownerId
        );
      }

      const copiedNode = await this.copyNodeRecursive(
        nodeId,
        targetParentId,
        uniqueName,
        node.ownerId
      );

      if (node.ownerId) {
        await this.nodeMutationGuard.invalidateQuotaAfterMutation(
          node.ownerId,
          node,
          projectId
        );
      }

      this.logger.log(`节点拷贝成功: ${nodeId} -> ${copiedNode.id}`);
      // 复制审计（NODE_COPY）：resourceId 用新节点（归属目标项目）；无操作者（匿名）不记
      if (userId) {
        await this.auditLogService.logProjectNodeAction(
          AuditAction.NODE_COPY,
          copiedNode.id,
          userId,
          {
            sourceNodeId: nodeId,
            sourceName: node.name,
          },
          node.nodeType === NodeType.FOLDER
            ? ResourceType.FOLDER
            : ResourceType.FILE
        );
      }
      return copiedNode;
    } catch (error) {
      this.logger.error(`节点拷贝失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  async copyNodeRecursive(
    sourceNodeId: string,
    targetParentId: string,
    newName: string,
    ownerId: string
  ): Promise<any> {
    const sourceNode = await this.prisma.fileSystemNode.findUnique({
      where: { id: sourceNodeId },
    });
    let sourceNodeChildren: { id: string; name: string; nodeType: string }[] =
      [];
    if (sourceNode) {
      sourceNodeChildren = await this.prisma.fileSystemNode.findMany({
        where: { parentId: sourceNodeId, deletedAt: null },
        select: { id: true, name: true, nodeType: true },
      });
    }
    if (!sourceNode) {
      throw new NotFoundException(
        I18nContext.current()?.t('error.file.source_not_found') ??
          '源节点不存在'
      );
    }

    const projectId = await this.treeWalker.resolveProjectId(targetParentId);
    const newNode = await this.prisma.fileSystemNode.create({
      data: {
        name: newName,
        originalName: sourceNode.originalName || newName,
        nodeType: sourceNode.nodeType,
        parentId: targetParentId,
        path: sourceNode.path,
        size: sourceNode.size,
        mimeType: sourceNode.mimeType,
        extension: sourceNode.extension,
        fileStatus: sourceNode.fileStatus,
        fileHash: sourceNode.fileHash,
        description: sourceNode.description,
        ownerId,
        projectId,
      },
      include: {
        owner: { select: { id: true, username: true, nickname: true } },
      },
    });

    if (sourceNode.nodeType === NodeType.FILE && sourceNode.path) {
      try {
        const sourceDirRelativePath =
          this.storageManager.getNodeDirectoryRelativePath(sourceNode.path);
        const fileName = path.basename(sourceNode.path);
        const newFilePath = await this.storageManager.copyNodeDirectory(
          sourceDirRelativePath,
          newNode.id,
          fileName
        );
        await this.prisma.fileSystemNode.update({
          where: { id: newNode.id },
          data: { path: newFilePath },
        });
      } catch (error) {
        this.logger.error(`复制文件失败: ${sourceNodeId}`, error.stack);
      }
    }

    if (
      sourceNode.nodeType === NodeType.FOLDER &&
      sourceNodeChildren.length > 0
    ) {
      const usedNames = new Set<string>();
      for (const child of sourceNodeChildren) {
        let childUniqueName = child.name;
        let counter = 1;
        const existingNames = await this.prisma.fileSystemNode.findMany({
          where: { parentId: newNode.id, deletedAt: null },
          select: { name: true },
        });
        const existingNamesSet = new Set(existingNames.map((n) => n.name));
        while (
          existingNamesSet.has(childUniqueName) ||
          usedNames.has(childUniqueName)
        ) {
          const lastDotIndex = child.name.lastIndexOf('.');
          childUniqueName =
            lastDotIndex === -1
              ? `${child.name} (${counter})`
              : `${child.name.substring(0, lastDotIndex)} (${counter})${child.name.substring(lastDotIndex)}`;
          counter++;
        }
        usedNames.add(childUniqueName);
        await this.copyNodeRecursive(
          child.id,
          newNode.id,
          childUniqueName,
          ownerId
        );
      }
    }
    return newNode;
  }

  /**
   * 计算待复制/移动节点的总体积：FILE 用自身 size，FOLDER 聚合子树中 FILE 节点大小
   */
  private async getCopyTotalSize(
    node: {
      nodeType: NodeType;
      size: number | null;
      path: string | null;
    },
    nodeId: string
  ): Promise<number> {
    if (node.nodeType === NodeType.FILE) {
      return this.nodeSizeResolver.resolveFileSize(node, nodeId);
    }
    return this.getSubtreeFileTotalSize(nodeId);
  }

  /**
   * 聚合子树中 FILE 节点总大小（仅统计未删除且 COMPLETED 的文件）；
   * size 为 null 的节点按物理文件大小兜底（防配额增量被算成 0，#215）
   */
  private async getSubtreeFileTotalSize(nodeId: string): Promise<number> {
    const files = await this.storageUsageService.getSubtreeFileNodes({
      kind: 'subtree',
      nodeId,
      status: 'completed',
    });
    return this.nodeSizeResolver.resolveFileSizes(files);
  }

  private async filterDescendantNodes(nodeIds: string[]): Promise<string[]> {
    if (nodeIds.length <= 1) return nodeIds;
    const nodes = await this.prisma.fileSystemNode.findMany({
      where: { id: { in: nodeIds } },
      select: { id: true, parentId: true },
    });
    const parentMap = new Map<string, string | null>();
    for (const n of nodes) parentMap.set(n.id, n.parentId);
    let result = [...nodeIds];
    let changed = true;
    while (changed) {
      const resultSet = new Set(result);
      const filtered = result.filter((id) => {
        const parentId = parentMap.get(id);
        return !(parentId && resultSet.has(parentId));
      });
      changed = filtered.length !== result.length;
      result = filtered;
    }
    return result;
  }

  async batchMoveNodes(
    nodeIds: string[],
    targetParentId: string,
    userId?: string
  ) {
    const dedupedIds = await this.filterDescendantNodes(nodeIds);
    if (dedupedIds.length === 0) {
      return {
        successCount: 0,
        failedCount: 0,
        successIds: [],
        failedIds: [],
        errors: ['所有节点均为子节点，已自动跳过'],
      };
    }
    const successIds: string[] = [];
    const failedIds: string[] = [];
    const errors: string[] = [];
    for (const nodeId of dedupedIds) {
      try {
        await this.moveNode(nodeId, targetParentId, userId);
        successIds.push(nodeId);
      } catch (error) {
        failedIds.push(nodeId);
        errors.push(`节点 ${nodeId}: ${error.message}`);
        this.logger.error(`批量移动节点失败: ${nodeId}`, error.message);
      }
    }
    return {
      successCount: successIds.length,
      failedCount: failedIds.length,
      successIds,
      failedIds,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  async batchCopyNodes(
    nodeIds: string[],
    targetParentId: string,
    userId?: string
  ) {
    const dedupedIds = await this.filterDescendantNodes(nodeIds);
    if (dedupedIds.length === 0) {
      return {
        successCount: 0,
        failedCount: 0,
        successIds: [],
        failedIds: [],
        errors: ['所有节点均为子节点，已自动跳过'],
      };
    }
    const successIds: string[] = [];
    const failedIds: string[] = [];
    const errors: string[] = [];
    for (const nodeId of dedupedIds) {
      try {
        // 配额校验在 copyNode 内统一执行（NodeMutationGuard）
        await this.copyNode(nodeId, targetParentId, userId);
        successIds.push(nodeId);
      } catch (error) {
        failedIds.push(nodeId);
        errors.push(`节点 ${nodeId}: ${error.message}`);
        this.logger.error(`批量复制节点失败: ${nodeId}`, error.message);
      }
    }
    return {
      successCount: successIds.length,
      failedCount: failedIds.length,
      successIds,
      failedIds,
      errors: errors.length > 0 ? errors : undefined,
    };
  }
}
