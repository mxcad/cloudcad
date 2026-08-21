const {
  PRIORITY_CONFIG,
  WORKER_POOL_AUTO_SCALE,
  WORKER_POOL_MAX_MULTIPLIER,
  WORKER_POOL_MAX_CONCURRENT,
  WORKER_POOL_BACKLOG_THRESHOLD,
  WORKER_POOL_BACKLOG_WINDOW_MS,
} = require('../lib/constants');
const { log, generateId } = require('../lib/utils');

class SemaphorePool {
  constructor(maxConcurrent) {
    this.max = maxConcurrent;
    this.current = 0;
    this.queue = [];
  }

  // 动态调整并发上限（自动扩容/回落）
  // 提升后若有多余许可（current < max），立即补发给等待者使其并发执行
  setMax(n) {
    const next = Math.max(1, Math.floor(n));
    if (next === this.max) return;
    this.max = next;
    while (this.current < this.max && this.queue.length > 0) {
      const entry = this.queue.shift();
      if (entry.timer) clearTimeout(entry.timer);
      this.current++;
      entry.resolve(true);
    }
  }

  async acquire(timeout) {
    if (this.current < this.max) {
      this.current++;
      return true;
    }
    return new Promise((resolve) => {
      const entry = { resolve };
      this.queue.push(entry);
      if (timeout) {
        entry.timer = setTimeout(() => {
          const idx = this.queue.indexOf(entry);
          if (idx !== -1) this.queue.splice(idx, 1);
          resolve(false);
        }, timeout);
      }
    });
  }

  release() {
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      if (next.timer) clearTimeout(next.timer);
      next.resolve(true);
    } else {
      this.current--;
    }
  }

  get waiting() { return this.queue.length; }
  get running() { return Math.min(this.current, this.max); }
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
  constructor(taskStore, runner, callbackEngine, options = {}) {
    this.taskStore = taskStore;
    this.runner = runner;
    this.callbackEngine = callbackEngine || null;
    this.pools = {};
    this.workers = new Map();
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

  start() {
    if (this._running) return;
    this._running = true;
    this._tick();
    log('[WorkerPool] 已启动');
  }

  stop() {
    this._running = false;
    log('[WorkerPool] 已停止');
  }

  enqueue(task) {
    this.taskStore.create(task);
    log(`[WorkerPool] 任务入队: ${task.id} (priority=${task.priority}, type=${task.type || 'convert'})`);
    setImmediate(() => this._tick());
  }

  _tick() {
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
          PRIORITY_CONFIG[levelStr].acquireTimeout || PRIORITY_CONFIG[levelStr].timeout
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
  _computeScale(level, pending, now) {
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

  async _executeTask(task, level) {
    this.taskStore.updateStatus(task.id, 'PROCESSING');
    try {
      let result;
      if (task.type === 'batch') {
        result = await this._executeBatch(task, level);
      } else {
        result = await this.runner.execute(task.params, PRIORITY_CONFIG[level].timeout);
      }
      this.taskStore.updateStatus(task.id, 'COMPLETED', { result, progress: 100 });
      this._notify(task.id, 'COMPLETED', result);
      return result;
    } catch (err) {
      this.taskStore.updateStatus(task.id, 'FAILED', { error: err.message });
      this._notify(task.id, 'FAILED', null, err.message);
    }
  }

  /**
   * 批量转换聚合任务: 逐个执行 params.tasks 中的每个文件。
   * 单个文件失败不阻断整体，结果汇总到 result.results。
   * 仅当整个批次无法执行（如 tasks 为空）时整体 FAILED。
   */
  async _executeBatch(task, level) {
    const items = task.params && Array.isArray(task.params.tasks) ? task.params.tasks : [];
    if (items.length === 0) throw new Error('批量任务没有可转换的文件');
    const timeout = PRIORITY_CONFIG[level].timeout;
    const results = [];
    let done = 0;
    for (const item of items) {
      try {
        const r = await this.runner.execute(item, timeout);
        const entry = { id: item.id, success: true };
        const outputPath = (r && r.newpath) || item.outname;
        if (outputPath) entry.outputPath = outputPath;
        results.push(entry);
      } catch (err) {
        results.push({ id: item.id, success: false, error: err.message });
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
  _notify(taskId, status, result, error) {
    if (!this.callbackEngine) return;
    const task = this.taskStore.get(taskId);
    if (!task || !task.callbackUrl) return;
    try {
      this.callbackEngine.notify(taskId, { status, result, error }).catch((err) => {
        log(`[WorkerPool] 回调失败: ${taskId} - ${err.message}`);
      });
    } catch (err) {
      log(`[WorkerPool] 回调异常: ${taskId} - ${err.message}`);
    }
  }

  getStats() {
    const stats = {};
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

module.exports = WorkerPool;
