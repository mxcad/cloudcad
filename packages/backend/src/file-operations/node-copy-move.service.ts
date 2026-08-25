import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { NodeType, FileStatus } from '@cloudcad/db';
import { randomUUID } from 'crypto';
import { DatabaseService } from '../database/database.service';
import { TreeWalker } from '../file-system/file-tree/tree-walker.service';
import type { SubtreeRowInfo } from '../file-system/file-tree/tree-walker.service';
import { StorageManager } from '../storage-management/services/storage-manager.service';
import { NodeSizeResolverService } from '../file-system/storage-quota/node-size-resolver.service';
import { StorageUsageService } from '../vip/storage-usage/storage-usage.service';
import * as path from 'path';
import { I18nContext } from 'nestjs-i18n';
import { NodeNameService } from './node-name.service';
import { NodeMutationGuard } from './node-mutation.guard';
import { AuditLogService } from '../audit/audit-log.service';
import { AuditAction, ResourceType } from '../common/enums/audit.enum';

/** 复制计划节点（阶段一产出，阶段三落库输入） */
interface PlannedCopyNode {
  id: string;
  parentId: string;
  name: string;
  originalName: string | null;
  nodeType: NodeType;
  /** 源 FILE 的存储路径（null=无需物理复制）；落库时以复制结果覆盖 */
  sourcePath: string | null;
  size: number | null;
  mimeType: string | null;
  extension: string | null;
  fileStatus: FileStatus | null;
  fileHash: string | null;
  description: string | null;
}

/** 计划建树输入的最小行形状（源根节点行 / getSubtreeRows 行均满足） */
type SubtreeRowInfoLike = Pick<
  SubtreeRowInfo,
  | 'id'
  | 'name'
  | 'originalName'
  | 'nodeType'
  | 'path'
  | 'size'
  | 'mimeType'
  | 'extension'
  | 'fileStatus'
  | 'fileHash'
  | 'description'
>;

/** 复制落库产物：新根节点（含 owner 摘要） */
export interface CreatedCopyRoot {
  id: string;
  name: string;
  parentId: string | null;
  nodeType: NodeType;
  path: string | null;
  owner?: { id: string; username: string; nickname: string } | null;
}

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
      // 环检测：文件夹不可移入自身子树（否则祖先链遍历死循环）
      if (
        node.nodeType === NodeType.FOLDER &&
        (await this.treeWalker.isDescendantOf(targetParentId, nodeId))
      ) {
        throw new BadRequestException(
          I18nContext.current()?.t('error.file.cannot_move_to_descendant') ??
            '不能将文件夹移动到其自身内部'
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
      const newProjectId =
        await this.treeWalker.resolveProjectId(targetParentId);

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

      // 主节点更新与子树 projectId 级联在同一事务内完成，
      // 避免双写中途失败留下"主节点已迁移、子树归属陈旧"的中间态
      const movedNode = await this.prisma.$transaction(async (tx) => {
        const updated = await tx.fileSystemNode.update({
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
            await tx.fileSystemNode.updateMany({
              where: { id: { in: subtreeIds } },
              data: { projectId: newProjectId },
            });
          }
        }
        return updated;
      });

      if (node.ownerId) {
        await this.invalidateQuotaCaches(
          [
            userId,
            node.ownerId,
            await this.resolveRootOwnerId(newProjectId),
            await this.resolveRootOwnerId(sourceProjectId),
          ],
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
      // 环检测：文件夹不可复制进自身子树（副本会包含目标祖先，形成自嵌套）
      if (
        node.nodeType === NodeType.FOLDER &&
        (await this.treeWalker.isDescendantOf(targetParentId, nodeId))
      ) {
        throw new BadRequestException(
          I18nContext.current()?.t('error.file.cannot_copy_to_descendant') ??
            '不能将文件夹复制到其自身内部'
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

      // 副本 ownerId = 当前操作用户（匿名内部调用回退源 owner）；
      // 修复跨根副本沿用源 owner 导致的归属语义错位
      const ownerIdForCopy = userId ?? node.ownerId;
      const copiedNode = await this.copyNodeRecursive(
        nodeId,
        targetParentId,
        uniqueName,
        ownerIdForCopy,
        projectId
      );

      // 配额缓存失效对象修正：复制只改变目标归属的用量 → 操作者 + 目标根 owner
      await this.invalidateQuotaCaches(
        [userId, await this.resolveRootOwnerId(projectId)],
        node,
        projectId
      );

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

  /**
   * 复制子树（三阶段：计划 → 物理复制 → 单事务落库）
   *
   * - 计划：一次查询拉全源子树（getSubtreeRows），内存建树并生成新节点 id 与
   *   兄弟重名后缀（新目录初始为空，仅需集合内去重，消除逐 child 查库的 N+1）；
   * - 物理复制：逐 FILE 调 StorageManager.copyNodeDirectory（含外部参照/缩略图整个
   *   节点目录），任一失败即中止抛错——DB 尚未写入，不会出现"副本指向源存储目录"
   *   的事故；已复制成功的目录成为无 DB 记录的无害孤儿；
   * - 落库：单事务按父先子后创建全部节点（携带最终 path），任一失败整体回滚。
   */
  async copyNodeRecursive(
    sourceNodeId: string,
    targetParentId: string,
    newName: string,
    ownerId: string,
    projectId: string | null
  ): Promise<CreatedCopyRoot | null> {
    const sourceNode = await this.prisma.fileSystemNode.findUnique({
      where: { id: sourceNodeId },
    });
    if (!sourceNode) {
      throw new NotFoundException(
        I18nContext.current()?.t('error.file.source_not_found') ??
          '源节点不存在'
      );
    }

    // ── 阶段一：计划 ──────────────────────────────────────────────
    const { plans, newRootId } = await this.buildCopyPlan(
      sourceNodeId,
      sourceNode,
      targetParentId,
      newName
    );

    // ── 阶段二：物理复制（失败即中止，不留 DB 半成品） ───────────
    const finalPathByNodeId = await this.copyPlanDirectories(plans);

    // ── 阶段三：单事务落库（父先子后，任一失败整体回滚） ─────────
    return this.createCopiesInTransaction(
      plans,
      newRootId,
      finalPathByNodeId,
      ownerId,
      projectId
    );
  }

  /**
   * 阶段一：构建复制计划。一次查询拉全源子树，内存建树并生成新节点 id 与
   * 兄弟重名后缀（新目录初始为空，仅需集合内去重）。
   */
  private async buildCopyPlan(
    sourceNodeId: string,
    sourceNode: SubtreeRowInfoLike,
    targetParentId: string,
    newName: string
  ): Promise<{ plans: PlannedCopyNode[]; newRootId: string }> {
    const subtreeRows = await this.treeWalker.getSubtreeRows(sourceNodeId);
    const childrenByParent = new Map<string, SubtreeRowInfo[]>();
    for (const row of subtreeRows) {
      const siblings = childrenByParent.get(row.parentId ?? '') ?? [];
      siblings.push(row);
      childrenByParent.set(row.parentId ?? '', siblings);
    }

    const appendSuffix = (name: string, counter: number): string => {
      const lastDotIndex = name.lastIndexOf('.');
      return lastDotIndex === -1
        ? `${name} (${counter})`
        : `${name.substring(0, lastDotIndex)} (${counter})${name.substring(lastDotIndex)}`;
    };

    const plans: PlannedCopyNode[] = [];
    const planSubtree = (
      src: SubtreeRowInfoLike,
      newParentId: string,
      forcedName?: string
    ): string => {
      const newId = randomUUID();
      plans.push({
        id: newId,
        parentId: newParentId,
        name: forcedName ?? src.name,
        originalName: src.originalName || src.name,
        nodeType: src.nodeType,
        sourcePath: src.nodeType === NodeType.FILE ? src.path : null,
        size: src.size,
        mimeType: src.mimeType,
        extension: src.extension,
        fileStatus: src.fileStatus,
        fileHash: src.fileHash,
        description: src.description,
      });
      if (src.nodeType === NodeType.FOLDER) {
        const children = childrenByParent.get(src.id) ?? [];
        const usedNames = new Set<string>();
        for (const child of children) {
          let childName = child.name;
          let counter = 1;
          while (usedNames.has(childName)) {
            childName = appendSuffix(child.name, counter++);
          }
          usedNames.add(childName);
          planSubtree(child, newId, childName);
        }
      }
      return newId;
    };

    const newRootId = planSubtree(sourceNode, targetParentId, newName);
    return { plans, newRootId };
  }

  /**
   * 阶段二：逐 FILE 计划复制存储目录（含外部参照/缩略图整个节点目录）。
   * 任一失败即中止抛错——DB 尚未写入，已复制成功的目录成为无 DB 记录的孤儿。
   */
  private async copyPlanDirectories(
    plans: PlannedCopyNode[]
  ): Promise<Map<string, string>> {
    const finalPathByNodeId = new Map<string, string>();
    for (const plan of plans) {
      if (!plan.sourcePath) continue;
      try {
        const sourceDirRelativePath =
          this.storageManager.getNodeDirectoryRelativePath(plan.sourcePath);
        const fileName = path.basename(plan.sourcePath);
        const newFilePath = await this.storageManager.copyNodeDirectory(
          sourceDirRelativePath,
          plan.id,
          fileName
        );
        finalPathByNodeId.set(plan.id, newFilePath);
      } catch (error) {
        this.logger.error(
          `复制文件物理目录失败，已中止整次复制: 源节点 ${plan.sourcePath}`,
          error.stack
        );
        throw new BadRequestException(
          I18nContext.current()?.t('error.file.copy_physical_failed') ??
            '文件复制失败：存储目录复制未成功，请稍后重试'
        );
      }
    }
    return finalPathByNodeId;
  }

  /** 阶段三：单事务按计划顺序创建全部节点（携带最终 path），返回新根节点 */
  private async createCopiesInTransaction(
    plans: PlannedCopyNode[],
    newRootId: string,
    finalPathByNodeId: Map<string, string>,
    ownerId: string,
    projectId: string | null
  ): Promise<CreatedCopyRoot | null> {
    return this.prisma.$transaction(async (tx) => {
      let rootNode: CreatedCopyRoot | null = null;
      for (const plan of plans) {
        const created = await tx.fileSystemNode.create({
          data: {
            id: plan.id,
            name: plan.name,
            originalName: plan.originalName,
            nodeType: plan.nodeType,
            parentId: plan.parentId,
            path: finalPathByNodeId.get(plan.id) ?? null,
            size: plan.size,
            mimeType: plan.mimeType,
            extension: plan.extension,
            fileStatus: plan.fileStatus,
            fileHash: plan.fileHash,
            description: plan.description,
            ownerId,
            projectId,
          },
          include: {
            owner: { select: { id: true, username: true, nickname: true } },
          },
        });
        if (plan.id === newRootId) rootNode = created;
      }
      return rootNode;
    });
  }

  /**
   * 解析归属根（项目/个人空间/库根）的 ownerId；projectId 为空返回 null
   */
  private async resolveRootOwnerId(
    projectId: string | null
  ): Promise<string | null> {
    if (!projectId) return null;
    const root = await this.prisma.fileSystemNode.findUnique({
      where: { id: projectId },
      select: { ownerId: true },
    });
    return root?.ownerId ?? null;
  }

  /**
   * 配额缓存失效统一入口：对去重后的相关用户逐个失效
   * （操作者 / 源 owner / 目标根 owner——用量变化方都必须清缓存）
   */
  private async invalidateQuotaCaches(
    userIds: Array<string | null | undefined>,
    node: { projectId?: string | null },
    extraProjectId?: string | null
  ): Promise<void> {
    const seen = new Set<string>();
    for (const uid of userIds) {
      if (!uid || seen.has(uid)) continue;
      seen.add(uid);
      await this.nodeMutationGuard.invalidateQuotaAfterMutation(
        uid,
        node,
        extraProjectId
      );
    }
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
    const createdIds: string[] = [];
    const failedIds: string[] = [];
    const errors: string[] = [];
    for (const nodeId of dedupedIds) {
      try {
        // 配额校验在 copyNode 内统一执行（NodeMutationGuard）
        const copiedNode = await this.copyNode(nodeId, targetParentId, userId);
        successIds.push(nodeId);
        createdIds.push(copiedNode.id);
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
      // 新副本 id（≠ successIds 的源节点 id）：前端 undo 需按副本 id 回滚删除
      createdIds,
      errors: errors.length > 0 ? errors : undefined,
    };
  }
}
