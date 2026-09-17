///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileStatus } from '@cloudcad/db';
import { DatabaseService } from '../../database/database.service';
import { NodeTrashService } from '../../file-operations/node-trash.service';

/** 默认保留窗口（小时）：FAILED 节点在此窗口内可见，到期彻底删除 */
const DEFAULT_FAILED_NODE_RETENTION_HOURS = 24;
/** 清理轮询间隔（毫秒）：默认 1 小时（保留窗口按小时计，无需高频扫描） */
const DEFAULT_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
/** 启动后首次清理延迟（毫秒）：等其它服务就绪 + 给刚失败的任务留出可见窗口 */
const STARTUP_CLEANUP_DELAY_MS = 5 * 60 * 1000;
/** 单次清理最多处理节点数（防单次扫描过多） */
const MAX_CLEANUP_BATCH = 200;
const ONE_HOUR_MS = 60 * 60 * 1000;

/**
 * 转换失败节点清理服务
 *
 * 上传链路（DrawingIngestService）终态失败时节点置 FAILED 但**不立即删除**：
 * FAILED 行在保留窗口内是失败的唯一可见面（文件夹红色 × 徽标 + 转换面板「云端」
 * 列表据 fileStatus=FAILED 展示失败原因），用户据此知道上传失败了、而不是文件
 * 凭空消失。窗口到期后由本服务彻底删除，保证 FAILED 行不会永久堆积、不需要
 * 用户手动清理。
 *
 * 失败时刻的真实错误已同步写入审计日志（AuditAction.FILE_UPLOAD, success=false），
 * 节点上无 error 字段，因此删除节点不丢诊断信息。
 *
 * 用 deleteNode(id, true) 彻底删除而非移回收站：这些节点是 FILE 且 path=null
 * （skipFileCopy，从未落盘分配存储），无子节点、无存储目录，软删进回收站只会
 * 留一条打不开的死记录。userId 传空 → NodeTrashService 跳过 FILE_DELETE 审计
 * 埋点，避免系统清理被记成用户删除。
 *
 * `CONVERSION_FAILED_NODE_RETENTION_HOURS <= 0` 时禁用清理（FAILED 节点永久保留，
 * 用于排障）。
 */
@Injectable()
export class ConversionFailedNodeCleanupService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(ConversionFailedNodeCleanupService.name);
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private startupTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly retentionHours: number;
  private readonly intervalMs: number;

  constructor(
    private readonly prisma: DatabaseService,
    private readonly nodeTrashService: NodeTrashService,
    private readonly configService: ConfigService
  ) {
    this.retentionHours = this.parseIntConfig(
      'CONVERSION_FAILED_NODE_RETENTION_HOURS',
      DEFAULT_FAILED_NODE_RETENTION_HOURS
    );
    this.intervalMs = this.parseIntConfig(
      'CONVERSION_FAILED_NODE_CLEANUP_INTERVAL_MS',
      DEFAULT_CLEANUP_INTERVAL_MS
    );
  }

  onModuleInit(): void {
    if (this.retentionHours <= 0) {
      this.logger.warn(
        `[FailedNodeCleanup] 保留窗口配置为 ${this.retentionHours}h，清理已禁用`
      );
      return;
    }
    // 定时轮询清理（unref 不阻止测试/优雅关闭）
    this.cleanupTimer = setInterval(() => {
      void this.runSafely('定时');
    }, this.intervalMs);
    this.cleanupTimer.unref?.();
    // 启动延迟一次清理（覆盖「重启后第一次」）
    this.startupTimer = setTimeout(() => {
      void this.runSafely('启动');
    }, STARTUP_CLEANUP_DELAY_MS);
    this.startupTimer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    if (this.startupTimer) {
      clearTimeout(this.startupTimer);
      this.startupTimer = null;
    }
  }

  private parseIntConfig(key: string, fallback: number): number {
    const raw = this.configService.get<string>(key);
    const parsed = raw !== undefined ? parseInt(raw, 10) : NaN;
    return !Number.isNaN(parsed) ? parsed : fallback;
  }

  private async runSafely(trigger: string): Promise<void> {
    try {
      const { scanned, deleted } = await this.cleanupExpired();
      if (scanned > 0) {
        this.logger.log(
          `[FailedNodeCleanup] ${trigger}清理：扫描 ${scanned} 个超保留窗口的 FAILED 节点，删除 ${deleted} 个`
        );
      }
    } catch (err: unknown) {
      this.logger.warn(
        `[FailedNodeCleanup] ${trigger}清理失败: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }

  /**
   * 清理一次：扫描超过保留窗口的 FAILED 节点并彻底删除。
   * @returns { scanned, deleted } 扫描到的候选数 / 实际删除数
   */
  async cleanupExpired(): Promise<{ scanned: number; deleted: number }> {
    if (this.retentionHours <= 0) {
      return { scanned: 0, deleted: 0 };
    }
    const cutoff = new Date(Date.now() - this.retentionHours * ONE_HOUR_MS);
    const stale = await this.prisma.fileSystemNode.findMany({
      where: {
        deletedAt: null,
        fileStatus: FileStatus.FAILED,
        updatedAt: { lte: cutoff },
      },
      select: { id: true, name: true, updatedAt: true },
      orderBy: { updatedAt: 'asc' },
      take: MAX_CLEANUP_BATCH,
    });
    if (stale.length === 0) {
      return { scanned: 0, deleted: 0 };
    }

    let deleted = 0;
    for (const node of stale) {
      try {
        await this.nodeTrashService.deleteNode(node.id, true);
        deleted += 1;
      } catch (error) {
        // 单个节点失败不中断整批，留待下次扫描
        this.logger.warn(
          `[FailedNodeCleanup] FAILED 节点删除失败，留待下次扫描: ${node.id} (${
            error instanceof Error ? error.message : String(error)
          })`
        );
      }
    }
    return { scanned: stale.length, deleted };
  }
}
