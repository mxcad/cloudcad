import type { AlertRecordDto } from '@/api-sdk';

export interface HealthStatus {
  status: 'up' | 'down';
  message: string;
}

export interface SystemHealth {
  database: HealthStatus;
  storage: HealthStatus;
}

/**
 * 系统监控中心 Tab 枚举（#217 定案）
 * backgroundTasks / alertHistory 由 #211 / #248 实现；
 * conversionQueue 由 #406（ADR-0058）实现。
 */
export type MonitorTab =
  | 'core'
  | 'cache'
  | 'backgroundTasks'
  | 'conversionQueue'
  | 'alertHistory';

export const MONITOR_TABS: MonitorTab[] = [
  'core',
  'cache',
  'backgroundTasks',
  'conversionQueue',
  'alertHistory',
];

export type CacheLevelKey = 'L1' | 'L2';

export type CacheHealthStatusValue = 'healthy' | 'degraded' | 'unhealthy';

export interface CacheLevelStats {
  level: string;
  size: number;
  hits: number;
  misses: number;
  hitRate: number;
  totalRequests: number;
  memoryUsage: number;
  maxCapacity: number;
  isConnected: boolean;
}

export interface CacheSummaryStats {
  levels: {
    L1: Partial<CacheLevelStats>;
    L2: Partial<CacheLevelStats>;
  };
  summary: {
    totalHits: number;
    totalMisses: number;
    totalRequests: number;
    overallHitRate: number;
    totalMemoryUsage: number;
  };
}

export interface CacheLevelHealth {
  level: string;
  status: CacheHealthStatusValue;
  lastCheckTime: string;
  availability: number;
  error?: string;
}

export interface CacheHealthStatus {
  L1: Partial<CacheLevelHealth>;
  L2: Partial<CacheLevelHealth>;
  overall: CacheHealthStatusValue;
}

export interface CachePerformanceMetrics {
  avgResponseTime: number;
  p50ResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  throughput: number;
  errorRate: number;
}

export interface CacheMonitorSummary {
  stats: CacheSummaryStats | null;
  healthStatus: CacheHealthStatus | null;
  performanceMetrics: {
    L1?: Partial<CachePerformanceMetrics>;
    L2?: Partial<CachePerformanceMetrics>;
  };
  timestamp: string;
}

export interface CacheTrendPoint {
  label: string;
  value: number;
}

/* ==================== 转换队列监控（#406 / ADR-0058） ==================== */

export type ConversionMode =
  | 'process-pool'
  | 'conversion-service'
  | 'cloud-faas';

/** conversion-service 模式：单级工作池（优先级 1=upload / 2=export / 3=thumbnail） */
export interface ConversionWorkerLevel {
  label: string;
  maxConcurrent: number;
  currentMax: number;
  running: number;
  waiting: number;
  autoScale: boolean;
  backlogSince: number | null;
}

/** 历史采样点（30s 间隔；null 表示该模式无此字段） */
export interface ConversionHistoryPoint {
  t: number;
  queueDepth: number | null;
  running: number | null;
  p95DurationMs: number | null;
}

/**
 * 转换队列监控页面状态（从 SDK 宽松类型防御性解析而来）
 * process-pool 与 conversion-service 字段按模式互斥填充，无数据为 null
 */
export interface ConversionQueueState {
  mode: ConversionMode;
  /** process-pool：队列深度 / 运行中 / 并发上限 / 超时阈值 */
  queueLength: number | null;
  criticalQueueLength: number | null;
  highQueueLength: number | null;
  lowQueueLength: number | null;
  runningCount: number | null;
  maxConcurrent: number | null;
  timeoutMs: number | null;
  /** process-pool：最近完成任务的执行耗时 / 排队等待时长（P50/P95，ms） */
  p50DurationMs: number | null;
  p95DurationMs: number | null;
  p50WaitMs: number | null;
  p95WaitMs: number | null;
  durationSampleCount: number;
  /** conversion-service：任务计数 */
  tasksPending: number | null;
  tasksProcessing: number | null;
  tasksCompleted: number | null;
  tasksFailed: number | null;
  /** conversion-service：终态任务执行耗时（P50/P95，ms） */
  p50TaskMs: number | null;
  p95TaskMs: number | null;
  /** conversion-service：三级工作池（含自动扩容状态） */
  workers: ConversionWorkerLevel[];
  /** conversion-service 拉取失败原因（成功为 null） */
  conversionServiceError: string | null;
  /** 24h 历史采样（旧→新；重启后为空） */
  history: ConversionHistoryPoint[];
}

/**
 * SDK 返回的 ConversionMonitorStatsDto 嵌套字段为宽松类型
 * （{[key: string]: unknown}），在此做防御性解析为页面级具体类型
 * （与 parseCacheSummary 模式一致）
 */
export function parseConversionMonitorStats(
  raw: unknown
): ConversionQueueState {
  const root = (raw ?? {}) as Record<string, unknown>;
  const mode: ConversionMode =
    root.mode === 'conversion-service' || root.mode === 'cloud-faas'
      ? root.mode
      : 'process-pool';

  const pp = (root.processPool ?? {}) as Record<string, unknown>;
  const ppDuration = (pp.duration ?? {}) as Record<string, unknown>;
  const cs = (root.conversionService ?? {}) as Record<string, unknown>;
  const csTasks = (cs.tasks ?? {}) as Record<string, unknown>;
  const csDuration = (cs.duration ?? {}) as Record<string, unknown>;
  const csWorkersRaw = (cs.workers ?? {}) as Record<string, unknown>;

  const workers: ConversionWorkerLevel[] = Object.entries(csWorkersRaw).map(
    ([key, value]) => {
      const w = (value ?? {}) as Record<string, unknown>;
      return {
        label: typeof w.label === 'string' ? w.label : key,
        maxConcurrent: toNumber(w.maxConcurrent),
        currentMax: toNumber(w.currentMax),
        running: toNumber(w.running),
        waiting: toNumber(w.waiting),
        autoScale: toBoolean(w.autoScale),
        backlogSince: toNumberOrNull(w.backlogSince),
      };
    }
  );

  const historyRaw = Array.isArray(root.history) ? root.history : [];
  const history: ConversionHistoryPoint[] = historyRaw.map((item) => {
    const h = (item ?? {}) as Record<string, unknown>;
    return {
      t: toNumber(h.t),
      queueDepth: toNumberOrNull(h.queueDepth),
      running: toNumberOrNull(h.running),
      p95DurationMs: toNumberOrNull(h.p95DurationMs),
    };
  });

  return {
    mode,
    queueLength: toNumberOrNull(pp.queueLength),
    criticalQueueLength: toNumberOrNull(pp.criticalPriorityQueueLength),
    highQueueLength: toNumberOrNull(pp.highPriorityQueueLength),
    lowQueueLength: toNumberOrNull(pp.lowPriorityQueueLength),
    runningCount: toNumberOrNull(pp.runningCount),
    maxConcurrent: toNumberOrNull(pp.maxConcurrent),
    timeoutMs: toNumberOrNull(pp.timeout),
    p50DurationMs: toNumberOrNull(ppDuration.p50DurationMs),
    p95DurationMs: toNumberOrNull(ppDuration.p95DurationMs),
    p50WaitMs: toNumberOrNull(ppDuration.p50WaitMs),
    p95WaitMs: toNumberOrNull(ppDuration.p95WaitMs),
    durationSampleCount: toNumber(ppDuration.sampleCount),
    tasksPending: toNumberOrNull(csTasks.pending),
    tasksProcessing: toNumberOrNull(csTasks.processing),
    tasksCompleted: toNumberOrNull(csTasks.completed),
    tasksFailed: toNumberOrNull(csTasks.failed),
    p50TaskMs: toNumberOrNull(csDuration.p50Ms),
    p95TaskMs: toNumberOrNull(csDuration.p95Ms),
    workers,
    conversionServiceError:
      typeof root.conversionServiceError === 'string'
        ? root.conversionServiceError
        : null,
    history,
  };
}

/* ==================== 告警历史（#248） ==================== */

export interface AlertPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface AlertListResult {
  items: AlertRecordDto[];
  pagination: AlertPagination;
}

/**
 * SDK 返回的 AlertListResponseDto.pagination 为宽松类型（{[key: string]: unknown}），
 * 在此做防御性解析为页面级具体类型（与 parseCacheSummary 模式一致）
 */
export function parseAlertList(raw: unknown): AlertListResult {
  const root = (raw ?? {}) as Record<string, unknown>;
  const paginationRaw = (root.pagination ?? {}) as Record<string, unknown>;
  const items = Array.isArray(root.data) ? (root.data as AlertRecordDto[]) : [];
  return {
    items,
    pagination: {
      page: toNumber(paginationRaw.page, 1),
      limit: toNumber(paginationRaw.limit, 20),
      total: toNumber(paginationRaw.total, 0),
      totalPages: toNumber(paginationRaw.totalPages, 0),
    },
  };
}

const toNumber = (v: unknown, fallback = 0): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const toBoolean = (v: unknown, fallback = false): boolean =>
  typeof v === 'boolean' ? v : fallback;

/* ==================== 后台任务（#211） ==================== */

export interface TaskRunRecord {
  id: string;
  taskName: string;
  status: 'SUCCESS' | 'FAILED';
  startedAt: string;
  finishedAt?: string | null;
  durationMs?: number | null;
  errorSummary?: string | null;
  trigger: 'SCHEDULED' | 'MANUAL';
  triggeredBy?: string | null;
  createdAt: string;
}

/** 已注册后台任务（任务清单，驱动源 = GET /admin/tasks/tasks） */
export interface TaskInfo {
  taskName: string;
  description: string;
  /** 定时 cron 表达式（服务器时区）；null = 无独立定时（随宿主任务执行或仅手动触发） */
  schedule: string | null;
  /** 定时的人类可读描述（主展示，如「每天 02:00」）；null = 无独立定时 */
  scheduleLabel: string | null;
}

/**
 * taskName → runtime-config 开关 key（与后端 task-run.constants.ts
 * TASK_NAMES / TASK_ENABLED_KEYS 一一对应，#210 定案）
 */
export const TASK_ENABLED_KEY_BY_NAME: Record<string, string> = {
  'storage-cleanup:expired-storage': 'storageCleanupEnabled',
  'storage-cleanup:trash': 'trashCleanupEnabled',
  'storage-cleanup:locks': 'lockCleanupEnabled',
  'storage-cleanup:disk-monitor': 'diskMonitorEnabled',
  'storage-cleanup:orphans': 'orphanCleanupEnabled',
  'cache-cleanup:warning-check': 'cacheCleanupEnabled',
  'cache-cleanup:stats-log': 'cacheCleanupEnabled',
  'cache-cleanup:health-check': 'cacheCleanupEnabled',
  'audit-cleanup:logs': 'auditCleanupEnabled',
  'batch-download:zip-cleanup': 'batchDownloadCleanupEnabled',
  'batch-download:db-cleanup': 'batchDownloadCleanupEnabled',
  'billing:downgrade-memberships': 'billingCronEnabled',
  'billing:timeout-orders': 'billingCronEnabled',
  'user-cleanup:users': 'userCleanupEnabled',
  'cache-monitor:performance-data': 'cacheMonitorEnabled',
};

/**
 * SDK 返回的 TaskRunListResponseDto.data 中 finishedAt/durationMs/errorSummary/triggeredBy
 * 为宽松类型（{[key: string]: unknown} | null），在此做防御性解析为页面级具体类型
 */
export function parseTaskRunList(raw: unknown): TaskRunRecord[] {
  const root = (raw ?? {}) as Record<string, unknown>;
  if (!Array.isArray(root.data)) return [];
  return root.data.map((item) => {
    const r = (item ?? {}) as Record<string, unknown>;
    return {
      id: typeof r.id === 'string' ? r.id : '',
      taskName: typeof r.taskName === 'string' ? r.taskName : '',
      status: r.status === 'FAILED' ? 'FAILED' : 'SUCCESS',
      startedAt:
        typeof r.startedAt === 'string' ? r.startedAt : new Date().toISOString(),
      finishedAt: typeof r.finishedAt === 'string' ? r.finishedAt : null,
      durationMs: toNumberOrNull(r.durationMs),
      errorSummary:
        typeof r.errorSummary === 'string' ? r.errorSummary : null,
      trigger: r.trigger === 'MANUAL' ? 'MANUAL' : 'SCHEDULED',
      triggeredBy: typeof r.triggeredBy === 'string' ? r.triggeredBy : null,
      createdAt:
        typeof r.createdAt === 'string' ? r.createdAt : new Date().toISOString(),
    };
  });
}

/**
 * SDK 返回的 TaskListResponseDto.data 为宽松类型，在此做防御性解析为 TaskInfo[]
 */
export function parseTaskList(raw: unknown): TaskInfo[] {
  const root = (raw ?? {}) as Record<string, unknown>;
  if (!Array.isArray(root.data)) return [];
  return root.data
    .map((item) => {
      const r = (item ?? {}) as Record<string, unknown>;
      return {
        taskName: typeof r.taskName === 'string' ? r.taskName : '',
        description: typeof r.description === 'string' ? r.description : '',
        schedule: typeof r.schedule === 'string' ? r.schedule : null,
        scheduleLabel:
          typeof r.scheduleLabel === 'string' ? r.scheduleLabel : null,
      };
    })
    .filter((item) => item.taskName !== '');
}

const toNumberOrNull = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * SDK 返回的 CacheMonitoringSummaryDto 为宽松类型（嵌套对象 unknown），
 * 在此做防御性解析为页面级具体类型
 */
export function parseCacheSummary(raw: unknown): CacheMonitorSummary {
  const root = (raw ?? {}) as Record<string, unknown>;
  const stats = (root.stats ?? {}) as Record<string, unknown>;
  const levels = (stats.levels ?? {}) as Record<string, unknown>;
  const summary = (stats.summary ?? {}) as Record<string, unknown>;
  const healthStatus = (root.healthStatus ?? {}) as Record<string, unknown>;
  const performanceMetrics = (root.performanceMetrics ?? {}) as Record<
    string,
    unknown
  >;

  const parseLevel = (level: unknown): Partial<CacheLevelStats> => {
    const l = (level ?? {}) as Record<string, unknown>;
    return {
      level: typeof l.level === 'string' ? l.level : '',
      size: toNumber(l.size),
      hits: toNumber(l.hits),
      misses: toNumber(l.misses),
      hitRate: toNumber(l.hitRate),
      totalRequests: toNumber(l.totalRequests),
      memoryUsage: toNumber(l.memoryUsage),
      maxCapacity: toNumber(l.maxCapacity),
      isConnected: toBoolean(l.isConnected, true),
    };
  };

  const parseHealth = (level: unknown): Partial<CacheLevelHealth> => {
    const h = (level ?? {}) as Record<string, unknown>;
    return {
      level: typeof h.level === 'string' ? h.level : '',
      status: (['healthy', 'degraded', 'unhealthy'].includes(
        String(h.status)
      )
        ? h.status
        : 'degraded') as CacheHealthStatusValue,
      lastCheckTime:
        typeof h.lastCheckTime === 'string'
          ? h.lastCheckTime
          : new Date().toISOString(),
      availability: toNumber(h.availability, 100),
      error: typeof h.error === 'string' ? h.error : undefined,
    };
  };

  const parseMetrics = (level: unknown): Partial<CachePerformanceMetrics> => {
    const m = (level ?? {}) as Record<string, unknown>;
    return {
      avgResponseTime: toNumber(m.avgResponseTime),
      p50ResponseTime: toNumber(m.p50ResponseTime),
      p95ResponseTime: toNumber(m.p95ResponseTime),
      p99ResponseTime: toNumber(m.p99ResponseTime),
      throughput: toNumber(m.throughput),
      errorRate: toNumber(m.errorRate),
    };
  };

  const overallRaw = healthStatus.overall;
  const overall: CacheHealthStatusValue = [
    'healthy',
    'degraded',
    'unhealthy',
  ].includes(String(overallRaw))
    ? (overallRaw as CacheHealthStatusValue)
    : 'degraded';

  return {
    stats: {
      levels: {
        L1: parseLevel(levels.L1),
        L2: parseLevel(levels.L2),
      },
      summary: {
        totalHits: toNumber(summary.totalHits),
        totalMisses: toNumber(summary.totalMisses),
        totalRequests: toNumber(summary.totalRequests),
        overallHitRate: toNumber(summary.overallHitRate),
        totalMemoryUsage: toNumber(summary.totalMemoryUsage),
      },
    },
    healthStatus: {
      L1: parseHealth(healthStatus.L1),
      L2: parseHealth(healthStatus.L2),
      overall,
    },
    performanceMetrics: {
      L1: parseMetrics(performanceMetrics.L1),
      L2: parseMetrics(performanceMetrics.L2),
    },
    timestamp:
      typeof root.timestamp === 'string'
        ? root.timestamp
        : new Date().toISOString(),
  };
}
