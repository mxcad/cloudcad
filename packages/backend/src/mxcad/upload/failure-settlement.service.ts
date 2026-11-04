///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { Injectable, Logger } from '@nestjs/common';
import { FileStatus } from '@cloudcad/db';
import type { ConversionFailureCategory } from '@cloudcad/contracts';
import { AuditLogService } from '../../audit/audit-log.service';
import { AuditAction, ResourceType } from '../../common/enums/audit.enum';
import { DatabaseService } from '../../database/database.service';
import { UploadGhostService } from '../conversion/upload-ghost.service';
import { FileSystemNodeContext } from '../node/filesystem-node.service';
import type { ConversionQuotaReservation } from '../../vip/restriction-engine.service';
import type { IngestSource } from './drawing-ingest.service';

/**
 * 后台转换失败清算（评审候选 6：从 DrawingIngestService 巨缝抽出的单一 stage）。
 *
 * 职责：转换/落盘失败后的节点路径统一清算——释放转换额度 → 写失败审计 → 删除
 * 未成功节点 → 执行调用方清理（分片临时目录 / 合并缓存）。整包（cad）与分片
 * （chunk）两条节点路径共用；无节点路径（SSE 状态机，无 node/审计/删节点）形态
 * 不同，不在此列，由 NoNodeConversionService 自理。
 *
 * 依赖三个且互不交织：auditLogService（失败审计）、prisma + uploadGhostService
 * （失败节点清理）。每步独立容错：任一步抛错只记日志、不阻断后续步骤。
 */
@Injectable()
export class FailureSettlementService {
  private readonly logger = new Logger(FailureSettlementService.name);

  constructor(
    private readonly auditLogService: AuditLogService,
    private readonly prisma: DatabaseService,
    private readonly uploadGhostService: UploadGhostService
  ) {}

  /**
   * 后台转换失败清算（节点路径共用）：释放转换额度 → 写失败审计 → 删除未成功节点
   * → 执行调用方清理（分片临时目录 / 合并缓存）。
   *
   * 每步独立容错：任一步抛错只记日志、不阻断后续步骤——失败审计与删节点是失败诊断
   * 的唯一可见面，绝不能因额度释放异常而丢失。
   *
   * `reservation` 由调用方按「转换是否真正完成」决定：转换失败→传上传时占到的句柄
   * （额度应退还）；落盘失败（转换已成功）→传 NO_OP_CONVERSION_RESERVATION（额度已实际
   * 消耗，不退）。句柄自身区分「占过 / 未占」，故调用方无需再跟踪布尔标记。
   */
  async settleNodeFailure(opts: {
    context: FileSystemNodeContext;
    source: IngestSource;
    reservation: ConversionQuotaReservation;
    nodeId: string;
    audit: {
      name: string;
      fileHash: string;
      size: number;
      error: string;
      transient?: boolean;
      errorCategory?: ConversionFailureCategory;
      stage: 'conversion' | 'materialize';
    };
    cleanup?: () => Promise<void>;
  }): Promise<void> {
    const step = async (
      label: string,
      run: () => Promise<unknown>
    ): Promise<void> => {
      try {
        await run();
      } catch (err) {
        this.logger.error(
          `[DrawingIngest.settle] ${label}失败（不阻断后续清算）: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
      }
    };
    await step('释放转换额度', () => opts.reservation.release());
    await step('写失败审计', () =>
      this.logUploadFailure({
        context: opts.context,
        nodeId: opts.nodeId,
        name: opts.audit.name,
        fileHash: opts.audit.fileHash,
        size: opts.audit.size,
        error: opts.audit.error,
        transient: opts.audit.transient,
        errorCategory: opts.audit.errorCategory,
        stage: opts.audit.stage,
      })
    );
    await step('删除未成功节点', () => this.purgeFailedNode(opts.nodeId));
    if (opts.cleanup) {
      await step('清理临时资源', opts.cleanup);
    }
  }

  /**
   * 终态失败审计：失败瞬间写，节点保留窗口到期会被清理，审计是失败原因的唯一
   * 持久记录（节点上无 error 字段，引擎原始 message 只存在于本处 + 日志）。
   *
   * 复用 AuditAction.FILE_UPLOAD：AuditLogService 对高频读组只过滤「成功」记录，
   * success=false 一定落库，正好承载「上传了但转换/落盘失败」的追溯需求。
   * 埋点失败不阻塞后台清理流程。
   */
  private async logUploadFailure(args: {
    context: FileSystemNodeContext;
    nodeId: string;
    name: string;
    fileHash: string;
    size: number;
    error: string;
    transient?: boolean;
    /** 失败性质分类（仅 conversion 阶段有意义）：存完整粒度供运维按失败类型告警 */
    errorCategory?: ConversionFailureCategory;
    stage: 'conversion' | 'materialize';
  }): Promise<void> {
    try {
      await this.auditLogService.log({
        action: AuditAction.FILE_UPLOAD,
        resourceType: ResourceType.FILE,
        resourceId: args.nodeId,
        userId: args.context?.userId ?? 'unknown',
        success: false,
        errorMessage: args.error,
        resourceName: args.name,
        params: {
          fileName: args.name,
          hash: args.fileHash,
          size: args.size,
          failureStage: args.stage,
          transient: args.transient ?? null,
          errorCategory: args.errorCategory ?? null,
        },
      });
    } catch (error) {
      this.logger.warn(
        `[DrawingIngest] 上传失败审计埋点失败（业务不阻塞）: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * 失败节点清理：转换 / 落盘未成功的节点**不留存**（产品要求：没有转换成功
   * 都不保留 node 数据库记录）。读节点当前态——存在、未删、非 COMPLETED
   * （落盘成功后才抛的异常，文件已真实落盘）且是上传幽灵（path=null，判定与
   * 处置规则见 UploadGhostService 单一出口）→ 硬删；其余情况 no-op，避免误删
   * 真实文件。
   */
  private async purgeFailedNode(nodeId: string): Promise<void> {
    try {
      const node = await this.prisma.fileSystemNode.findUnique({
        where: { id: nodeId },
        select: { fileStatus: true, deletedAt: true, path: true },
      });
      if (!node || node.deletedAt) return;
      if (node.fileStatus === FileStatus.COMPLETED) return;
      if (!this.uploadGhostService.isGhost(node)) return;
      if (await this.uploadGhostService.purgeGhostNode(nodeId)) {
        this.logger.log(`[DrawingIngest.purge] 失败节点已删除: ${nodeId}`);
      }
    } catch (error) {
      this.logger.warn(
        `[DrawingIngest.purge] 失败节点删除失败（不阻塞）: ${nodeId} (${
          error instanceof Error ? error.message : String(error)
        })`
      );
    }
  }
}
