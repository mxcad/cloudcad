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
 * backgroundTasks / conversionQueue / alertHistory 为预留位，
 * 分别由后续 #211 / 转换队列 / #209（#248 派发）实现。
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

const toNumberOrNull = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * SDK 返回的 CacheMonitoringSummaryDto 为宽松类型（嵌套对象 unknown），
 * 在此做防御性解析为页面级具体类型（与 QueueStatsCard 模式一致）
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
