///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this code, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import {
  Injectable,
  Inject,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../../database/database.service';
import { IFunctionExecutor } from '../../function-executor/function-executor.interface';
import { FileStatus } from '../../common/enums/file-status.enum';
import { NodeStatusTransitioner } from '../../file-system/file-status/node-status-transitioner';
import { NodeTrashService } from '../../file-operations/node-trash.service';

/** 宽限期（分钟）：node 处于 PROCESSING 且 updatedAt 早于 now - grace 才视为"卡死" */
const DEFAULT_STUCK_GRACE_MINUTES = 30;
/** 对账轮询间隔（毫秒）：默认 5 分钟 */
const DEFAULT_RECONCILE_INTERVAL_MS = 5 * 60 * 1000;
/** 启动后首次对账延迟（毫秒）：等其它服务就绪 + 给进行中的转换留时间 */
const STARTUP_RECONCILE_DELAY_MS = 30 * 1000;
/** 单次对账最多处理 node 数（防单次扫描过多） */
const MAX_RECONCILE_BATCH = 200;

/**
 * 转换任务对账服务（S5-3 卡死 node 恢复）
 *
 * `AsyncConversionService.convertNode`/`convertNodeForExport` 写 node.taskId + 置 PROCESSING 后
 * fire-and-forget `executor.invoke`。若 backend 重启（promise 丢失）或 conversion-service 重启
 * （local driver 任务丢失），node 会永久卡在 PROCESSING——用户无法打开/重试。
 *
 * 本服务定时（默认 5min）+ 启动延迟一次扫描"卡死"的 node（PROCESSING + taskId 非空 +
 * updatedAt 超宽限期），按 executor 实时任务状态恢复：
 * - COMPLETED → node 置 COMPLETED
 * - FAILED / 任务丢失（getTaskStatus 抛 404）→ 按 path 分流：
 *   - path=null（上传幽灵，从未落盘）→ 直接删除（不留 FAILED 记录，与上传链路
 *     失败即删一致）；
 *   - path!=null（已存在的真实文件）→ 置 FAILED，保留供用户重试或手动处理。
 * - PENDING / PROCESSING（仍在跑）→ 跳过（只是慢）
 *
 * 状态转换经 NodeStatusTransitioner（状态机校验）。宽限期避免误伤正常长转换
 * （转换 timeout 上限 180s，30min 远超）。
 */
@Injectable()
export class ConversionReconciliationService {
  private readonly logger = new Logger(ConversionReconciliationService.name);
  private reconcileTimer: ReturnType<typeof setInterval> | null = null;
  private startupTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly graceMinutes: number;
  private readonly intervalMs: number;

  constructor(
    @Inject(IFunctionExecutor) private readonly executor: IFunctionExecutor,
    private readonly prisma: DatabaseService,
    private readonly nodeStatusTransitioner: NodeStatusTransitioner,
    private readonly nodeTrashService: NodeTrashService,
    private readonly configService: ConfigService
  ) {
    const graceRaw = this.configService.get<string>('CONVERSION_STUCK_GRACE_MINUTES');
    this.graceMinutes =
      graceRaw !== undefined && !Number.isNaN(parseInt(graceRaw, 10))
        ? parseInt(graceRaw, 10)
        : DEFAULT_STUCK_GRACE_MINUTES;
    const intervalRaw = this.configService.get<string>('CONVERSION_RECONCILE_INTERVAL_MS');
    this.intervalMs =
      intervalRaw !== undefined && !Number.isNaN(parseInt(intervalRaw, 10))
        ? parseInt(intervalRaw, 10)
        : DEFAULT_RECONCILE_INTERVAL_MS;
  }

  onModuleInit(): void {
    // 定时轮询对账（unref 不阻止测试/优雅关闭）
    this.reconcileTimer = setInterval(() => {
      void this.runSafely('定时');
    }, this.intervalMs);
    this.reconcileTimer.unref?.();
    // 启动延迟一次对账（覆盖"重启后第一次"，给正常转换留时间避免误伤）
    this.startupTimer = setTimeout(() => {
      void this.runSafely('启动');
    }, STARTUP_RECONCILE_DELAY_MS);
    this.startupTimer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.reconcileTimer) {
      clearInterval(this.reconcileTimer);
      this.reconcileTimer = null;
    }
    if (this.startupTimer) {
      clearTimeout(this.startupTimer);
      this.startupTimer = null;
    }
  }

  private async runSafely(trigger: string): Promise<void> {
    try {
      const { checked, recovered } = await this.reconcile();
      if (recovered > 0) {
        this.logger.warn(
          `[Reconciliation] ${trigger}对账：扫描 ${checked} 个卡死 node，恢复 ${recovered} 个`
        );
      }
    } catch (err: unknown) {
      this.logger.warn(
        `[Reconciliation] ${trigger}对账失败: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  /**
   * 对账一次：扫描卡死 node 并按任务状态恢复。
   * @returns checked=扫描到的卡死 node 数，recovered=实际恢复（状态变更）的 node 数
   */
  async reconcile(): Promise<{ checked: number; recovered: number }> {
    const cutoff = new Date(Date.now() - this.graceMinutes * 60 * 1000);
    const nodes = await this.prisma.fileSystemNode.findMany({
      where: {
        deletedAt: null,
        deletedByCascade: false,
        taskId: { not: null },
        fileStatus: { in: [FileStatus.PROCESSING] },
        updatedAt: { lt: cutoff },
      },
      select: { id: true, fileStatus: true, taskId: true, path: true },
      take: MAX_RECONCILE_BATCH,
    });

    let recovered = 0;
    for (const node of nodes) {
      const from = (node.fileStatus as FileStatus | null) ?? FileStatus.PROCESSING;
      try {
        const status = await this.executor.getTaskStatus(node.taskId!);
        if (status.status === 'COMPLETED') {
          await this.nodeStatusTransitioner.transition(node.id, from, FileStatus.COMPLETED);
          recovered++;
          this.logger.log(`[Reconciliation] node ${node.id} 任务已完成 → COMPLETED`);
        } else if (status.status === 'FAILED') {
          await this.resolveFailure(node, from);
          recovered++;
        }
        // PENDING / PROCESSING：任务仍在跑（只是慢），跳过
      } catch {
        // 任务丢失（404 / conversion-service 重启）：按 path 分流处理
        await this.resolveFailure(node, from);
        recovered++;
        this.logger.warn(
          `[Reconciliation] node ${node.id} 任务 ${node.taskId} 丢失 → 按 path 分流`
        );
      }
    }
    return { checked: nodes.length, recovered };
  }

  /**
   * 卡死节点失败分流（与「不留存未成功 node 记录」一致）：
   * - `path = null`（上传幽灵，从未落盘）→ 直接删除，不留 FAILED 记录；
   * - `path != null`（已存在的真实文件）→ 置 FAILED，保留供用户重试或手动处理。
   * 删除失败不阻塞整批（节点可能已被并发删除），仅记日志。
   */
  private async resolveFailure(
    node: { id: string; path: string | null },
    from: FileStatus | null
  ): Promise<void> {
    if (node.path === null) {
      try {
        await this.nodeTrashService.deleteNode(node.id, true);
        this.logger.log(`[Reconciliation] node ${node.id} 上传幽灵 → 已删除`);
      } catch (error) {
        this.logger.warn(
          `[Reconciliation] node ${node.id} 删除失败（不阻塞）: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
      return;
    }
    await this.nodeStatusTransitioner.transition(node.id, from, FileStatus.FAILED);
    this.logger.log(`[Reconciliation] node ${node.id} 真实文件 → FAILED（保留）`);
  }
}
