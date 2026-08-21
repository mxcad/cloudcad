import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { CrossProjectTransferMode, NodeType } from '@cloudcad/db';
import { I18nContext } from 'nestjs-i18n';
import { DatabaseService } from '../database/database.service';
import { StorageInfoService } from '../file-system/storage-quota/storage-info.service';
import { FileTreeService } from '../file-system/file-tree/file-tree.service';
import { TreeWalker } from '../file-system/file-tree/tree-walker.service';
import { RestrictionEngine } from '../vip/restriction-engine.service';
import { QUOTA_KEYS } from '../vip/quota-keys';
import { OwnershipPermissionFactory } from '../ownership/factories/ownership-permission.factory';
import { isOwnershipRootType } from '../ownership/interfaces';
import type { MutationAction, OwnershipNode } from '../ownership/interfaces/ownership-permission-strategy.interface';

/** 跨项目转移 6 域矩阵字段名（TRANSFER_OUT_FIELD / TRANSFER_IN_FIELD 的取值域） */
type TransferModeField =
  | 'transferOutToProject'
  | 'transferOutToPersonalSpace'
  | 'transferOutToLibrary'
  | 'transferInFromProject'
  | 'transferInFromPersonalSpace'
  | 'transferInFromLibrary';

/**
 * 变更不变量输入：node 为被操作（或源）节点，target 为 move/copy 目标父节点
 */
export interface MutationContext {
  node: { id: string };
  target?: { id: string } | null;
  incrementBytes?: number;
}

/**
 * 节点变更校验 Guard（ADR-0037）
 *
 * 「修改 FileSystemNode」的不变量序列统一入口：
 * 权限（按归属分派）→ 配额（策略 key 正确语义）→ 缓存失效。
 * 所有 file-operations 写操作必须先经 assertMutationAllowed，
 * 变更后经 invalidateQuotaAfterMutation 失效配额缓存。
 *
 * 归属分派：由 OwnershipPermissionFactory 按 node.nodeType 分派至
 * 项目 / 个人空间 / 资源库三策略（动作粒度断言，见 ownership 模块）。
 *
 * 配额语义：PROJECT_SIZE 为基，仅个人空间目标追加 PERSONAL_STORAGE；
 * 公共资源库（图纸库/图块库，含库内子节点）为系统维护的内部库，跳过字节配额。
 */
@Injectable()
export class NodeMutationGuard {
  private readonly logger = new Logger(NodeMutationGuard.name);

  constructor(
    private readonly prisma: DatabaseService,
    private readonly fileTreeService: FileTreeService,
    private readonly treeWalker: TreeWalker,
    private readonly storageInfoService: StorageInfoService,
    private readonly restrictionEngine: RestrictionEngine,
    private readonly ownershipFactory: OwnershipPermissionFactory
  ) {}

  /**
   * 解析节点归属上下文：projectId 沿祖先链解析（TreeWalker 纯 CTE），
   * 不依赖 projectId 字段短路；个人空间根等根节点解析为自身 id。
   * rootNodeType 为归属根节点类型：根类型节点用自身 nodeType，
   * FILE/FOLDER 按解析出的 projectId 查根类型（供 factory 按归属分派）。
   */
  async resolveProjectContext(node: { id: string }): Promise<OwnershipNode> {
    const row = await this.prisma.fileSystemNode.findUnique({
      where: { id: node.id },
      select: {
        id: true,
        nodeType: true,
        projectId: true,
        ownerId: true,
        parentId: true,
      },
    });
    if (!row) {
      throw new BadRequestException(
        I18nContext.current()?.t('error.node.not_found') ?? '节点不存在'
      );
    }
    const projectId = await this.treeWalker.resolveProjectId(row.id);
    const rootNodeType = isOwnershipRootType(row.nodeType)
      ? row.nodeType
      : projectId
        ? await this.fileTreeService.getNodeType(projectId).catch(() => null)
        : null;
    return { ...row, projectId, rootNodeType };
  }

  /**
   * 变更前置断言：权限 + 跨项目转移策略 + 配额一步完成。
   *
   * 跨根（源/目标归属根不同）时对 move/copy 追加：
   * 1. 目标归属校验（目标项目 FILE_CREATE / 目标个人空间本人 / 目标库 LIBRARY_*_MANAGE）；
   * 2. 6 域模式矩阵（源项目 transferOut* 出向 × 目标项目 transferIn* 入向）；
   * 3. 系统规则：库源 move 恒拒绝、库源 copy 豁免源权限（公开复制）。
   * 同根内操作零额外查询、行为不变。
   */
  async assertMutationAllowed(
    userId: string,
    action: MutationAction,
    ctx: MutationContext
  ): Promise<void> {
    const nodeCtx = await this.resolveProjectContext(ctx.node);
    const targetCtx = ctx.target
      ? await this.resolveProjectContext(ctx.target)
      : null;
    const crossRoot = targetCtx
      ? targetCtx.projectId !== nodeCtx.projectId
      : false;

    // 系统规则：公共资源库内容公开可复制——跨根复制出库时豁免源权限断言；
    // 库内操作（同根）仍按归属断言（管理员在库内创建/复制仍需库管理权限）
    const copyOutOfLibrary =
      action === 'copy' &&
      crossRoot &&
      this.isLibraryRootType(nodeCtx.rootNodeType) &&
      !this.isLibraryRootType(targetCtx?.rootNodeType);
    if (!copyOutOfLibrary) {
      await this.assertOwnershipPermission(userId, action, nodeCtx);
    }

    if (crossRoot && (action === 'move' || action === 'copy')) {
      await this.assertOwnershipPermission(userId, 'create', targetCtx!);
      await this.assertCrossProjectTransferPolicy(action, nodeCtx, targetCtx!);
    }

    if (ctx.incrementBytes && ctx.incrementBytes > 0) {
      await this.assertQuota(
        nodeCtx.ownerId ?? userId,
        nodeCtx,
        ctx,
        targetCtx
      );
    }
  }

  /**
   * 项目数量配额断言（MAX_PROJECTS）：建项目 / 恢复项目。
   */
  async assertProjectQuota(
    userId: string,
    predictedAdditional = 1
  ): Promise<void> {
    await this.restrictionEngine.checkQuota(userId, {
      strategyKeys: [QUOTA_KEYS.MAX_PROJECTS],
      metadata: { predictedAdditional },
    });
  }

  /**
   * 字节配额断言（PROJECT_SIZE 为基，个人空间目标追加 PERSONAL_STORAGE）。
   * 供 restoreNode 等在权限断言之后单独执行配额检查的场景使用。
   */
  async assertByteQuota(ctx: MutationContext, ownerId: string): Promise<void> {
    const nodeCtx = await this.resolveProjectContext(ctx.node);
    if (ctx.incrementBytes && ctx.incrementBytes > 0) {
      await this.assertQuota(ownerId, nodeCtx, ctx);
    }
  }

  private async assertOwnershipPermission(
    userId: string,
    action: MutationAction,
    node: OwnershipNode
  ): Promise<void> {
    await this.ownershipFactory.assertCan(userId, action, node);
  }

  private async assertQuota(
    userId: string,
    node: OwnershipNode,
    ctx: MutationContext,
    targetCtx?: OwnershipNode | null
  ): Promise<void> {
    const incrementBytes = ctx.incrementBytes;
    if (!incrementBytes || incrementBytes <= 0) return;

    const projectId = ctx.target
      ? await this.treeWalker.resolveProjectId(ctx.target.id)
      : node.projectId;

    // 公共资源库（图纸库/图块库，含库内文件/文件夹）是系统管理员维护的内部资源库，
    // 不参与个人空间/项目字节配额限制：库内操作（无 target）按源节点上溯判定；
    // 跨根操作按目标归属判定——仅目标属库才跳过（源库复制进项目须按目标项目配额校验，
    // 修复"从库复制大文件进项目不限额"）
    if (ctx.target) {
      if (await this.isLibraryTarget(projectId)) return;
    } else if (await this.fileTreeService.isLibraryNode(node.id)) {
      return;
    }

    // 跨根操作配额归属目标根 owner（文件移入他人项目扣目标项目 owner 额度，
    // 而非源文件 owner）；同根/无 target 保持源 owner
    let quotaOwnerId = node.ownerId ?? userId;
    if (ctx.target && targetCtx && projectId !== node.projectId) {
      const targetRoot = await this.prisma.fileSystemNode.findUnique({
        where: { id: projectId },
        select: { ownerId: true },
      });
      quotaOwnerId = targetRoot?.ownerId ?? userId;
    }

    const strategyKeys = await this.buildQuotaStrategyKeys(
      quotaOwnerId,
      projectId
    );
    await this.restrictionEngine.checkQuota(quotaOwnerId, {
      projectId: projectId ?? undefined,
      incrementBytes,
      strategyKeys,
    });
  }

  /**
   * 判断目标是否属于公共资源库（图纸库/图块库）：
   * 按其解析出的 projectId（库内节点上溯为库根 id）根类型判定。
   */
  private async isLibraryTarget(
    projectId: string | null
  ): Promise<boolean> {
    if (!projectId) return false;
    const rootType = await this.fileTreeService
      .getNodeType(projectId)
      .catch(() => null);
    return (
      rootType === NodeType.LIBRARY_DRAWING ||
      rootType === NodeType.LIBRARY_BLOCK
    );
  }

  private isLibraryRootType(rootType?: string | null): boolean {
    return (
      rootType === NodeType.LIBRARY_DRAWING ||
      rootType === NodeType.LIBRARY_BLOCK
    );
  }

  /** 跨项目转移 6 域矩阵——出向字段（源项目 × 目标归属根类型） */
  private static readonly TRANSFER_OUT_FIELD: Record<string, TransferModeField> =
    {
      [NodeType.PROJECT]: 'transferOutToProject',
      [NodeType.PERSONAL_SPACE]: 'transferOutToPersonalSpace',
      [NodeType.LIBRARY_DRAWING]: 'transferOutToLibrary',
      [NodeType.LIBRARY_BLOCK]: 'transferOutToLibrary',
    };

  /** 跨项目转移 6 域矩阵——入向字段（目标项目 × 来源归属根类型） */
  private static readonly TRANSFER_IN_FIELD: Record<string, TransferModeField> =
    {
      [NodeType.PROJECT]: 'transferInFromProject',
      [NodeType.PERSONAL_SPACE]: 'transferInFromPersonalSpace',
      [NodeType.LIBRARY_DRAWING]: 'transferInFromLibrary',
      [NodeType.LIBRARY_BLOCK]: 'transferInFromLibrary',
    };

  /**
   * 跨项目转移策略断言（6 域模式矩阵，仅跨归属根时调用）：
   * - 出向：源为项目时，按目标域查 transferOut* 字段；
   * - 入向：目标为项目时，按来源域查 transferIn* 字段；
   * - 个人空间/公共库无配置字段（null 恒允许），由归属权限兜底；
   * - 系统规则：禁止从公共资源库移出（破坏公开资源）。
   */
  private async assertCrossProjectTransferPolicy(
    action: MutationAction,
    nodeCtx: OwnershipNode,
    targetCtx: OwnershipNode
  ): Promise<void> {
    const isMove = action === 'move';
    const sourceRootType = nodeCtx.rootNodeType;
    const targetRootType = targetCtx.rootNodeType;

    // 系统规则：公共资源库是系统维护的公开资源，禁止从库移出
    if (isMove && this.isLibraryRootType(sourceRootType)) {
      throw new BadRequestException(
        I18nContext.current()?.t('error.file.cannot_move_out_of_library') ??
          '不能从资源库移出文件'
      );
    }

    // 出向策略：源为项目时，本项目文件按目标域受 transferOut* 约束
    if (sourceRootType === NodeType.PROJECT && nodeCtx.projectId) {
      const field =
        NodeMutationGuard.TRANSFER_OUT_FIELD[targetRootType ?? ''];
      const mode = await this.getTransferMode(nodeCtx.projectId, field);
      if (!this.modeAllows(mode, isMove)) {
        throw new ForbiddenException(
          I18nContext.current()?.t('error.project.transfer_out_disabled') ??
            '该项目的跨项目转移策略不允许此操作'
        );
      }
    }

    // 入向策略：目标为项目时，来源域按目标项目 transferIn* 约束
    if (targetRootType === NodeType.PROJECT && targetCtx.projectId) {
      const field =
        NodeMutationGuard.TRANSFER_IN_FIELD[sourceRootType ?? ''];
      const mode = await this.getTransferMode(targetCtx.projectId, field);
      if (!this.modeAllows(mode, isMove)) {
        throw new ForbiddenException(
          I18nContext.current()?.t('error.project.transfer_in_disabled') ??
            '目标项目的跨项目转移策略不允许此操作'
        );
      }
    }
  }

  /** 读取项目根节点的转移模式字段（非项目根无字段 → null 恒允许） */
  private async getTransferMode(
    rootId: string,
    field?: TransferModeField
  ): Promise<CrossProjectTransferMode | null | undefined> {
    if (!field) return null;
    const root = await this.prisma.fileSystemNode.findUnique({
      where: { id: rootId },
    });
    return root
      ? (root[field] as CrossProjectTransferMode | null | undefined)
      : null;
  }

  private modeAllows(
    mode: CrossProjectTransferMode | null | undefined,
    isMove: boolean
  ): boolean {
    if (mode == null) return true; // 非项目根无配置 → 恒允许（归属权限兜底）
    if (mode === CrossProjectTransferMode.ALL) return true;
    return isMove
      ? mode === CrossProjectTransferMode.MOVE_ONLY
      : mode === CrossProjectTransferMode.COPY_ONLY;
  }

  /**
   * 组装配额策略键：PERSONAL_STORAGE 仅统计个人空间（projectId === personalSpace.id）下的文件，
   * 只有变更目标位于该用户个人空间时才带入该策略，避免项目间操作被个人空间配额误拦。
   */
  private async buildQuotaStrategyKeys(
    ownerId: string,
    projectId: string | null
  ): Promise<string[]> {
    const strategyKeys: string[] = [QUOTA_KEYS.PROJECT_SIZE];
    if (!projectId) {
      strategyKeys.push(QUOTA_KEYS.PERSONAL_STORAGE);
      return strategyKeys;
    }
    const personalSpace = await this.prisma.fileSystemNode.findFirst({
      where: { ownerId, nodeType: NodeType.PERSONAL_SPACE },
      select: { id: true },
    });
    if (personalSpace && personalSpace.id === projectId) {
      strategyKeys.push(QUOTA_KEYS.PERSONAL_STORAGE);
    }
    return strategyKeys;
  }

  /**
   * 变更后配额缓存失效统一入口。
   */
  async invalidateQuotaAfterMutation(
    userId: string,
    node: { projectId?: string | null },
    extraProjectId?: string | null
  ): Promise<void> {
    await this.storageInfoService.invalidateQuotaCache(
      userId,
      node.projectId ?? undefined
    );
    if (extraProjectId && extraProjectId !== node.projectId) {
      await this.storageInfoService.invalidateQuotaCache(
        userId,
        extraProjectId
      );
    }
  }
}
