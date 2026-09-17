import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import client from 'prom-client';

/**
 * 部分成功告警的共享 messageKey（#325 / ADR-0055 §7）：
 * 清理任务执行完成但存在单项失败（已删部分）时，各 scheduler 以 P2 上报。
 */
export const CLEANUP_PARTIAL_MESSAGE_KEY = 'cleanup.partial';

export interface CleanupRunObservation {
  /** 任务标识：统一取 TASK_NAMES 常量（如 storage-cleanup:expired-storage） */
  task: string;
  /** 本次清理删除的记录条数（缺省按 0 计） */
  recordsDeleted?: number;
  /** 本次清理释放的磁盘字节数；无法统计的任务可省略（不产生该 task 的字节序列） */
  spaceFreedBytes?: number;
  /** 本次耗时（秒），与 cleanup_last_duration_seconds 指标单位一致 */
  durationSeconds: number;
}

// 模块级单例注册：prom-client 全局注册表同名指标只能注册一次，
// 进程内服务为单例，测试中重复实例化也不会冲突（同 host-metrics.service.ts 模式）
const cleanupRecordsDeletedTotal = new client.Counter({
  name: 'cleanup_records_deleted_total',
  help: 'Total records deleted by background cleanup tasks',
  labelNames: ['task'] as const,
});
const cleanupSpaceFreedBytes = new client.Counter({
  name: 'cleanup_space_freed_bytes',
  help: 'Total disk space freed in bytes by background cleanup tasks',
  labelNames: ['task'] as const,
});
const cleanupLastDurationSeconds = new client.Gauge({
  name: 'cleanup_last_duration_seconds',
  help: 'Duration of the most recent run of each background cleanup task',
  labelNames: ['task'] as const,
});

/**
 * 清理任务指标埋点（#325 / ADR-0055 §7）：
 *
 * - `cleanup_records_deleted_total{task}` Counter —— 累计删除记录数
 * - `cleanup_space_freed_bytes{task}` Counter —— 累计释放磁盘字节
 * - `cleanup_last_duration_seconds{task}` Gauge —— 最近一次运行耗时
 *
 * 双写契约：observe() 同时更新指标与结构化 pino 日志（event/task/rows/freed/duration 字段），
 * 单一代码路径保证日志数值与指标一致。各清理 scheduler 在裸执行函数（定时 + 手动触发共用）
 * 中调用本方法。
 *
 * 结构化日志经 PinoLogger 写入应用日志流（app.log）。生产环境默认根级别为 warn，
 * 需要采集 cleanup_run 日志时设 LOG_LEVEL=info（见 app.module.ts 日志配置）。
 */
@Injectable()
export class CleanupMetricsService {
  constructor(private readonly pinoLogger: PinoLogger) {}

  observe(observation: CleanupRunObservation): void {
    const rows = sanitizeCount(observation.recordsDeleted ?? 0);
    const freed =
      typeof observation.spaceFreedBytes === 'number'
        ? sanitizeCount(observation.spaceFreedBytes)
        : undefined;
    const duration = sanitizeCount(observation.durationSeconds);

    cleanupRecordsDeletedTotal.inc({ task: observation.task }, rows);
    if (freed !== undefined) {
      cleanupSpaceFreedBytes.inc({ task: observation.task }, freed);
    }
    cleanupLastDurationSeconds.set({ task: observation.task }, duration);

    this.pinoLogger.info(
      {
        event: 'cleanup_run',
        task: observation.task,
        rows,
        freed: freed ?? 0,
        duration: Number(duration.toFixed(3)),
      },
      'cleanup_run'
    );
  }
}

/** 非有限数（NaN/±Infinity）归零，负数截断为 0：脏数据不得污染计数器 */
function sanitizeCount(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}
