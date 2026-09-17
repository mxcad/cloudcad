import {
  PRIORITY_CONFIG,
  WORKER_POOL_AUTO_SCALE,
  WORKER_POOL_MAX_MULTIPLIER,
  WORKER_POOL_MAX_CONCURRENT,
  WORKER_POOL_BACKLOG_THRESHOLD,
  WORKER_POOL_BACKLOG_WINDOW_MS,
} from '../lib/constants';
import { log, generateId, deriveContentKey } from '../lib/utils';
import type TaskStore from './task-store';
import type { TaskRecord, TaskInput } from './task-store';

// 永久失败负缓存契约（#465，未接线时为 null / no-op）
// get：批量子任务 fail-fast 用（命中 known-bad 不 spawn）
export interface NegativeCacheLike {
  markBad(contentKey: string, reason: string): void;
  get(contentKey: string): { contentKey: string; reason: string; markedAt: string } | null;
  isBad(contentKey: string): boolean;
}

interface WorkerPoolOptions {
  autoScale?: boolean;
  backlogThreshold?: number;
  backlogWindowMs?: number;
  maxMultiplier?: number;
  maxConcurrent?: number;
  negativeCache?: NegativeCacheLike | null;
}

export interface NegativeCacheLike {
  isBad(contentKey: string | null | undefined): boolean;
  markBad(contentKey: string, reason: string): void;
  get(contentKey: string): { contentKey: string; reason: string; markedAt: string } | null;
}

// runner 契约：execute(params, timeout) 返回转换结果（含 newpath 等）。
// onChild 可选：子进程拉起时回调 kill 句柄（杀 mxcadassembly 进程组），供取消机制使用。
export interface RunnerLike {
  execute(params: any, timeout?: number, onChild?: (kill: () => void) => void): any;
}

// 回调引擎契约（callbackEngine 未接线时为 null / no-op）
export interface CallbackEngineLike {
  notify(taskId: string, result: { status: string; result: unknown; error?: unknown }): Promise<void>;
}

interface ScaleState {
  baseline: number;
  currentMax: number;
  backlogSince: number | null;
}

export interface LevelStats {
  label: string;
  maxConcurrent: number;
  currentMax: number;
  running: number;
  waiting: number;
  autoScale: boolean;
  backlogSince: number | null;
}

export type WorkerStats = Record<number, LevelStats>;

interface QueueEntry {
  resolve: (value: boolean) => void;
  timer?: ReturnType<typeof setTimeout>;
  // 任务 id（#431 取消机制）：取消排队中任务时按 id 出队并清掉 acquire 超时计时器
  taskId?: string;
}

class SemaphorePool {
  max: number;
  current: number;
  queue: QueueEntry[];

  constructor(maxConcurrent: number) {
    this.max = maxConcurrent;
    this.current = 0;
    this.queue = [];
  }

  // 动态调整并发上限（自动扩容/回落）
  // 提升后若有多余许可（current < max），立即补发给等待者使其并发执行
  setMax(n: number): void {
    const next = Math.max(1, Math.floor(n));
    if (next === this.max) return;
    this.max = next;
    while (this.current < this.max && this.queue.length > 0) {
      const entry = this.queue.shift()!;
      if (entry.timer) clearTimeout(entry.timer);
      this.current++;
      entry.resolve(true);
    }
  }

  async acquire(timeout?: number, taskId?: string): Promise<boolean> {
    if (this.current < this.max) {
      this.current++;
      return true;
    }
    return new Promise((resolve) => {
      const entry: QueueEntry = { resolve, taskId };
      this.queue.push(entry);
      if (timeout) {
        entry.timer = setTimeout(() => {
          this._removeEntry(entry);
          resolve(false);
        }, timeout);
      }
    });
  }

  // 按任务 id 出队（#431 取消机制）：清掉 acquire 超时计时器并 resolve(false)。
  // 返回是否找到并移除（未找到说明任务已不在等待队列，如已被 release 补发）。
  remove(taskId: string): boolean {
    const idx = this.queue.findIndex((e) => e.taskId === taskId);
    if (idx === -1) return false;
    const entry = this.queue[idx];
    this.queue.splice(idx, 1);
    if (entry.timer) clearTimeout(entry.timer);
    entry.resolve(false);
    return true;
  }

  // 出队单个 entry（清计时器），供超时回调与 remove 复用
  _removeEntry(entry: QueueEntry): void {
    const idx = this.queue.indexOf(entry);
    if (idx !== -1) this.queue.splice(idx, 1);
    if (entry.timer) clearTimeout(entry.timer);
  }

  release(): void {
    if (this.queue.length > 0) {
      const next = this.queue.shift()!;
      if (next.timer) clearTimeout(next.timer);
      next.resolve(true);
    } else {
      this.current--;
    }
  }

  get waiting(): number { return this.queue.length; }
  get running(): number { return Math.min(this.current, this.max); }
}

/**
 * 多级优先级工作池
 * 每级独立 SemaphorePool，按优先级从高到低执行。
 *
 * 自动扩容: 某级 PENDING 数持续超过阈值（baseline * backlogThreshold）
 * 超过时间窗口后，将该级 SemaphorePool 的 max 翻倍（不超过全局上限），
 * 积压回落到基准容量内后再逐步回落到 baseline。
 */
class WorkerPool {
  taskStore: TaskStore;
  runner: RunnerLike;
  callbackEngine: CallbackEngineLike | null;
  negativeCache: NegativeCacheLike | null;
  pools: Record<string, SemaphorePool>;
  workers: Map<string, unknown>;
  // 运行中任务的取消句柄（#431 取消机制）：taskId → 杀 mxcadassembly 进程组的函数
  cancelHandles: Map<string, () => void>;
  autoScale: boolean;
  backlogThreshold: number;
  backlogWindowMs: number;
  maxMultiplier: number;
  maxConcurrentCap: number;
  scaleState: Record<string, ScaleState>;
  _queued: Set<string>;
  _running: boolean;

  constructor(taskStore: TaskStore, runner: RunnerLike, callbackEngine: CallbackEngineLike | null = null, options: WorkerPoolOptions = {}, negativeCache?: NegativeCacheLike | null) {
    this.taskStore = taskStore;
    this.runner = runner;
    this.callbackEngine = callbackEngine || null;
    this.negativeCache = negativeCache !== undefined ? negativeCache : (options.negativeCache ?? null);
    this.pools = {};
    this.workers = new Map();
    this.cancelHandles = new Map();
    this.autoScale = options.autoScale !== undefined ? options.autoScale : WORKER_POOL_AUTO_SCALE;
    this.backlogThreshold = options.backlogThreshold || WORKER_POOL_BACKLOG_THRESHOLD;
    this.backlogWindowMs = options.backlogWindowMs || WORKER_POOL_BACKLOG_WINDOW_MS;
    this.maxMultiplier = options.maxMultiplier || WORKER_POOL_MAX_MULTIPLIER;
    this.maxConcurrentCap = options.maxConcurrent || WORKER_POOL_MAX_CONCURRENT;
    this.scaleState = {};
    this._queued = new Set();
    for (const [level, cfg] of Object.entries(PRIORITY_CONFIG)) {
      this.pools[level] = new SemaphorePool(cfg.maxConcurrent);
      this.scaleState[level] = {
        baseline: cfg.maxConcurrent,
        currentMax: cfg.maxConcurrent,
        backlogSince: null,
      };
    }
    this._running = false;
  }

  start(): void {
    if (this._running) return;
    this._running = true;
    this._tick();
    log('[WorkerPool] 已启动');
  }

  stop(): void {
    this._running = false;
    // 优雅退出（#431 取消机制同源）：清空各优先级 acquire 队列的悬空计时器 + 运行中任务取消句柄。
    // 否则排队任务的 acquireTimeout 计时器（最长 40s）悬空，阻碍进程干净退出。
    for (const pool of Object.values(this.pools)) {
      for (const entry of pool.queue) {
        if (entry.timer) clearTimeout(entry.timer);
        entry.resolve(false);
      }
      pool.queue.length = 0;
    }
    this.cancelHandles.clear();
    this._queued.clear();
    log('[WorkerPool] 已停止');
  }

  /**
   * 取消任务（#431 取消机制）。
   * - store.cancel 置 CANCELLED（PENDING 任务不再被 _tick 拾取；PROCESSING 任务由杀进程组终止）
   * - 运行中任务：触发其取消句柄杀 mxcadassembly 进程组（子进程未拉起时 _onChild 会立即杀）
   * - 已终态 / 不存在：store.cancel 返回原因，本方法透传（killed=false）
   * @returns killed: 是否触发了进程组终止（运行中任务为 true）
   */
  cancel(taskId: string): { ok: boolean; status?: string; reason?: string; killed: boolean } {
    const task = this.taskStore.get(taskId);
    if (!task) return { ok: false, reason: 'not_found', killed: false };
    const wasProcessing = task.status === 'PROCESSING';
    const result = this.taskStore.cancel(taskId);
    if (!result.ok) {
      return { ok: false, status: result.status || undefined, reason: result.reason, killed: false };
    }
    let killed = false;
    if (wasProcessing) {
      // 运行中：杀 mxcadassembly 进程组（子进程未拉起时 _onChild 会立即杀）
      const handle = this.cancelHandles.get(taskId);
      if (handle) {
        handle();
        killed = true;
      }
    } else if (task.priority !== undefined) {
      // 排队中：从 acquire 队列出队，清掉 acquire 超时计时器（否则计时器悬空阻碍进程优雅退出）
      const pool = this.pools[String(task.priority)];
      if (pool) pool.remove(taskId);
    }
    this._queued.delete(taskId);
    log(`[WorkerPool] 任务取消: ${taskId}${killed ? '（已杀进程组）' : '（排队中出队）'}`);
    return { ok: true, status: 'CANCELLED', killed };
  }

  /**
   * 排队位置（S6-5）：任务在其优先级池 acquire 队列中的 1-based 序号。
   * 仅「排队中」任务有意义（PENDING 且已被 acquire 入队）；运行中（池有空位直接执行，
   * 不入队）/ 未入队 / 终态返回 null。供 GET /tasks/:taskId 透传 → backend listTasks
   * → 前端面板对 pending 任务展示「第 N 位」。
   */
  getQueuePosition(taskId: string): number | null {
    const task = this.taskStore.get(taskId);
    if (!task || task.status !== 'PENDING' || task.priority === undefined) return null;
    const pool = this.pools[String(task.priority)];
    if (!pool) return null;
    const idx = pool.queue.findIndex((e) => e.taskId === taskId);
    return idx === -1 ? null : idx + 1;
  }

  enqueue(task: TaskInput): void {
    this.taskStore.create(task);
    log(`[WorkerPool] 任务入队: ${task.id} (priority=${task.priority}, type=${task.type || 'convert'})`);
    setImmediate(() => this._tick());
  }

  _tick(): void {
    if (!this._running) return;
    const now = Date.now();
    const allPending = this.taskStore.list({ status: 'PENDING' });
    for (let level = 1; level <= 3; level++) {
      const levelStr = String(level);
      const pool = this.pools[levelStr];
      const pending = allPending.filter((t) => t.priority === level);

      if (this.autoScale) {
        const nextMax = this._computeScale(levelStr, pending.length, now);
        if (nextMax !== pool.max) {
          pool.setMax(nextMax);
          log(`[WorkerPool] level=${levelStr} 并发上限 ${pool.max} → ${nextMax} (pending=${pending.length})`);
        }
      }

      // 每个 PENDING 任务只 acquire 一次（_queued 去重）:
      // 池有空位则立即执行，否则进入信号量等待队列。
      for (const task of pending) {
        if (this._queued.has(task.id)) continue;
        this._queued.add(task.id);
        pool.acquire(
          PRIORITY_CONFIG[levelStr].acquireTimeout || PRIORITY_CONFIG[levelStr].timeout,
          task.id
        ).then((acquired) => {
          if (!acquired) {
            this._queued.delete(task.id);
            return;
          }
          this._executeTask(task, levelStr).finally(() => {
            pool.release();
            this._queued.delete(task.id);
          });
        });
      }
    }
    if (allPending.length > 0) {
      setTimeout(() => this._tick(), 100);
    }
  }

  /**
   * 按积压调整某级并发上限。返回该级应该生效的 max。
   * - PENDING > baseline*threshold 且持续超过窗口: currentMax *= 2（受 cap 限制）
   * - PENDING <= baseline: 逐步回落，每次降 1 直到 baseline
   */
  _computeScale(level: string, pending: number, now: number): number {
    const st = this.scaleState[level];
    const threshold = st.baseline * this.backlogThreshold;
    const cap = Math.min(st.baseline * this.maxMultiplier, this.maxConcurrentCap);

    if (pending > threshold) {
      if (st.backlogSince === null) st.backlogSince = now;
      if (now - st.backlogSince >= this.backlogWindowMs && st.currentMax < cap) {
        const next = Math.min(cap, st.currentMax * 2);
        st.currentMax = next;
        st.backlogSince = now;
        return next;
      }
      return st.currentMax;
    }

    st.backlogSince = null;
    if (pending <= st.baseline && st.currentMax > st.baseline) {
      const next = Math.max(st.baseline, st.currentMax - 1);
      st.currentMax = next;
      return next;
    }
    return st.currentMax;
  }

  /**
   * 子进程拉起时注册取消句柄；若任务在子进程拉起前已被取消，立即杀进程组。
   */
  _onChild(taskId: string): (kill: () => void) => void {
    return (kill: () => void) => {
      this.cancelHandles.set(taskId, kill);
      const t = this.taskStore.get(taskId);
      if (t && t.status === 'CANCELLED') kill();
    };
  }

  async _executeTask(task: TaskRecord, level: string): Promise<unknown> {
    this.taskStore.updateStatus(task.id, 'PROCESSING');
    const onChild = this._onChild(task.id);
    try {
      let result: unknown;
      if (task.type === 'batch') {
        result = await this._executeBatch(task, level, onChild);
      } else {
        result = await this.runner.execute(task.params, PRIORITY_CONFIG[level].timeout, onChild);
      }
      // 取消守卫：执行期间任务被取消（store 已是 CANCELLED 终态）→ 不覆盖、不发回调
      const current = this.taskStore.get(task.id);
      if (current && current.status === 'CANCELLED') return;
      this.taskStore.updateStatus(task.id, 'COMPLETED', { result, progress: 100 });
      this._notify(task.id, 'COMPLETED', result);
      return result;
    } catch (err) {
      const current = this.taskStore.get(task.id);
      if (current && current.status === 'CANCELLED') return;
      this.taskStore.updateStatus(task.id, 'FAILED', { error: (err as Error).message });
      this._notify(task.id, 'FAILED', null, (err as Error).message);
      // 永久失败负缓存（#465）：仅「确定性内容失败」(deterministic=true) 且任务带 contentKey
      // 才标记 known-bad；超时/进程被杀 (deterministic=false) 不标记，可重试。
      const deterministic = (err as { deterministic?: boolean }).deterministic === true;
      if (this.negativeCache && deterministic && task.contentKey) {
        this.negativeCache.markBad(task.contentKey, (err as Error).message);
      }
    } finally {
      this.cancelHandles.delete(task.id);
    }
  }

  /**
   * 批量转换聚合任务: 逐个执行 params.tasks 中的每个文件。
   * 单个文件失败不阻断整体，结果汇总到 result.results。
   * 仅当整个批次无法执行（如 tasks 为空）时整体 FAILED。
   */
  async _executeBatch(task: TaskRecord, level: string, onChild: (kill: () => void) => void): Promise<{ results: unknown[] }> {
    const items: any[] = task.params && Array.isArray(task.params.tasks) ? task.params.tasks : [];
    if (items.length === 0) throw new Error('批量任务没有可转换的文件');
    const timeout = PRIORITY_CONFIG[level].timeout;
    const results: unknown[] = [];
    let done = 0;
    for (const item of items) {
      // 取消守卫：批量执行中任务被取消 → 停止后续文件，返回已完成部分
      if (this.taskStore.get(task.id)?.status === 'CANCELLED') break;
      // 永久失败负缓存（S1-4）：子任务派生 contentKey，命中 known-bad → fail-fast 不 spawn mxcadassembly
      const contentKey = deriveContentKey(item);
      const knownBad = contentKey && this.negativeCache ? this.negativeCache.get(contentKey) : null;
      if (knownBad) {
        results.push({
          id: item.id,
          success: false,
          permanent: true,
          error: `永久失败（内容不可转换）：${knownBad.reason}`,
        });
      } else {
        try {
          const r = await this.runner.execute(item, timeout, onChild);
          const entry: Record<string, unknown> = { id: item.id, success: true };
          const outputPath = (r && r.newpath) || item.outname;
          if (outputPath) entry.outputPath = outputPath;
          results.push(entry);
        } catch (err) {
          const entry: Record<string, unknown> = { id: item.id, success: false, error: (err as Error).message };
          // 确定性内容失败 → 标记 known-bad 供后续 fail-fast；瞬时失败（超时/进程被杀）不标记（可重试）
          const deterministic = (err as { deterministic?: boolean }).deterministic === true;
          if (contentKey && this.negativeCache && deterministic) {
            this.negativeCache.markBad(contentKey, (err as Error).message);
            entry.permanent = true;
          }
          results.push(entry);
        }
      }
      done += 1;
      this.taskStore.updateStatus(task.id, 'PROCESSING', {
        progress: Math.round((done / items.length) * 100),
      });
    }
    return { results };
  }

  /**
   * 终态最佳努力回调（callbackEngine 未接线时为 no-op）
   */
  _notify(taskId: string, status: string, result: unknown, error?: string): void {
    if (!this.callbackEngine) return;
    const task = this.taskStore.get(taskId);
    if (!task || !task.callbackUrl) return;
    try {
      this.callbackEngine.notify(taskId, { status, result, error }).catch((err) => {
        log(`[WorkerPool] 回调失败: ${taskId} - ${(err as Error).message}`);
      });
    } catch (err) {
      log(`[WorkerPool] 回调异常: ${taskId} - ${(err as Error).message}`);
    }
  }

  getStats(): WorkerStats {
    const stats: WorkerStats = {};
    for (let level = 1; level <= 3; level++) {
      const levelStr = String(level);
      const pool = this.pools[levelStr];
      const cfg = PRIORITY_CONFIG[level];
      const st = this.scaleState[levelStr];
      stats[level] = {
        label: cfg.label,
        maxConcurrent: cfg.maxConcurrent,
        currentMax: pool.max,
        running: pool.running,
        waiting: pool.waiting,
        autoScale: this.autoScale,
        backlogSince: st.backlogSince,
      };
    }
    return stats;
  }
}

export default WorkerPool;
