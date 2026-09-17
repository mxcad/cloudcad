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
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as http from 'http';
import * as https from 'https';
import { ProcessPoolExecutor } from '../function-executor/process-pool.executor';
import { internalServiceSecretHeader } from '../common/utils';

/**
 * 转换队列监控（#406 / ADR-0058）：
 *
 * - 按 FUNCTION_EXECUTOR 模式路由取数：
 *   - process-pool（默认）：读本进程 ProcessPoolExecutor 的 RateLimiter 统计
 *   - conversion-service：HTTP 代理远端 GET /v1/conversions/stats
 *   - cloud-faas：无队列概念，返回 null（前端显示「不适用」）
 * - 30s 定时采样写入 24h 内存环形缓冲（重启丢失，长历史走 Grafana，见 ADR-0055/0058）
 * - 单实例部署前提（backend/conversion-service 均 replicas=1），无跨实例聚合
 */

export type ConversionMode =
  'process-pool' | 'conversion-service' | 'cloud-faas';

/** process-pool 模式：进程内 RateLimiter 当前统计 */
export interface ProcessPoolCurrent {
  queueLength: number;
  criticalPriorityQueueLength: number;
  highPriorityQueueLength: number;
  lowPriorityQueueLength: number;
  runningCount: number;
  maxConcurrent: number;
  timeout: number;
  /** 最近完成任务的耗时/等待时长（有界样本，见 RateLimiter.getDurationStats） */
  duration: {
    sampleCount: number;
    p50DurationMs: number | null;
    p95DurationMs: number | null;
    p50WaitMs: number | null;
    p95WaitMs: number | null;
  };
}

/** conversion-service 模式：单级工作池统计（key 为优先级 "1"/"2"/"3"） */
export interface WorkerLevelStats {
  label: string;
  maxConcurrent: number;
  currentMax: number;
  running: number;
  waiting: number;
  autoScale: boolean;
  backlogSince: number | null;
}

/** conversion-service 模式：远端服务当前统计（GET /v1/conversions/stats 透传） */
export interface ConversionServiceCurrent {
  tasks: {
    total: number;
    pending: number;
    processing: number;
    completed: number;
    failed: number;
  };
  /** 终态任务执行耗时（有界样本，见 TaskStore.getDurationStats） */
  duration: {
    sampleCount: number;
    p50Ms: number | null;
    p95Ms: number | null;
  };
  workers: Record<string, WorkerLevelStats>;
}

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
  /** process-pool 模式当前值（其他模式为 null） */
  processPool: ProcessPoolCurrent | null;
  /** conversion-service 模式当前值（其他模式或拉取失败为 null） */
  conversionService: ConversionServiceCurrent | null;
  /** conversion-service 拉取失败原因（成功为 null） */
  conversionServiceError: string | null;
  /** 24h 历史采样（30s 间隔，旧→新；重启后为空） */
  history: ConversionSample[];
  sampledAt: number;
}

/** 永久失败负缓存条目（#465 / #477）：内容 key + 失败原因 + 标记时间 */
export interface KnownBadItem {
  contentKey: string;
  reason: string;
  /** epoch ms */
  markedAt: number;
}

/** 永久失败负缓存列表（#477 管理后台「转换任务」页数据源） */
export interface KnownBadList {
  items: KnownBadItem[];
  total: number;
}

/** 永久失败复位结果（#477） */
export interface KnownBadResetResult {
  reset: number;
  all?: boolean;
  /** 非 conversion-service 模式（无负缓存）时为 true */
  unsupported?: boolean;
}

/**
 * 转换任务明细（#478 监控 Tab 逐任务明细）：conversion-service 模式 proxy 远端
 * GET /v1/conversions/tasks（TaskRecord 子集）。process-pool 模式无独立任务存储，
 * 返回空列表（前端仅展示聚合统计）。
 */
export interface ConversionTaskItem {
  id: string;
  type?: string;
  status: string;
  progress: number;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  error?: string;
  /** 永久失败标记（#465 负缓存命中 / 确定性内容失败） */
  permanent?: boolean;
  contentKey?: string;
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
  private readonly mode: ConversionMode;
  private readonly conversionServiceUrl: string;
  private readonly useHttps: boolean;
  private readonly secretHeaders: Record<string, string>;
  private readonly history: ConversionSample[] = [];
  private samplerTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly processPoolExecutor: ProcessPoolExecutor
  ) {
    const rawMode =
      this.configService.get<string>('FUNCTION_EXECUTOR') || 'process-pool';
    this.mode =
      rawMode === 'conversion-service'
        ? 'conversion-service'
        : rawMode === 'cloud-faas'
          ? 'cloud-faas'
          : 'process-pool';
    this.conversionServiceUrl =
      this.configService.get<string>('CONVERSION_SERVICE_URL') ||
      'http://localhost:3100';
    this.useHttps = this.conversionServiceUrl.startsWith('https');
    // #419：conversion-service 非 health 路由需共享密钥，监控拉取 stats 须带 header
    this.secretHeaders = internalServiceSecretHeader(
      this.configService.get<string>('INTERNAL_SERVICE_SECRET')
    );
  }

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

    if (this.mode === 'process-pool') {
      processPool = {
        ...this.processPoolExecutor.getQueueStats(),
        duration: this.processPoolExecutor.getDurationStats(),
      };
    } else if (this.mode === 'conversion-service') {
      try {
        conversionService = await this.fetchRemoteStats();
      } catch (err: unknown) {
        conversionServiceError =
          err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `拉取 conversion-service 统计失败: ${conversionServiceError}`
        );
      }
    }

    return {
      mode: this.mode,
      processPool,
      conversionService,
      conversionServiceError,
      history: [...this.history],
      sampledAt: Date.now(),
    };
  }

  /**
   * 列出永久失败负缓存（#477）：仅 conversion-service 模式有负缓存（proxy 远端
   * GET /v1/conversions/known-bad）；process-pool / cloud-faas 模式无负缓存，返回空列表。
   */
  async listKnownBad(): Promise<KnownBadList> {
    if (this.mode !== 'conversion-service') {
      return { items: [], total: 0 };
    }
    try {
      const raw = await this.httpGet('/v1/conversions/known-bad');
      const rawItems = Array.isArray(raw.items) ? raw.items : [];
      const items: KnownBadItem[] = rawItems
        .map((it) => {
          const o = (it ?? {}) as Record<string, unknown>;
          return {
            contentKey: typeof o.contentKey === 'string' ? o.contentKey : '',
            reason: typeof o.reason === 'string' ? o.reason : '',
            markedAt:
              typeof o.markedAt === 'number'
                ? o.markedAt
                : typeof o.markedAt === 'string'
                  ? Number(o.markedAt) || 0
                  : 0,
          };
        })
        .filter((it) => it.contentKey !== '');
      return { items, total: items.length };
    } catch (err: unknown) {
      this.logger.warn(
        `拉取永久失败负缓存失败: ${err instanceof Error ? err.message : String(err)}`
      );
      return { items: [], total: 0 };
    }
  }

  /**
   * 复位永久失败负缓存（#477）：proxy 远端 POST /v1/conversions/known-bad/reset。
   * 传 contentKey 复位单条，缺省复位全部。非 conversion-service 模式返回 unsupported。
   */
  async resetKnownBad(contentKey?: string): Promise<KnownBadResetResult> {
    if (this.mode !== 'conversion-service') {
      return { reset: 0, unsupported: true };
    }
    const raw = await this.httpPost('/v1/conversions/known-bad/reset', {
      contentKey: contentKey ?? undefined,
    });
    return {
      reset: toNumber(raw.reset),
      all: raw.all === true,
    };
  }

  /**
   * 列出转换任务明细（#478 监控 Tab 逐任务明细）：仅 conversion-service 模式有
   * 独立任务存储（proxy 远端 GET /v1/conversions/tasks）；process-pool / cloud-faas
   * 模式无任务明细，返回空列表（前端仅展示聚合统计）。
   * 可选 status 过滤（pending/processing/completed/failed/cancelled）。
   */
  async listTasks(status?: string): Promise<ConversionTaskList> {
    if (this.mode !== 'conversion-service') {
      return { items: [], total: 0 };
    }
    try {
      const qs = status ? `?status=${encodeURIComponent(status)}` : '';
      const raw = await this.httpGet(`/v1/conversions/tasks${qs}`);
      const rawItems = Array.isArray(raw.tasks) ? raw.tasks : [];
      const items: ConversionTaskItem[] = rawItems
        .map((it) => {
          const o = (it ?? {}) as Record<string, unknown>;
          return {
            id: typeof o.id === 'string' ? o.id : '',
            type: typeof o.type === 'string' ? o.type : undefined,
            status: typeof o.status === 'string' ? o.status.toLowerCase() : 'unknown',
            progress: toNumber(o.progress),
            createdAt: typeof o.createdAt === 'string' ? o.createdAt : '',
            updatedAt: typeof o.updatedAt === 'string' ? o.updatedAt : '',
            startedAt:
              typeof o.startedAt === 'string' ? o.startedAt : null,
            completedAt:
              typeof o.completedAt === 'string' ? o.completedAt : null,
            error: typeof o.error === 'string' ? o.error : undefined,
            permanent: o.permanent === true ? true : undefined,
            contentKey:
              typeof o.contentKey === 'string' ? o.contentKey : undefined,
          };
        })
        .filter((it) => it.id !== '');
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

    if (this.mode === 'process-pool') {
      const stats = this.processPoolExecutor.getQueueStats();
      const duration = this.processPoolExecutor.getDurationStats();
      queueDepth = stats.queueLength;
      running = stats.runningCount;
      p95DurationMs = duration.p95DurationMs;
    } else if (this.mode === 'conversion-service') {
      const remote = await this.fetchRemoteStats();
      queueDepth = remote.tasks.pending;
      running = remote.tasks.processing;
      p95DurationMs = remote.duration.p95Ms;
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

  /** 拉取远端 conversion-service 的 /v1/conversions/stats */
  private async fetchRemoteStats(): Promise<ConversionServiceCurrent> {
    const raw = await this.httpGet('/v1/conversions/stats');
    const tasks = (raw.tasks ?? {}) as Record<string, unknown>;
    const duration = (raw.duration ?? {}) as Record<string, unknown>;
    const workersRaw = (raw.workers ?? {}) as Record<string, unknown>;
    const workers: Record<string, WorkerLevelStats> = {};
    for (const [key, value] of Object.entries(workersRaw)) {
      const w = (value ?? {}) as Record<string, unknown>;
      workers[key] = {
        label: typeof w.label === 'string' ? w.label : key,
        maxConcurrent: toNumber(w.maxConcurrent),
        currentMax: toNumber(w.currentMax),
        running: toNumber(w.running),
        waiting: toNumber(w.waiting),
        autoScale: w.autoScale === true,
        backlogSince:
          typeof w.backlogSince === 'number' ? w.backlogSince : null,
      };
    }
    return {
      tasks: {
        total: toNumber(tasks.total),
        pending: toNumber(tasks.pending),
        processing: toNumber(tasks.processing),
        completed: toNumber(tasks.completed),
        failed: toNumber(tasks.failed),
      },
      duration: {
        sampleCount: toNumber(duration.sampleCount),
        p50Ms: toNullableNumber(duration.p50Ms),
        p95Ms: toNullableNumber(duration.p95Ms),
      },
      workers,
    };
  }

  private httpGet(path: string): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.conversionServiceUrl);
      const mod = this.useHttps ? https : http;
      const req = mod.request(
        {
          hostname: url.hostname,
          port: url.port || (this.useHttps ? 443 : 80),
          path: url.pathname,
          method: 'GET',
          headers: this.secretHeaders,
          timeout: 5000,
        },
        (res) => {
          let data = '';
          res.on('data', (chunk: string) => {
            data += chunk;
          });
          res.on('end', () => {
            if (res.statusCode && res.statusCode >= 400) {
              reject(
                new Error(
                  `HTTP ${res.statusCode} for GET ${path}: ${data.substring(0, 200)}`
                )
              );
              return;
            }
            try {
              resolve(JSON.parse(data) as Record<string, unknown>);
            } catch {
              reject(new Error(`Invalid JSON response from ${path}`));
            }
          });
        }
      );
      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Request timeout: GET ${path}`));
      });
      req.end();
    });
  }

  /** POST 请求远端 conversion-service（#477 永久失败复位） */
  private httpPost(
    path: string,
    body: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.conversionServiceUrl);
      const mod = this.useHttps ? https : http;
      const payload = JSON.stringify(body);
      const req = mod.request(
        {
          hostname: url.hostname,
          port: url.port || (this.useHttps ? 443 : 80),
          path: url.pathname,
          method: 'POST',
          headers: {
            ...this.secretHeaders,
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload),
          },
          timeout: 5000,
        },
        (res) => {
          let data = '';
          res.on('data', (chunk: string) => {
            data += chunk;
          });
          res.on('end', () => {
            if (res.statusCode && res.statusCode >= 400) {
              reject(
                new Error(
                  `HTTP ${res.statusCode} for POST ${path}: ${data.substring(0, 200)}`
                )
              );
              return;
            }
            try {
              resolve(JSON.parse(data) as Record<string, unknown>);
            } catch {
              reject(new Error(`Invalid JSON response from ${path}`));
            }
          });
        }
      );
      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Request timeout: POST ${path}`));
      });
      req.write(payload);
      req.end();
    });
  }
}

function toNumber(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function toNullableNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}
