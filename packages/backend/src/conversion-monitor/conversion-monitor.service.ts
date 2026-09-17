///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import {
  Injectable,
  Inject,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { IFunctionExecutor } from '../function-executor/function-executor.interface';
import type {
  ExecutorDurationStats,
  ExecutorQueueStats,
  ExecutorTaskRecord,
  PriorityQueueDurationStats,
  PriorityQueueStats,
  TaskDurationStats,
  WorkerPoolLevelStats,
  WorkerPoolTaskCounts,
} from '../function-executor/function-executor.interface';

/**
 * 转换队列监控（#406 / ADR-0058）：
 *
 * 取数只走 IFunctionExecutor seam：容器已按 FUNCTION_EXECUTOR 选定 adapter，
 * 本模块不读配置键、不认模式字符串，形态差异由 adapter 的返回值判别联合体现
 * （process-pool 进程内统计 / conversion-service 代理远端 / cloud-faas 无队列）。
 * 30s 定时采样写入 24h 内存环形缓冲（重启丢失，长历史走 Grafana，见 ADR-0055/0058）；
 * 单实例部署前提（backend/conversion-service 均 replicas=1），无跨实例聚合。
 */

/** 转换执行器模式（对外契约：前端按此选择监控面板） */
export type ConversionMode =
  'process-pool' | 'conversion-service' | 'cloud-faas';

/** process-pool 形态当前值 = seam 词汇表 + 耗时样本（不再镜像 RateLimiter 字段） */
export type ProcessPoolCurrent = PriorityQueueStats & {
  duration: PriorityQueueDurationStats;
};

/** conversion-service 形态当前值（远端 /v1/conversions/stats 透传） */
export type ConversionServiceCurrent = {
  tasks: WorkerPoolTaskCounts;
  duration: TaskDurationStats;
  workers: Record<string, WorkerPoolLevelStats>;
};

/** 转换任务明细记录 = seam 的 ExecutorTaskRecord（同一份词汇表） */
export type ConversionTaskItem = ExecutorTaskRecord;

/** 历史采样点（30s 间隔；null 表示该模式无此字段） */
export interface ConversionSample {
  /** epoch ms */
  t: number;
  /** 排队深度：process-pool=queueLength，conversion-service=pending */
  queueDepth: number | null;
  /** 运行中：process-pool=runningCount，conversion-service=processing */
  running: number | null;
  /** 耗时 P95（ms） */
  p95DurationMs: number | null;
}

export interface ConversionMonitorStats {
  mode: ConversionMode;
  /** process-pool 形态当前值（其他形态为 null） */
  processPool: ProcessPoolCurrent | null;
  /** conversion-service 形态当前值（其他形态或拉取失败为 null） */
  conversionService: ConversionServiceCurrent | null;
  /** conversion-service 拉取失败原因（成功为 null） */
  conversionServiceError: string | null;
  /** 24h 历史采样（30s 间隔，旧→新；重启后为空） */
  history: ConversionSample[];
  sampledAt: number;
}

/** 转换任务明细列表（#478 监控 Tab 数据源） */
export interface ConversionTaskList {
  items: ConversionTaskItem[];
  total: number;
}

const SAMPLE_INTERVAL_MS = 30_000;
const HISTORY_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_HISTORY_POINTS = 24 * 60 + 1;

@Injectable()
export class ConversionMonitorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ConversionMonitorService.name);
  private readonly history: ConversionSample[] = [];
  private samplerTimer: NodeJS.Timeout | null = null;

  constructor(
    @Inject(IFunctionExecutor) private readonly executor: IFunctionExecutor
  ) {}

  onModuleInit(): void {
    this.samplerTimer = setInterval(() => {
      void this.sample().catch((err: unknown) => {
        this.logger.warn(
          `转换监控采样失败: ${err instanceof Error ? err.message : String(err)}`
        );
      });
    }, SAMPLE_INTERVAL_MS);
    this.samplerTimer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.samplerTimer) {
      clearInterval(this.samplerTimer);
      this.samplerTimer = null;
    }
  }

  async getStats(): Promise<ConversionMonitorStats> {
    let processPool: ProcessPoolCurrent | null = null;
    let conversionService: ConversionServiceCurrent | null = null;
    let conversionServiceError: string | null = null;
    // cloud-faas 形态无队列语义（queueStats 返回 null）；另两种形态由 kind 决定
    let mode: ConversionMode = 'cloud-faas';

    try {
      const queue = await this.executor.queueStats();
      const duration = await this.executor.durationStats();

      if (queue?.kind === 'priority-queue') {
        mode = 'process-pool';
        if (duration?.kind === 'priority-queue') {
          processPool = { ...queue.stats, duration: duration.stats };
        }
      } else if (queue?.kind === 'worker-pool') {
        mode = 'conversion-service';
        if (duration?.kind === 'task') {
          conversionService = {
            tasks: queue.tasks,
            duration: duration.stats,
            workers: queue.workers,
          };
        }
      }
    } catch (err: unknown) {
      // 只有 conversion-service 形态涉及 IO（另两种为进程内读或无队列），
      // 失败即该形态：保留模式标签 + 错误原因，前端据此显示「拉取失败」而非「不适用」
      mode = 'conversion-service';
      conversionServiceError =
        err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `拉取 conversion-service 统计失败: ${conversionServiceError}`
      );
    }

    return {
      mode,
      processPool,
      conversionService,
      conversionServiceError,
      history: [...this.history],
      sampledAt: Date.now(),
    };
  }

  /**
   * 列出转换任务明细（#478 监控 Tab 逐任务明细）。
   * 无独立任务存储的执行器不实现 listTasks（process-pool 的簿记仅供 getTaskStatus），
   * 此时返回空列表（前端仅展示聚合统计）。
   * 可选 status 过滤（pending/processing/completed/failed/cancelled）。
   */
  async listTasks(status?: string): Promise<ConversionTaskList> {
    const listTasks = this.executor.listTasks;
    if (!listTasks) {
      return { items: [], total: 0 };
    }
    try {
      const items = await listTasks.call(this.executor, status);
      return { items, total: items.length };
    } catch (err: unknown) {
      this.logger.warn(
        `拉取转换任务明细失败: ${err instanceof Error ? err.message : String(err)}`
      );
      return { items: [], total: 0 };
    }
  }

  /** 执行一次采样并写入环形缓冲（采样器定时调用；失败不影响主流程） */
  private async sample(): Promise<void> {
    const t = Date.now();
    let queueDepth: number | null = null;
    let running: number | null = null;
    let p95DurationMs: number | null = null;

    const queue = await this.executor.queueStats();
    if (queue?.kind === 'priority-queue') {
      queueDepth = queue.stats.queueLength;
      running = queue.stats.runningCount;
    } else if (queue?.kind === 'worker-pool') {
      queueDepth = queue.tasks.pending;
      running = queue.tasks.processing;
    }

    const duration = await this.executor.durationStats();
    if (duration?.kind === 'priority-queue') {
      p95DurationMs = duration.stats.p95DurationMs;
    } else if (duration?.kind === 'task') {
      p95DurationMs = duration.stats.p95Ms;
    }

    this.history.push({ t, queueDepth, running, p95DurationMs });
    const cutoff = Date.now() - HISTORY_WINDOW_MS;
    while (
      this.history.length > 0 &&
      (this.history.length > MAX_HISTORY_POINTS || this.history[0].t < cutoff)
    ) {
      this.history.shift();
    }
  }

}
