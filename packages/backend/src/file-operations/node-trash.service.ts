import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Inject,
} from '@nestjs/common';
import {
  ProjectStatus,
  Prisma,
  FileStatus as PrismaFileStatus,
  NodeType,
} from '@cloudcad/db';
import { FileStatus } from '../common/enums/file-status.enum';
import { DatabaseService } from '../database/database.service';
import { StorageManager } from '../storage-management/services/storage-manager.service';
import { ConfigService } from '@nestjs/config';
import {
  IVersionControl,
  VERSION_CONTROL_TOKEN,
} from '../version-control/interfaces/version-control.interface';
import { FileStatusStateMachine } from '../file-system/file-status/file-status-state-machine';
import { NodeStatusTransitioner } from '../file-system/file-status/node-status-transitioner';
import {
  IPROJECT_PERMISSION_SERVICE,
  IProjectPermissionService,
} from '../roles/interfaces/project-permission-service.interface';
import {
  IPERMISSION_SERVICE,
  IPermissionService,
} from '../permission/interfaces/permission-service.interface';
import { ProjectPermission } from '../common/enums/permissions.enum';
import { ModuleRef } from '@nestjs/core';
import { IFunctionExecutor } from '../function-executor/function-executor.interface';
import * as path from 'path';
import { IStorageProvider } from '../storage/interfaces/storage-provider.interface';
import { I18nContext } from 'nestjs-i18n';
import { NodeNameService } from './node-name.service';
import {
  TreeWalker,
  SubtreeFileInfo,
} from '../file-system/file-tree/tree-walker.service';
import { NodeMutationGuard } from './node-mutation.guard';
import { NodeSizeResolverService } from '../file-system/storage-quota/node-size-resolver.service';
import { StorageUsageService } from '../vip/storage-usage/storage-usage.service';
import { AuditLogService } from '../audit/audit-log.service';
import { AuditAction, ResourceType } from '../common/enums/audit.enum';

@Injectable()
export class NodeTrashService {
  private readonly logger = new Logger(NodeTrashService.name);

  constructor(
    private readonly prisma: DatabaseService,
    private readonly storageManager: StorageManager,
    private readonly configService: ConfigService,
    @Inject(VERSION_CONTROL_TOKEN)
    private readonly versionControlService: IVersionControl,
    @Inject(IStorageProvider)
    private readonly storageProvider: IStorageProvider,
    @Inject(IPROJECT_PERMISSION_SERVICE)
    private readonly projectPermissionService: IProjectPermissionService,
    @Inject(IPERMISSION_SERVICE)
    private readonly permissionService: IPermissionService,
    private readonly nodeNameService: NodeNameService,
    private readonly treeWalker: TreeWalker,
    private readonly nodeMutationGuard: NodeMutationGuard,
    private readonly nodeStatusTransitioner: NodeStatusTransitioner,
    private readonly nodeSizeResolver: NodeSizeResolverService,
    private readonly storageUsageService: StorageUsageService,
    private readonly auditLogService: AuditLogService,
    private readonly moduleRef: ModuleRef
  ) {}

  /** 转换执行器的惰性解析缓存（见 cancelInflightConversions 的说明） */
  private _functionExecutor?: IFunctionExecutor;

  /**
   * 惰性解析 IFunctionExecutor。
   *
   * 用 ModuleRef 延迟获取而非构造注入：FunctionExecutorModule 经 forwardRef 指向
   * MxcadConversionModule，后者已 import FileOperationsModule，给本模块新增
   * FunctionExecutorModule 依赖会形成循环。仅用到 DI token（该接口模块无运行时依赖），
   * 因此只需此处的值导入，不产生模块级循环。
   * strict:false 未接线时返回 undefined，调用方自动跳过取消。
   */
  private getFunctionExecutor(): IFunctionExecutor | undefined {
    if (this._functionExecutor === undefined) {
      try {
        this._functionExecutor = this.moduleRef.get<IFunctionExecutor>(
          IFunctionExecutor,
          { strict: false }
        );
      } catch {
        this._functionExecutor = undefined;
      }
    }
    return this._functionExecutor;
  }

  /**
   * 取消子树内仍在进行的转换任务（软删/硬删共用，best-effort）。
   *
   * 删除发生在转换在途时（上传后立刻删除），不取消的后果：
   * - 白占转换并发槽（信号量），有效容量被已删文件的任务占住；
   * - 完成回调打到已删节点上（DELETED→COMPLETED 是状态机合法边，会让已删文件
   *   静默「复活」为 COMPLETED；DELETED→FAILED 非法会抛错并触发 3 次无意义重试）。
   *   后者已在 AsyncConversionService.updateNodeStatus 兜住，此处是源头止损。
   *
   * process-pool / cloud-faas 模式无 cancelTask（undefined）→ 跳过，
   * 由 updateNodeStatus 的已删守卫在转换自然结束时清理。
   *
   * @param nodeIds 子树节点 id。软删在事务后调用（行仍在库）；硬删在事务前调用
   *   （事务会物理删行），调用方需自行带上根节点 id（getSubtreeIds 默认不含根）。
   */
  private async cancelInflightConversions(nodeIds: string[]): Promise<void> {
    if (nodeIds.length === 0) return;
    const executor = this.getFunctionExecutor();
    if (!executor?.cancelTask) return;

    const running = await this.prisma.fileSystemNode.findMany({
      where: {
        id: { in: nodeIds },
        taskId: { not: null },
        fileStatus: {
          in: [FileStatus.PROCESSING, FileStatus.UPLOADING],
        },
      },
      select: { id: true, taskId: true },
    });
    if (running.length === 0) return;

    // 先清 taskId 再杀任务：即使取消失败，节点也不再指向在途任务引用
    await this.prisma.fileSystemNode.updateMany({
      where: { id: { in: running.map((n) => n.id) } },
      data: { taskId: null },
    });
    for (const node of running) {
      if (!node.taskId) continue;
      try {
        const result = await executor.cancelTask(node.taskId);
        if (!result.ok) {
          this.logger.warn(
            `取消节点 ${node.id} 的在途转换 ${node.taskId} 未成功: ${
              result.reason ?? result.status
            }`
          );
        }
      } catch (err) {
        this.logger.warn(
          `取消节点 ${node.id} 的在途转换 ${node.taskId} 失败: ${
            (err as Error).message
          }`
        );
      }
    }
  }

  async deleteNode(
    nodeId: string,
    permanently: boolean = false,
    userId?: string
  ) {
    try {
      const node = await this.prisma.fileSystemNode.findUnique({
        where: { id: nodeId },
        select: {
          nodeType: true,
          path: true,
          fileHash: true,
          deletedAt: true,
          ownerId: true,
          projectId: true,
          size: true,
          fileStatus: true,
          name: true,
        },
      });

      if (!node) {
        throw new NotFoundException(
          I18nContext.current()?.t('error.node.not_found') ?? '节点不存在'
        );
      }

      if (userId) {
        await this.nodeMutationGuard.assertMutationAllowed(userId, 'delete', {
          node: { id: nodeId },
        });
      }

      const isRootType =
        node.nodeType !== NodeType.FILE && node.nodeType !== NodeType.FOLDER;
      const typeLabel = isRootType ? '项目' : '节点';
      this.logger.log(
        `开始删除${typeLabel}: ${nodeId}, permanently=${permanently}`
      );

      if (permanently) {
        const [subtreeIds, subtreeFiles] = await Promise.all([
          this.treeWalker.getSubtreeIds(nodeId),
          this.treeWalker.getSubtreeFiles(nodeId),
        ]);
        const filesToDelete = subtreeFiles
          .filter(
            (f): f is SubtreeFileInfo & { path: string } => f.path !== null
          )
          .map((f) => ({ path: f.path, fileHash: f.fileHash, nodeId: f.id }));
        const nodesToDelete = subtreeIds;

        // 事务会物理删行，取消在途转换必须排在事务前（getSubtreeIds 默认不含根，补上 nodeId）
        this.cancelInflightConversions([...nodesToDelete, nodeId]).catch(
          (err: unknown) =>
            this.logger.warn(
              `删除前取消在途转换失败（不影响删除结果）: ${(err as Error).message}`
            )
        );

        await this.prisma.$transaction(
          async (tx) => {
            const fileNodeIds = filesToDelete
              .filter((f) => f.path)
              .map((f) => f.nodeId);
            if (fileNodeIds.length > 0) {
              await tx.fileSystemNode.updateMany({
                where: { id: { in: fileNodeIds } },
                data: { deletedFromStorage: new Date() },
              });
            }
            if (nodesToDelete.length > 0) {
              await tx.fileSystemNode.deleteMany({
                where: { id: { in: nodesToDelete } },
              });
            }
            if (node.nodeType === NodeType.FILE && node.path) {
              await tx.fileSystemNode.updateMany({
                where: { id: nodeId },
                data: { deletedFromStorage: new Date() },
              });
            }
            await tx.fileSystemNode.delete({ where: { id: nodeId } });
          },
          { timeout: 30000 }
        );

        for (const file of filesToDelete) {
          if (file.path) {
            await this.deleteFileFromStorage(file.path, file.fileHash, true);
          }
        }
        if (node.nodeType === NodeType.FILE && node.path) {
          await this.deleteFileFromStorage(node.path, node.fileHash, true);
        }
        if (node.ownerId) {
          await this.nodeMutationGuard.invalidateQuotaAfterMutation(
            node.ownerId,
            node
          );
        }
        this.logger.log(`${typeLabel}彻底删除成功: ${nodeId}`);
        await this.auditFileDelete(node, nodeId, userId, true);
        return { message: `${typeLabel}已彻底删除` };
      }

      const nodesToUpdate = await this.treeWalker.getSubtreeIds(nodeId, {
        includeRoot: true,
      });

      await this.prisma.$transaction(async (tx) => {
        const updateData: Prisma.FileSystemNodeUpdateInput = {
          deletedAt: new Date(),
          deletedByCascade: false,
        };
        if (isRootType) {
          updateData.projectStatus = ProjectStatus.DELETED;
        } else {
          await this.nodeStatusTransitioner.transition(
            nodeId,
            (node.fileStatus as FileStatus | null) ?? null,
            FileStatus.DELETED,
            tx
          );
        }
        await tx.fileSystemNode.update({
          where: { id: nodeId },
          data: updateData,
        });
        if (nodesToUpdate.length > 1) {
          await tx.fileSystemNode.updateMany({
            where: { id: { in: nodesToUpdate.filter((id) => id !== nodeId) } },
            data: { deletedAt: new Date(), deletedByCascade: true },
          });
        }
      });

      // 取消在途转换（best-effort，不阻塞删除响应）：已删文件不再占转换并发槽
      this.cancelInflightConversions(nodesToUpdate).catch((err: unknown) =>
        this.logger.warn(
          `删除后取消在途转换失败（不影响删除结果）: ${(err as Error).message}`
        )
      );

      if (node.ownerId) {
        await this.nodeMutationGuard.invalidateQuotaAfterMutation(
          node.ownerId,
          node
        );
      }
      this.logger.log(`${typeLabel}已移至回收站: ${nodeId}`);
      await this.auditFileDelete(node, nodeId, userId, false);
      return { message: `${typeLabel}已移至回收站` };
    } catch (error) {
      this.logger.error(`节点删除失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  async deleteProject(
    projectId: string,
    permanently: boolean = false,
    userId: string
  ) {
    await this.nodeMutationGuard.assertMutationAllowed(userId, 'project-delete', {
      node: { id: projectId },
    });
    const project = await this.prisma.fileSystemNode.findFirst({
      where: { id: projectId, nodeType: NodeType.PROJECT, deletedAt: null },
      select: { id: true, nodeType: true, ownerId: true, name: true },
    });
    if (!project) {
      throw new NotFoundException(
        I18nContext.current()?.t('error.project.not_found') ?? '项目不存在'
      );
    }
    if (project.nodeType === NodeType.PERSONAL_SPACE) {
      throw new BadRequestException(
        I18nContext.current()?.t('error.file.private_space_no_delete') ??
          '私人空间不支持删除操作'
      );
    }
    if (project.ownerId !== userId) {
      throw new ForbiddenException(
        I18nContext.current()?.t(
          'error.project_member.only_owner_can_delete'
        ) ?? '只有项目所有者可以删除项目'
      );
    }
    const result = await this.deleteNode(projectId, permanently);

    // #207 阶段 2：项目删除埋点（PROJECT_DELETE，软删/硬删均记录，permanently 区分）
    await this.auditLogService.log(
      AuditAction.PROJECT_DELETE,
      ResourceType.PROJECT,
      projectId,
      userId,
      true,
      undefined,
      undefined,
      projectId,
      project.name,
      { projectName: project.name, permanently }
    );

    return result;
  }

  /**
   * 文件/文件夹删除审计埋点（#207 阶段 2 FILE_DELETE）
   * 项目根类型的删除由 deleteProject 单独记录 PROJECT_DELETE，此处不重复
   */
  private async auditFileDelete(
    node: {
      nodeType: string | null;
      projectId: string | null;
      name?: string | null;
    },
    nodeId: string,
    userId: string | undefined,
    permanently: boolean
  ): Promise<void> {
    if (!userId) {
      return;
    }
    if (
      node.nodeType !== NodeType.FILE &&
      node.nodeType !== NodeType.FOLDER
    ) {
      return;
    }
    await this.auditLogService.log(
      AuditAction.FILE_DELETE,
      node.nodeType === NodeType.FILE
        ? ResourceType.FILE
        : ResourceType.FOLDER,
      nodeId,
      userId,
      true,
      undefined,
      undefined,
      node.projectId ?? undefined,
      node.name ?? undefined,
      { fileName: node.name ?? undefined, permanently }
    );
  }

  async restoreNode(nodeId: string, userId: string) {
    try {
      const node = await this.prisma.fileSystemNode.findUnique({
        where: { id: nodeId },
        select: {
          nodeType: true,
          deletedAt: true,
          deletedByCascade: true,
          parentId: true,
          ownerId: true,
          projectId: true,
          name: true,
          fileStatus: true,
          size: true,
          path: true,
        },
      });

      if (!node) {
        throw new NotFoundException(
          I18nContext.current()?.t('error.node.not_found') ?? '节点不存在'
        );
      }
      if (!node.deletedAt) {
        throw new BadRequestException(
          I18nContext.current()?.t('error.file.node_not_deleted') ??
            '节点未被删除，无需恢复'
        );
      }

      const isRootType =
        node.nodeType !== NodeType.FILE && node.nodeType !== NodeType.FOLDER;
      const typeLabel = isRootType ? '项目' : '节点';

      // 权限 + 配额统一断言（替代装饰器 + skipProjectQuotaCheck 模式）
      await this.nodeMutationGuard.assertMutationAllowed(userId, 'restore', {
        node: { id: nodeId },
      });

      if (node.nodeType === NodeType.PROJECT) {
        await this.nodeMutationGuard.assertProjectQuota(userId);
      }

      // 文件/文件夹恢复会使项目空间占用回升，恢复前校验配额（文件夹按子树文件总大小计算）；
      // 仅当恢复的目标节点位于个人空间时才计入个人空间配额（项目间移动/恢复不改变个人空间用量）
      if (!isRootType && node.ownerId) {
        const restoreSize =
          node.nodeType === NodeType.FOLDER
            ? await this.getSubtreeRestoreSize(nodeId)
            : await this.nodeSizeResolver.resolveFileSize(node, nodeId);
        if (restoreSize > 0) {
          await this.nodeMutationGuard.assertByteQuota(
            { node: { id: nodeId }, incrementBytes: restoreSize },
            node.ownerId
          );
        }
      }

      if (!isRootType && node.parentId) {
        const parentNode = await this.prisma.fileSystemNode.findUnique({
          where: { id: node.parentId },
          select: { deletedAt: true, nodeType: true, projectId: true },
        });
        if (!parentNode) {
          throw new NotFoundException(
            I18nContext.current()?.t('error.file.parent_not_found') ??
              '父节点不存在'
          );
        }
        if (parentNode.deletedAt) {
          throw new BadRequestException(
            I18nContext.current()?.t('error.file.parent_deleted') ??
              '父节点已被删除，无法恢复'
          );
        }

        let libraryNodeType: NodeType | null = null;
        if (
          parentNode.nodeType === NodeType.LIBRARY_DRAWING ||
          parentNode.nodeType === NodeType.LIBRARY_BLOCK
        ) {
          libraryNodeType = parentNode.nodeType;
        } else if (
          parentNode.nodeType === NodeType.FOLDER &&
          parentNode.projectId
        ) {
          const rootNode = await this.prisma.fileSystemNode.findUnique({
            where: { id: parentNode.projectId },
            select: { nodeType: true },
          });
          if (
            rootNode &&
            (rootNode.nodeType === NodeType.LIBRARY_DRAWING ||
              rootNode.nodeType === NodeType.LIBRARY_BLOCK)
          ) {
            libraryNodeType = rootNode.nodeType;
          }
        }

        if (libraryNodeType) {
          const requiredPermission =
            libraryNodeType === NodeType.LIBRARY_DRAWING
              ? 'LIBRARY_DRAWING_MANAGE'
              : 'LIBRARY_BLOCK_MANAGE';
          const hasPermission =
            await this.permissionService.checkSystemPermission(
              userId,
              requiredPermission
            );
          if (!hasPermission) {
            throw new ForbiddenException(
              I18nContext.current()?.t('error.file.no_repo_access') ??
                '没有访问该资源库的权限'
            );
          }
        } else {
          const parentProjectId = await this.treeWalker.resolveProjectId(
            node.parentId
          );
          if (parentProjectId) {
            const hasPermission =
              await this.projectPermissionService.checkPermission(
                userId,
                parentProjectId,
                ProjectPermission.FILE_OPEN
              );
            if (!hasPermission) {
              throw new ForbiddenException(
                I18nContext.current()?.t(
                  'error.file.no_target_parent_access'
                ) ?? '没有访问目标父节点的权限'
              );
            }
          }
        }
      }

      if (
        node.nodeType === NodeType.PROJECT ||
        node.nodeType === NodeType.PERSONAL_SPACE ||
        node.nodeType === NodeType.FOLDER
      ) {
        const childNodeIds =
          await this.treeWalker.getSubtreeIds(nodeId);

        if (childNodeIds.length > 0) {
          await this.prisma.fileSystemNode.updateMany({
            where: { id: { in: childNodeIds } },
            data: { deletedAt: null, deletedByCascade: false },
          });
          const deletedChildren = await this.prisma.fileSystemNode.findMany({
            where: {
              id: { in: childNodeIds },
              fileStatus: PrismaFileStatus.DELETED,
            },
            select: { id: true },
          });
          await Promise.all(
            deletedChildren.map((c) =>
              this.nodeStatusTransitioner.transition(
                c.id,
                FileStatus.DELETED,
                FileStatus.COMPLETED
              )
            )
          );
          this.logger.log(
            `${typeLabel}恢复: 级联恢复了 ${childNodeIds.length} 个子节点`
          );
        }
      }

      const updateData: Prisma.FileSystemNodeUpdateInput = {
        deletedAt: null,
        deletedByCascade: false,
      };

      if (isRootType) {
        updateData.projectStatus = ProjectStatus.ACTIVE;
      } else {
        await this.nodeStatusTransitioner.transition(
          nodeId,
          (node.fileStatus as FileStatus | null) ?? null,
          FileStatus.COMPLETED
        );

        if (node.parentId && node.name) {
          const uniqueName = await this.nodeNameService.generateUniqueName(
            node.parentId,
            node.name,
            node.nodeType === NodeType.FOLDER
          );
          if (uniqueName !== node.name) {
            updateData.name = uniqueName;
          }
        }
      }

      const restoredNode = await this.prisma.fileSystemNode.update({
        where: { id: nodeId },
        data: updateData,
        include: {
          owner: { select: { id: true, username: true, nickname: true } },
        },
      });

      if (node.ownerId) {
        await this.nodeMutationGuard.invalidateQuotaAfterMutation(
          node.ownerId,
          node
        );
      }
      this.logger.log(`${typeLabel}恢复成功: ${nodeId}`);
      // 恢复审计（NODE_RESTORE）：仅文件/文件夹（项目恢复属 PROJECT 生命周期语义，不记）
      if (!isRootType) {
        await this.auditLogService.logProjectNodeAction(
          AuditAction.NODE_RESTORE,
          nodeId,
          userId,
          { restoredName: restoredNode?.name ?? node.name },
          node.nodeType === NodeType.FOLDER
            ? ResourceType.FOLDER
            : ResourceType.FILE
        );
      }
      return restoredNode;
    } catch (error) {
      this.logger.error(`节点恢复失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  async restoreProject(projectId: string, operatorId?: string) {
    const project = await this.prisma.fileSystemNode.findFirst({
      where: {
        id: projectId,
        nodeType: NodeType.PROJECT,
        deletedAt: { not: null },
      },
      select: { id: true, name: true, ownerId: true },
    });

    if (!project) {
      throw new NotFoundException(
        I18nContext.current()?.t('error.file.recycle_bin_not_found') ??
          '回收站中不存在该项目'
      );
    }

    const existingProject = await this.prisma.fileSystemNode.findFirst({
      where: {
        name: { equals: project.name, mode: 'insensitive' },
        ownerId: project.ownerId,
        nodeType: NodeType.PROJECT,
        deletedAt: null,
        id: { not: project.id },
      },
      select: { id: true },
    });

    if (existingProject) {
      const existingProjects = await this.prisma.fileSystemNode.findMany({
        where: {
          ownerId: project.ownerId,
          nodeType: NodeType.PROJECT,
          deletedAt: null,
        },
        select: { name: true },
      });
      const existingNames = new Set(existingProjects.map((p) => p.name));
      let counter = 1;
      let newName: string;
      do {
        newName = `${project.name} (${counter})`;
        counter++;
      } while (existingNames.has(newName));
      await this.prisma.fileSystemNode.update({
        where: { id: project.id },
        data: { name: newName },
      });
    }

    await this.restoreNode(projectId, project.ownerId);
    // 项目恢复审计（NODE_RESTORE + PROJECT）：项目根节点 projectId 为空（logProjectNodeAction
    // 会跳过），直接 log 并以项目自身 id 作 projectId，项目成员在操作历史中可见
    if (operatorId) {
      await this.auditLogService.log(
        AuditAction.NODE_RESTORE,
        ResourceType.PROJECT,
        project.id,
        operatorId,
        true,
        undefined,
        undefined,
        project.id,
        project.name,
        { restoredName: project.name }
      );
    }
    return {
      message:
        I18nContext.current()?.t('success.project_restored') ??
        '项目已从回收站恢复',
    };
  }

  async clearProjectTrash(projectId: string, userId: string) {
    try {
      const allProjectNodeIds = await this.treeWalker.getSubtreeIds(
        projectId,
        { includeRoot: true }
      );
      const trashItems = await this.prisma.fileSystemNode.findMany({
        where: {
          id: { in: allProjectNodeIds },
          deletedAt: { not: null },
          deletedByCascade: false,
        },
        select: { id: true },
      });
      const ids = trashItems.map((item) => item.id);
      this.logger.log(`清空项目回收站: 找到 ${ids.length} 个项目待删除`);
      if (ids.length === 0) {
        return {
          message:
            I18nContext.current()?.t('success.recycle_bin_empty') ??
            '项目回收站中没有任何项目',
        };
      }
      return this.permanentlyDeleteTrashItems(ids, userId);
    } catch (error) {
      this.logger.error(`清空项目回收站失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  async softDeleteDescendants(
    tx: Prisma.TransactionClient,
    nodeId: string
  ): Promise<void> {
    const children = await tx.fileSystemNode.findMany({
      where: { parentId: nodeId },
      select: { id: true, nodeType: true, fileStatus: true },
    });
    for (const child of children) {
      await this.softDeleteDescendants(tx, child.id);
    }
    if (children.length > 0) {
      for (const child of children) {
        const current = (child.fileStatus ??
          FileStatus.COMPLETED) as FileStatus;
        if (current === FileStatus.DELETED) {
          await tx.fileSystemNode.update({
            where: { id: child.id },
            data: { deletedAt: new Date(), deletedByCascade: true },
          });
          continue;
        }
        // 转换中（PROCESSING）无法直达 DELETED：先 FAILED 再 DELETED，保证删除流程不中断
        if (
          !FileStatusStateMachine.canTransition(current, FileStatus.DELETED)
        ) {
          await this.nodeStatusTransitioner.transition(
            child.id,
            current,
            FileStatus.FAILED,
            tx
          );
          await this.nodeStatusTransitioner.transition(
            child.id,
            FileStatus.FAILED,
            FileStatus.DELETED,
            tx
          );
        } else {
          await this.nodeStatusTransitioner.transition(
            child.id,
            current,
            FileStatus.DELETED,
            tx
          );
        }
        await tx.fileSystemNode.update({
          where: { id: child.id },
          data: { deletedAt: new Date(), deletedByCascade: true },
        });
      }
    }
  }

  async deleteDescendantsWithFiles(
    tx: Prisma.TransactionClient,
    nodeId: string
  ): Promise<void> {
    const children = await tx.fileSystemNode.findMany({
      where: { parentId: nodeId },
      select: { id: true, nodeType: true, path: true, fileHash: true },
    });
    for (const child of children) {
      await this.deleteDescendantsWithFiles(tx, child.id);
    }
    if (children.length > 0) {
      for (const child of children) {
        if (child.nodeType === NodeType.FILE && child.path) {
          await this.deleteFileIfNotReferenced(
            tx,
            child.id,
            child.path,
            child.fileHash
          );
          await tx.fileSystemNode.update({
            where: { id: child.id },
            data: { deletedFromStorage: new Date() },
          });
        }
      }
      const childIds = children.map((c: { id: string }) => c.id);
      await tx.fileSystemNode.deleteMany({ where: { id: { in: childIds } } });
    }
  }

  async deleteFileIfNotReferenced(
    tx: Prisma.TransactionClient,
    nodeId: string,
    nodePath: string,
    fileHash: string | null
  ): Promise<void> {
    if (!nodePath) return;
    const pathParts = nodePath.split('/');
    if (pathParts.length < 3) {
      this.logger.warn(`nodePath 格式不正确，跳过删除: ${nodePath}`);
      return;
    }
    if (fileHash) {
      const otherRefCount = await tx.fileSystemNode.count({
        where: { fileHash, deletedAt: null, id: { not: nodeId } },
      });
      if (otherRefCount > 0) {
        this.logger.warn(
          `跳过物理文件删除: fileHash ${fileHash} 仍被 ${otherRefCount} 个其他节点引用`
        );
        return;
      }
    }
    this.logger.log(`准备删除节点物理目录: ${nodePath}`);
    try {
      const filesDataPath = this.configService.get('filesDataPath', {
        infer: true,
      });
      const nodeDirectory = path.join(filesDataPath, path.dirname(nodePath));
      if (this.versionControlService.isReady()) {
        try {
          const deleteResult =
            await this.versionControlService.deleteNodeDirectory(nodeDirectory);
          if (deleteResult.success) {
            this.logger.log(`节点目录已从 MX 标记删除: ${nodeDirectory}`);
          }
        } catch (mxError) {
          this.logger.error(
            `节点目录从 MX 标记删除失败: ${nodeDirectory}, 错误: ${mxError.message}`
          );
        }
      }
      const fullPath = this.storageManager.getFullPath(nodePath);
      const nodeDirectoryPath = path.dirname(fullPath);
      if (!nodeDirectoryPath.endsWith(nodeId)) {
        this.logger.error(
          `路径验证失败，拒绝删除: ${nodeDirectoryPath} (期望以 ${nodeId} 结尾)`
        );
        throw new BadRequestException(
          I18nContext.current()?.t(
            'error.file_extra.path_validation_failed_delete'
          ) ?? '路径验证失败，无法安全删除'
        );
      }
      const cleanPath = nodePath.replace(/^\/mxcad\/file\//, '');
      const nodeDirRelativeKey = cleanPath.substring(
        0,
        cleanPath.lastIndexOf('/')
      );
      await this.storageProvider.deleteAll(nodeDirRelativeKey);
      this.logger.log(`节点目录已删除: ${nodeDirectoryPath}`);
    } catch (error) {
      this.logger.error(
        `删除物理文件失败: ${nodePath} - ${error.message}`,
        error.stack
      );
    }
  }

  async deleteFileFromStorage(
    nodePath: string,
    fileHash: string | null,
    commitMx: boolean
  ): Promise<void> {
    if (!nodePath) return;
    if (fileHash) {
      const pathParts = nodePath.split('/');
      const nodeId = pathParts[pathParts.length - 2];
      const otherRefCount = await this.prisma.fileSystemNode.count({
        where: { fileHash, deletedAt: null, id: { not: nodeId } },
      });
      if (otherRefCount > 0) {
        this.logger.warn(
          `跳过物理文件删除: fileHash ${fileHash} 仍被 ${otherRefCount} 个其他节点引用`
        );
        return;
      }
    }
    try {
      const filesDataPath = this.configService.get('filesDataPath', {
        infer: true,
      });
      const nodeDirectory = path.join(filesDataPath, path.dirname(nodePath));
      if (commitMx && this.versionControlService.isReady()) {
        try {
          const deleteResult =
            await this.versionControlService.deleteNodeDirectory(nodeDirectory);
          if (deleteResult.success) {
            this.logger.log(`节点目录已从 MX 标记删除: ${nodeDirectory}`);
          }
        } catch (mxError) {
          this.logger.error(
            `节点目录从 MX 标记删除失败: ${nodeDirectory}`,
            mxError
          );
        }
      }
      const fullPath = this.storageManager.getFullPath(nodePath);
      const nodeDirectoryPath = path.dirname(fullPath);
      const pathParts = nodePath.split('/');
      const nodeId = pathParts[pathParts.length - 2];
      if (!nodeDirectoryPath.endsWith(nodeId)) {
        this.logger.error(`路径验证失败，拒绝删除: ${nodeDirectoryPath}`);
        return;
      }
      const cleanPath = nodePath.replace(/^\/mxcad\/file\//, '');
      const nodeDirRelativeKey = cleanPath.substring(
        0,
        cleanPath.lastIndexOf('/')
      );
      await this.storageProvider.deleteAll(nodeDirRelativeKey);
      this.logger.log(`节点目录已删除: ${nodeDirectoryPath}`);
    } catch (error) {
      this.logger.error(`删除物理文件失败: ${nodePath}`, error);
    }
  }

  async permanentlyDeleteProject(projectId: string, commitMx: boolean = true) {
    try {
      const project = await this.prisma.fileSystemNode.findUnique({
        where: { id: projectId },
        select: {
          id: true,
          nodeType: true,
          path: true,
          fileHash: true,
          name: true,
          ownerId: true,
        },
      });
      if (!project) {
        throw new NotFoundException(
          I18nContext.current()?.t('error.project.not_found') ?? '项目不存在'
        );
      }

      const [subtreeIds, subtreeFiles] = await Promise.all([
        this.treeWalker.getSubtreeIds(projectId),
        this.treeWalker.getSubtreeFiles(projectId),
      ]);
      const filesToDelete = subtreeFiles
        .filter((f): f is SubtreeFileInfo & { path: string } => f.path !== null)
        .map((f) => ({ path: f.path, fileHash: f.fileHash, nodeId: f.id }));
      const nodesToDelete = subtreeIds;

      await this.prisma.$transaction(
        async (tx) => {
          const fileNodeIds = filesToDelete
            .filter((f) => f.path)
            .map((f) => f.nodeId);
          if (fileNodeIds.length > 0) {
            await tx.fileSystemNode.updateMany({
              where: { id: { in: fileNodeIds } },
              data: { deletedFromStorage: new Date() },
            });
          }
          if (nodesToDelete.length > 0) {
            await tx.fileSystemNode.deleteMany({
              where: { id: { in: nodesToDelete } },
            });
          }
          if (project.nodeType === NodeType.FILE && project.path) {
            await tx.fileSystemNode.updateMany({
              where: { id: projectId },
              data: { deletedFromStorage: new Date() },
            });
          }
          await tx.fileSystemNode.delete({
            where: {
              id: projectId,
              nodeType: NodeType.PROJECT,
              deletedAt: { not: null },
            },
          });
        },
        { timeout: 30000 }
      );

      for (const file of filesToDelete) {
        if (file.path) {
          await this.deleteFileFromStorage(file.path, file.fileHash, commitMx);
        }
      }
      if (project.nodeType === NodeType.FILE && project.path) {
        await this.deleteFileFromStorage(
          project.path,
          project.fileHash,
          commitMx
        );
      }
      if (project.ownerId) {
        await this.nodeMutationGuard.invalidateQuotaAfterMutation(
          project.ownerId,
          { projectId: project.id }
        );
      }

      if (commitMx && this.versionControlService.isReady()) {
        try {
          const commitResult =
            await this.versionControlService.commitWorkingCopy(
              `删除项目: ${project.name} (${projectId})`
            );
          if (commitResult.success) {
            this.logger.log(`删除项目的 MX 更改已提交: ${project.name}`);
          }
        } catch (mxError) {
          this.logger.error(
            `删除项目的 MX 更改提交失败: ${project.name}, 错误: ${mxError.message}`
          );
        }
      }

      this.logger.log(`项目已从回收站彻底删除: ${projectId}`);
      return {
        message:
          I18nContext.current()?.t('success.project_permanently_deleted') ??
          '项目已彻底删除',
      };
    } catch (error) {
      this.logger.error(`项目彻底删除失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  async permanentlyDeleteNode(nodeId: string, commitMx: boolean = true) {
    try {
      const node = await this.prisma.fileSystemNode.findUnique({
        where: { id: nodeId },
        select: {
          nodeType: true,
          path: true,
          fileHash: true,
          name: true,
          ownerId: true,
          projectId: true,
        },
      });
      if (!node) {
        throw new NotFoundException(
          I18nContext.current()?.t('error.node.not_found') ?? '节点不存在'
        );
      }

      const [subtreeIds, subtreeFiles] = await Promise.all([
        this.treeWalker.getSubtreeIds(nodeId),
        this.treeWalker.getSubtreeFiles(nodeId),
      ]);
      const filesToDelete = subtreeFiles
        .filter((f): f is SubtreeFileInfo & { path: string } => f.path !== null)
        .map((f) => ({ path: f.path, fileHash: f.fileHash, nodeId: f.id }));
      const nodesToDelete = subtreeIds;

      await this.prisma.$transaction(
        async (tx) => {
          const fileNodeIds = filesToDelete
            .filter((f) => f.path)
            .map((f) => f.nodeId);
          if (fileNodeIds.length > 0) {
            await tx.fileSystemNode.updateMany({
              where: { id: { in: fileNodeIds } },
              data: { deletedFromStorage: new Date() },
            });
          }
          if (nodesToDelete.length > 0) {
            await tx.fileSystemNode.deleteMany({
              where: { id: { in: nodesToDelete } },
            });
          }
          if (node.nodeType === NodeType.FILE && node.path) {
            await tx.fileSystemNode.updateMany({
              where: { id: nodeId },
              data: { deletedFromStorage: new Date() },
            });
          }
          await tx.fileSystemNode.delete({ where: { id: nodeId } });
        },
        { timeout: 30000 }
      );

      for (const file of filesToDelete) {
        if (file.path) {
          await this.deleteFileFromStorage(file.path, file.fileHash, commitMx);
        }
      }
      if (node.nodeType === NodeType.FILE && node.path) {
        await this.deleteFileFromStorage(node.path, node.fileHash, commitMx);
      }
      if (node.ownerId) {
        await this.nodeMutationGuard.invalidateQuotaAfterMutation(
          node.ownerId,
          node
        );
      }

      if (commitMx && this.versionControlService.isReady()) {
        try {
          const commitResult =
            await this.versionControlService.commitWorkingCopy(
              `删除节点: ${node.name} (${nodeId})`
            );
          if (commitResult.success) {
            this.logger.log(`删除节点的 MX 更改已提交: ${node.name}`);
          }
        } catch (mxError) {
          this.logger.error(
            `删除节点的 MX 更改提交失败: ${node.name}, 错误: ${mxError.message}`
          );
        }
      }

      this.logger.log(`节点已从回收站彻底删除: ${nodeId}`);
      return {
        message:
          I18nContext.current()?.t('success.permanently_deleted') ??
          '已彻底删除',
      };
    } catch (error) {
      this.logger.error(`节点彻底删除失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  async restoreTrashItems(itemIds: string[], userId: string) {
    try {
      if (!itemIds || itemIds.length === 0) {
        return {
          message:
            I18nContext.current()?.t('success.select_restore_item') ??
            '请选择要恢复的项目',
        };
      }
      const items = await this.prisma.fileSystemNode.findMany({
        where: { id: { in: itemIds }, deletedAt: { not: null } },
        select: { id: true, nodeType: true, parentId: true, ownerId: true },
      });
      if (items.length === 0) {
        throw new NotFoundException(
          I18nContext.current()?.t('error.file.project_not_found_in_recycle') ??
            '未找到要恢复的项目'
        );
      }
      // 配额预检（先于权限断言，保持原语义：未授权用户不得探测配额信息）
      const projectItems = items.filter(
        (item) => item.nodeType === NodeType.PROJECT
      );
      if (projectItems.length > 0) {
        const quotaByOwner = new Map<string, number>();
        for (const item of projectItems) {
          const ownerId = item.ownerId ?? userId;
          quotaByOwner.set(ownerId, (quotaByOwner.get(ownerId) ?? 0) + 1);
        }
        await Promise.all(
          Array.from(quotaByOwner, ([ownerId, predictedAdditional]) =>
            this.nodeMutationGuard.assertProjectQuota(
              ownerId,
              predictedAdditional
            )
          )
        );
      }
      // 权限断言（替代 validateTrashPermission：项目→FILE_TRASH_MANAGE、owner 放行、私人空间/资源库→归属分派）
      for (const item of items) {
        await this.nodeMutationGuard.assertMutationAllowed(userId, 'restore', {
          node: { id: item.id },
        });
      }
      for (const item of items) {
        if (
          item.nodeType !== NodeType.FILE &&
          item.nodeType !== NodeType.FOLDER
        ) {
          await this.restoreProject(item.id, userId);
        } else {
          await this.restoreNode(item.id, userId);
        }
      }
      this.logger.log(`批量恢复成功: ${items.length} 个项目`);
      return {
        message:
          I18nContext.current()?.t('success.batch_restore_complete', {
            args: { count: items.length },
          }) ?? `已恢复 ${items.length} 个项目`,
      };
    } catch (error) {
      this.logger.error(`批量恢复失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  async permanentlyDeleteTrashItems(itemIds: string[], userId: string) {
    try {
      if (!itemIds || itemIds.length === 0) {
        return {
          message:
            I18nContext.current()?.t('success.select_delete_item') ??
            '请选择要删除的项目',
        };
      }
      const items = await this.prisma.fileSystemNode.findMany({
        where: { id: { in: itemIds }, deletedAt: { not: null } },
        select: { id: true, nodeType: true },
      });
      if (items.length === 0) {
        throw new NotFoundException(
          I18nContext.current()?.t('error.file.delete_item_not_found') ??
            '未找到要删除的项目'
        );
      }
      // 权限断言（替代 validateTrashPermission：回收站操作语义 FILE_TRASH_MANAGE）
      for (const item of items) {
        await this.nodeMutationGuard.assertMutationAllowed(userId, 'trash', {
          node: { id: item.id },
        });
      }
      for (const item of items) {
        if (
          item.nodeType !== NodeType.FILE &&
          item.nodeType !== NodeType.FOLDER
        ) {
          await this.permanentlyDeleteProject(item.id, false);
        } else {
          await this.permanentlyDeleteNode(item.id, false);
        }
      }

      if (this.versionControlService.isReady()) {
        try {
          const commitResult =
            await this.versionControlService.commitWorkingCopy(
              `批量删除 ${items.length} 个项目/节点`
            );
          if (commitResult.success) {
            this.logger.log(
              `批量删除的 MX 更改已提交: ${items.length} 个项目/节点`
            );
          }
        } catch (mxError) {
          this.logger.error(
            `批量删除的 MX 更改提交失败: ${items.length} 个项目/节点, 错误: ${mxError.message}`
          );
        }
      }

      this.logger.log(`批量彻底删除成功: ${items.length} 个项目`);
      return {
        message:
          I18nContext.current()?.t(
            'success.batch_permanently_delete_complete',
            { args: { count: items.length } }
          ) ?? `已彻底删除 ${items.length} 个项目`,
      };
    } catch (error) {
      this.logger.error(`批量彻底删除失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  async clearTrash(userId: string) {
    try {
      const accessibleProjectFilter: Prisma.FileSystemNodeWhereInput = {
        nodeType: NodeType.PROJECT,
        OR: [{ ownerId: userId }, { projectMembers: { some: { userId } } }],
      };
      const userAccessFilter = [
        { ownerId: userId },
        { projectMembers: { some: { userId } } },
      ];

      const trashItems = await this.prisma.fileSystemNode.findMany({
        where: {
          deletedAt: { not: null },
          deletedByCascade: false,
          OR: [
            { project: accessibleProjectFilter },
            { nodeType: NodeType.PROJECT, ...accessibleProjectFilter },
            { nodeType: NodeType.PERSONAL_SPACE, OR: userAccessFilter },
          ],
        },
        select: { id: true },
      });

      const ids = trashItems.map((item) => item.id);
      this.logger.log(`清空回收站: 找到 ${ids.length} 个项目待删除`);
      if (ids.length === 0) {
        return {
          message:
            I18nContext.current()?.t('success.recycle_bin_no_items') ??
            '回收站中没有任何项目',
        };
      }
      return this.permanentlyDeleteTrashItems(ids, userId);
    } catch (error) {
      this.logger.error(`清空回收站失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  async batchDeleteNodes(
    nodeIds: string[],
    permanently: boolean = false,
    userId?: string
  ) {
    const successIds: string[] = [];
    const failedIds: string[] = [];
    const errors: string[] = [];
    for (const nodeId of nodeIds) {
      try {
        await this.deleteNode(nodeId, permanently, userId);
        successIds.push(nodeId);
      } catch (error) {
        failedIds.push(nodeId);
        errors.push(`节点 ${nodeId}: ${error.message}`);
        this.logger.error(`批量删除节点失败: ${nodeId}`, error.message);
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

  /**
   * 聚合子树中所有 FILE 节点的总大小（恢复场景：被删除子树文件均会恢复，不过滤状态）；
   * size 为 null 的节点按物理文件大小兜底（防配额增量被算成 0，#215）
   */
  private async getSubtreeRestoreSize(nodeId: string): Promise<number> {
    const files = await this.storageUsageService.getSubtreeFileNodes({
      kind: 'subtree',
      nodeId,
      status: 'all',
    });
    return this.nodeSizeResolver.resolveFileSizes(files);
  }
}
