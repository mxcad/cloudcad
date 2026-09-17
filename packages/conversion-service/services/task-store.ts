import { log } from '../lib/utils';
import RedisClient, { RedisError } from '../lib/redis-client';

const TASKS_HASH_KEY = 'fworkflow:tasks';
const DEFAULT_REDIS_URL = 'redis://127.0.0.1:6379/0';
// 终态任务保留上限：超出后按入队顺序淘汰最旧的终态记录（内存 + Redis 同步删除），
// 防止任务记录随进程生命周期无限增长；同时该有界集合即耗时统计的样本窗口
const MAX_TERMINAL_RETAIN = 500;

export type TaskStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

// 任务记录（内存 Map 中存储、Redis Hash 中序列化的完整形态）
export interface TaskRecord {
  id: string;
  priority?: number;
  type?: string;
  params?: Record<string, unknown>;
  status: TaskStatus;
  progress: number;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  result: unknown;
  error: unknown;
  callbackUrl: string | null;
  // 内容身份（content_hash + 源文件 + 目标格式派生，见 utils.deriveContentKey）。
  // 同 key 的在途任务合并去重（#431 门禁3）。
  contentKey?: string | null;
  // 永久失败（#465 负缓存命中 / 确定性内容失败）：标记后该任务终态为 FAILED，
  // 且重试注定再失败（内容不可转换）。供 GET /tasks/:taskId 透传 → backend listTasks
  // → 前端面板展示「永久失败」（区别于普通「转换失败」，提示重试无意义）。
  permanent?: boolean;
  // 允许入队时透传的额外字段（如 task.params 之外的自定义字段）
  [key: string]: unknown;
}

// 入队任务（create 的入参，字段可缺失，create 会补全默认值）
export interface TaskInput {
  id: string;
  priority?: number;
  type?: string;
  params?: Record<string, unknown>;
  callbackUrl?: string | null;
  createdAt?: string;
  contentKey?: string | null;
  [key: string]: unknown;
}

export interface TaskFilter {
  status?: TaskStatus | string;
}

export interface DurationStats {
  sampleCount: number;
  p50Ms: number | null;
  p95Ms: number | null;
}

export interface TaskStats {
  total: number;
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  cancelled: number;
}

interface TaskStoreOptions {
  redisUrl?: string;
  commandTimeoutMs?: number;
  connectTimeoutMs?: number;
}

/**
 * 任务状态存储
 * 支持 in-memory（local）和 Redis（standalone）两种模式
 *
 * Redis 模式: 内存缓存为唯一读来源（保持现有同步 API 签名不变），
 * 所有写操作同步更新缓存后 fire-and-forget 持久化到 Redis Hash
 * （fworkflow:tasks -> { taskId: taskJSON }）。
 * 启动时 init() 从 Redis 全量加载存量任务，重启不丢。
 * Redis 不可用时自动回退到内存模式，保证服务可启动。
 */
class TaskStore {
  driver: string;
  options: TaskStoreOptions;
  tasks: Map<string, TaskRecord>;
  _redis: RedisClient | null;
  _fallback: boolean;
  _persistQueue: Promise<unknown>;

  constructor(driver = 'local', options: TaskStoreOptions = {}) {
    this.driver = driver;
    this.options = options;
    this.tasks = new Map();
    this._redis = null;
    this._fallback = false;
    this._persistQueue = Promise.resolve();
    log(`[TaskStore] 初始化, driver=${driver}`);
  }

  // Redis 模式异步初始化: 连接 + 加载存量任务。失败时回退内存模式。
  async init(): Promise<TaskStore> {
    if (this.driver !== 'redis') return this;
    const url = this.options.redisUrl || DEFAULT_REDIS_URL;
    try {
      const client = new RedisClient(url, {
        commandTimeoutMs: this.options.commandTimeoutMs,
      });
      await client.connect(this.options.connectTimeoutMs || 3000);
      const all = await client.command(['HGETALL', TASKS_HASH_KEY]);
      const arr = (Array.isArray(all) ? all : []) as any[];
      for (let i = 0; i < arr.length; i += 2) {
        try {
          this.tasks.set(arr[i].toString(), JSON.parse(arr[i + 1].toString()) as TaskRecord);
        } catch (err) {
          log(`[TaskStore] 跳过损坏的任务记录: ${arr[i]} - ${(err as Error).message}`);
        }
      }
      this._redis = client;
      log(`[TaskStore] Redis 就绪 (${url}), 已加载 ${this.tasks.size} 个存量任务`);
    } catch (err) {
      this._redis = null;
      this._fallback = true;
      log(`[TaskStore] Redis 不可用 (${(err as Error).message}), 回退到内存模式`);
    }
    return this;
  }

  isRedis(): boolean {
    return this.driver === 'redis' && !this._fallback;
  }

  isFallback(): boolean {
    return this.driver === 'redis' && this._fallback;
  }

  getDriver(): string {
    return this.driver;
  }

  create(task: TaskInput): TaskRecord {
    const record: TaskRecord = {
      ...task,
      status: 'PENDING',
      progress: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
      result: null,
      error: null,
      callbackUrl: task.callbackUrl || null,
    };
    this.tasks.set(task.id, record);
    this._persist(task.id, record);
    return record;
  }

  get(taskId: string): TaskRecord | null {
    return this.tasks.get(taskId) || null;
  }

  /**
   * 查找同内容身份的在途任务（PENDING/PROCESSING）。
   * 用于同 key 合并去重：第二个提交者挂到已有在途任务，不重复起 mxcadassembly。
   * 终态（COMPLETED/FAILED）任务不参与合并——失败可重试、成功由 backend 已转缓存兜底。
   */
  findInFlightByContentKey(contentKey: string): TaskRecord | null {
    for (const t of this.tasks.values()) {
      if (t.contentKey === contentKey && (t.status === 'PENDING' || t.status === 'PROCESSING')) {
        return t;
      }
    }
    return null;
  }

  /**
   * 崩溃恢复（#431 门禁4）：重启后把残留的 PROCESSING 任务重置为 PENDING，
   * 由 worker 重新调度。转换幂等（content_hash 派生身份，产物路径判据），重跑安全。
   * 清 startedAt 使重跑重新计时（耗时统计反映本次执行）。
   * @returns 被重置的任务数
   */
  recoverStuckProcessing(): number {
    let reset = 0;
    for (const t of this.tasks.values()) {
      if (t.status === 'PROCESSING') {
        t.status = 'PENDING';
        t.startedAt = null;
        t.updatedAt = new Date().toISOString();
        this._persist(t.id, t);
        reset++;
      }
    }
    if (reset > 0) log(`[TaskStore] 崩溃恢复: ${reset} 个残留 PROCESSING 任务重置为 PENDING`);
    return reset;
  }

  /**
   * 取消任务（#431 取消机制）。
   * - PENDING / PROCESSING → CANCELLED（记 completedAt，作为有界终态纳入淘汰）
   * - 已终态（COMPLETED/FAILED/CANCELLED）→ 不可取消，返回当前状态
   * - 不存在 → not_found
   *
   * 注意：本方法只改状态。PROCESSING 任务的进程组终止由 worker pool 的 cancel()
   * 触发（杀 mxcadassembly 进程组），杀进程后 runner.execute 结算，worker 见 CANCELLED
   * 不再覆盖为 COMPLETED/FAILED（见 worker-pool._executeTask 的取消守卫）。
   */
  cancel(taskId: string): { ok: boolean; status: TaskStatus | null; reason?: string } {
    const record = this.tasks.get(taskId);
    if (!record) return { ok: false, status: null, reason: 'not_found' };
    if (record.status !== 'PENDING' && record.status !== 'PROCESSING') {
      return { ok: false, status: record.status, reason: 'terminal' };
    }
    record.status = 'CANCELLED';
    record.updatedAt = new Date().toISOString();
    if (!record.completedAt) record.completedAt = record.updatedAt;
    this._persist(taskId, record);
    log(`[TaskStore] 任务已取消: ${taskId}`);
    return { ok: true, status: 'CANCELLED' };
  }

  updateStatus(taskId: string, status: TaskStatus, extra: Partial<TaskRecord> = {}): TaskRecord | null {
    const record = this.tasks.get(taskId);
    if (!record) return null;
    // 终态不可逆：已 COMPLETED/FAILED/CANCELLED 的任务拒绝被后续 updateStatus 覆盖
    //（防止已取消任务被迟到的 runner 结算覆盖为 COMPLETED/FAILED，见 #431 取消机制）
    if (
      record.status === 'COMPLETED' || record.status === 'FAILED' || record.status === 'CANCELLED'
    ) {
      return record;
    }
    record.status = status;
    record.updatedAt = new Date().toISOString();
    const now = new Date().toISOString();
    // 首次进入 PROCESSING 记开始时间；进入终态记完成时间（各只记一次）
    if (status === 'PROCESSING' && !record.startedAt) record.startedAt = now;
    if ((status === 'COMPLETED' || status === 'FAILED') && !record.completedAt) {
      record.completedAt = now;
      this._evictTerminal();
    }
    if (extra.result) record.result = extra.result;
    if (extra.error) record.error = extra.error;
    if (extra.progress !== undefined) record.progress = extra.progress;
    if (extra.permanent !== undefined) record.permanent = extra.permanent;
    this._persist(taskId, record);
    return record;
  }

  list(filter: TaskFilter = {}): TaskRecord[] {
    const results: TaskRecord[] = [];
    for (const task of this.tasks.values()) {
      if (filter.status && task.status !== filter.status) continue;
      results.push(task);
    }
    return results;
  }

  delete(taskId: string): boolean {
    const existed = this.tasks.delete(taskId);
    if (existed && this.isRedis()) this._persistDelete(taskId);
    return existed;
  }

  getStats(): TaskStats {
    let pending = 0, processing = 0, completed = 0, failed = 0, cancelled = 0;
    for (const t of this.tasks.values()) {
      if (t.status === 'PENDING') pending++;
      else if (t.status === 'PROCESSING') processing++;
      else if (t.status === 'COMPLETED') completed++;
      else if (t.status === 'FAILED') failed++;
      else if (t.status === 'CANCELLED') cancelled++;
    }
    return { total: this.tasks.size, pending, processing, completed, failed, cancelled };
  }

  /**
   * 终态任务耗时统计（P50/P95，单位 ms）。
   * 样本 = 当前保留的终态任务（有界，见 MAX_TERMINAL_RETAIN），
   * 耗时 = completedAt - startedAt（执行耗时，不含排队等待）。
   */
  getDurationStats(): DurationStats {
    const durations: number[] = [];
    for (const t of this.tasks.values()) {
      if (t.status !== 'COMPLETED' && t.status !== 'FAILED') continue;
      if (!t.startedAt || !t.completedAt) continue;
      const d = new Date(t.completedAt).getTime() - new Date(t.startedAt).getTime();
      if (Number.isFinite(d) && d >= 0) durations.push(d);
    }
    durations.sort((a, b) => a - b);
    return {
      sampleCount: durations.length,
      p50Ms: percentile(durations, 50),
      p95Ms: percentile(durations, 95),
    };
  }

  // 终态记录（COMPLETED/FAILED/CANCELLED）超过上限时按入队顺序（Map 迭代序）淘汰最旧的，
  // Redis 模式同步 HDEL
  _evictTerminal(): void {
    const isTerminal = (s: TaskStatus) => s === 'COMPLETED' || s === 'FAILED' || s === 'CANCELLED';
    let terminalCount = 0;
    for (const t of this.tasks.values()) {
      if (isTerminal(t.status)) terminalCount++;
    }
    let excess = terminalCount - MAX_TERMINAL_RETAIN;
    if (excess <= 0) return;
    for (const id of [...this.tasks.keys()]) {
      if (excess <= 0) break;
      const t = this.tasks.get(id);
      if (t && isTerminal(t.status)) {
        this.delete(id);
        excess--;
      }
    }
  }

  // 串行化写操作，保证同一 taskId 的多次更新按序持久化
  _persist(taskId: string, record: TaskRecord): void {
    if (!this.isRedis()) return;
    this._persistQueue = this._persistQueue
      .then(() => this._redis!.command(['HSET', TASKS_HASH_KEY, taskId, JSON.stringify(record)]))
      .catch((err) => log(`[TaskStore] Redis 持久化失败 ${taskId}: ${(err as Error).message}`));
  }

  _persistDelete(taskId: string): void {
    this._persistQueue = this._persistQueue
      .then(() => this._redis!.command(['HDEL', TASKS_HASH_KEY, taskId]))
      .catch((err) => log(`[TaskStore] Redis 删除失败 ${taskId}: ${(err as Error).message}`));
  }

  // 等待所有排队中的持久化完成（优雅关闭时调用）
  async flush(): Promise<void> {
    await this._persistQueue;
  }

  // 释放 Redis 连接
  close(): void {
    if (this._redis) {
      this._redis.close();
      this._redis = null;
    }
  }
}

// 最近邻百分位：arr 须已升序；空数组返回 null
function percentile(sortedArr: number[], p: number): number | null {
  if (sortedArr.length === 0) return null;
  const idx = Math.min(
    sortedArr.length - 1,
    Math.floor((p / 100) * (sortedArr.length - 1))
  );
  return sortedArr[idx];
}

export default TaskStore;
