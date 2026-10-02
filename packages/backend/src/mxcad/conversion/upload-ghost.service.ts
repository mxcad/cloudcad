///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { Injectable, Logger } from '@nestjs/common';
import { NodeTrashService } from '../../file-operations/node-trash.service';

/**
 * 上传幽灵节点（upload ghost）处置的单一出口。
 *
 * 「上传幽灵」= FileSystemNode 存在但 `path = null` 的未完成 FILE 节点：摄入
 * 流程在转换 / 落盘失败后本应立即删除，节点从未落盘分配存储（skipFileCopy），
 * 无子节点、无存储目录。处置规则只有一种：`deleteNode(id, true)` 彻底删除
 * 而非移回收站——软删进回收站只会留一条打不开的死记录；userId 传空 →
 * NodeTrashService 跳过 FILE_DELETE 审计埋点，避免系统清理被记成用户删除。
 *
 * 消费方：摄入失败清理（DrawingIngestService.purgeFailedNode）、转换对账
 * （ConversionReconciliationService.resolveFailure）、FAILED 兜底清理
 * （ConversionFailedNodeCleanupService.cleanupExpired）。失败真实原因的持久
 * 记录在 AuditAction.FILE_UPLOAD 失败审计里，删除节点不丢诊断信息。
 *
 * 放置在 conversion 侧是接线决定：两个兜底清扫器在本模块，upload 模块本就
 * import 本模块（DrawingIngestService 消费 FileConversionService），反向会成环。
 */
@Injectable()
export class UploadGhostService {
  private readonly logger = new Logger(UploadGhostService.name);

  constructor(private readonly nodeTrashService: NodeTrashService) {}

  /**
   * 判定是否上传幽灵：`path = null` 即从未落盘分配存储。
   * 各消费方的额外前置（存在性 / 未删 / 非 COMPLETED / 超保留窗口）由调用方
   * 的查询条件承担，本判定只回答「这个节点是不是幽灵」。
   */
  isGhost(node: { path: string | null }): boolean {
    return node.path === null;
  }

  /**
   * 彻底删除上传幽灵节点（非回收站、跳过 FILE_DELETE 用户审计）。
   * 删除失败不阻塞（节点可能已被并发删除），返回 false 并记日志。
   */
  async purgeGhostNode(nodeId: string): Promise<boolean> {
    try {
      await this.nodeTrashService.deleteNode(nodeId, true);
      this.logger.log(`[UploadGhost] 上传幽灵节点已删除: ${nodeId}`);
      return true;
    } catch (error) {
      this.logger.warn(
        `[UploadGhost] 上传幽灵节点删除失败（不阻塞）: ${nodeId} (${
          error instanceof Error ? error.message : String(error)
        })`
      );
      return false;
    }
  }
}
