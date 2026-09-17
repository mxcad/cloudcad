import { Injectable, Logger } from '@nestjs/common';

export type TaskPriority = 'critical' | 'high' | 'low';

interface TaskState {
  id: string;
  /** 开始信号：processNext 拿到槽位时 resolve，execute 等待它再调用 task() */
  startResolve: () => void;
  startPromise: Promise<void>;
  /** 结算 execute() 返回的 promise：任务结果 / 超时 / 队列清空。promise 只结算一次 */
  settle: (result: unknown) => void;
  settleError: (error: Error) => void;
  queuedAt: number;
  startedAt?: number;
  finishedAt?: number;
  timedOut?: boolean;
  priority: TaskPriority;
  /** 执行超时定时器句柄：任务真正结束时（execute finally）清除 */
  timeoutTimer?: ReturnType<typeof setTimeout>;
}

/** 最近完成任务的耗时/等待时长样本（有界环形，超出上限丢弃最旧） */
interface CompletionSample {
  durationMs: number;
  waitMs: number;
}

const MAX_RECENT_COMPLETIONS = 500;

/** 最近邻百分位：arr 须已升序；空数组返回 null */
function percentile(sortedArr: number[], p: number): number | null {
  if (sortedArr.length === 0) return null;
  const idx = Math.min(
    sortedArr.length - 1,
    Math.floor((p / 100) * (sortedArr.length - 1))
  );
  return sortedArr[idx];
}

@Injectable()
export class RateLimiter {
  private readonly logger = new Logger(RateLimiter.name);
  private readonly maxConcurrent: number;
  private readonly timeout: number;
  private readonly criticalPriorityQueue: TaskState[] = [];
  private readonly highPriorityQueue: TaskState[] = [];
  private readonly lowPriorityQueue: TaskState[] = [];
  private readonly running: Map<string, TaskState> = new Map();
  private readonly recentCompletions: CompletionSample[] = [];
  private nextTaskId = 0;

  constructor(maxConcurrent: number, timeoutMs: number = 600000) {
    this.maxConcurrent = maxConcurrent;
    this.timeout = timeoutMs;
    this.logger.log(
      `限流器初始化: 最大并发数=${this.maxConcurrent}, 超时=${this.timeout}ms`
    );
  }

  execute<T>(task: () => Promise<T>, priority: TaskPriority = 'high'): Promise<T> {
    const taskId = `task_${this.nextTaskId++}`;

    // 开始信号：processNext 拿到槽位时 resolve，execute 等待它再调用 task()
    let startResolve!: () => void;
    const startPromise = new Promise<void>((resolve) => {
      startResolve = resolve;
    });

    // 结果 promise：execute() 的返回值。由任务结果 / 超时 / clearQueue 结算（只结算一次）
    let resolveResult!: (value: T | PromiseLike<T>) => void;
    let rejectResult!: (error: Error) => void;
    const resultPromise = new Promise<T>((resolve, reject) => {
      resolveResult = resolve;
      rejectResult = reject;
    });

    const taskState: TaskState = {
      id: taskId,
      startResolve,
      startPromise,
      settle: (value: unknown) => resolveResult(value as T),
      settleError: (error: Error) => rejectResult(error),
      queuedAt: Date.now(),
      priority,
    };

    const queue =
      priority === 'critical'
        ? this.criticalPriorityQueue
        : priority === 'high'
          ? this.highPriorityQueue
          : this.lowPriorityQueue;
    queue.push(taskState);
    this.logger.debug(
      `任务加入队列: ${taskId} (${priority}), 紧急队列=${this.criticalPriorityQueue.length}, 高优队列=${this.highPriorityQueue.length}, 低优队列=${this.lowPriorityQueue.length}, 运行中=${this.running.size}`
    );

    this.processNext();

    // 拿到槽位后执行任务，结算结果 promise
    startPromise
      .then(() => task())
      .then(
        (result) => resolveResult(result),
        (error: Error) => {
          this.logger.error(
            `任务执行失败 [${taskId}]: ${error.message}`,
            error.stack
          );
          rejectResult(error);
        }
      );

    // 任务真正结束（完成/失败/超时/被 clearQueue 取消）时释放槽位并记录样本。
    // 挂在结果 promise 的 finally 上：无论哪条路径结算，清理都恰好执行一次。
    resultPromise.finally(() => {
      // 清除超时定时器。若超时已先触发，clearTimeout 对已触发定时器是 no-op。
      if (taskState.timeoutTimer) {
        clearTimeout(taskState.timeoutTimer);
        taskState.timeoutTimer = undefined;
      }
      const finishedAt = Date.now();
      taskState.finishedAt = finishedAt;
      // 记录耗时/等待样本：跳过超时任务（未真正执行完）与未开始执行的任务（队列清空）
      if (!taskState.timedOut && taskState.startedAt) {
        this.recentCompletions.push({
          durationMs: finishedAt - taskState.startedAt,
          waitMs: taskState.startedAt - taskState.queuedAt,
        });
        if (this.recentCompletions.length > MAX_RECENT_COMPLETIONS) {
          this.recentCompletions.shift();
        }
      }
      this.running.delete(taskId);
      this.logger.debug(
        `任务完成: ${taskId}, 紧急队列=${this.criticalPriorityQueue.length}, 高优队列=${this.highPriorityQueue.length}, 低优队列=${this.lowPriorityQueue.length}, 运行中=${this.running.size}`
      );
      this.processNext();
    }).catch(() => {
      // finally 分支会透传 resultPromise 的 rejection；此处吞掉派生 promise 的
      // rejection，避免无人处理的派生分支触发 unhandledRejection
      //（rejection 本体仍经 resultPromise 传播给调用方）。
    });

    return resultPromise;
  }

  private processNext(): void {
    if (this.running.size >= this.maxConcurrent) {
      return;
    }

    const taskState =
      this.criticalPriorityQueue.shift() ??
      this.highPriorityQueue.shift() ??
      this.lowPriorityQueue.shift();
    if (!taskState) {
      return;
    }

    taskState.startedAt = Date.now();
    this.running.set(taskState.id, taskState);

    this.logger.debug(
      `任务开始执行: ${taskState.id} (${taskState.priority}), 等待时间=${taskState.startedAt - taskState.queuedAt}ms`
    );

    if (this.timeout > 0) {
      // 超时覆盖任务实际执行期（startedAt → 任务结束）：句柄存到 taskState，
      // 由结果 promise 的 finally 在任务真正结束时清除。
      // 旧实现挂在开始信号 promise 的 finally 上，而该 promise 在任务"开始"时
      // 即 resolve，定时器刚设就被清除；且超时 reject 打在已 resolve 的
      // 开始信号上也是 no-op——超时 handler 对已启动任务永远不可达（死代码）。
      // 现在直接结算结果 promise（execute 的返回值），卡死任务会被 reject 并释放槽位。
      taskState.timeoutTimer = setTimeout(() => {
        this.logger.warn(`任务执行超时: ${taskState.id}`);
        this.running.delete(taskState.id);
        // 超时任务未真正执行完成，不计入耗时样本
        taskState.timedOut = true;
        taskState.settleError(new Error(`任务执行超时 (${this.timeout}ms)`));
        this.processNext();
      }, this.timeout);
    }

    taskState.startResolve();
  }

  getQueueLength(): number {
    return (
      this.criticalPriorityQueue.length +
      this.highPriorityQueue.length +
      this.lowPriorityQueue.length
    );
  }

  getRunningCount(): number {
    return this.running.size;
  }

  clearQueue(): number {
    const allTasks = [
      ...this.criticalPriorityQueue,
      ...this.highPriorityQueue,
      ...this.lowPriorityQueue,
    ];
    allTasks.forEach((taskState) => {
      taskState.settleError(new Error('队列已清空'));
    });
    this.criticalPriorityQueue.length = 0;
    this.highPriorityQueue.length = 0;
    this.lowPriorityQueue.length = 0;
    this.logger.warn(`队列已清空: ${allTasks.length} 个任务被取消`);
    return allTasks.length;
  }

  /**
   * 最近完成任务的耗时/等待时长统计（P50/P95，单位 ms）。
   * 样本 = 最近 MAX_RECENT_COMPLETIONS 个已执行完的任务（有界）。
   * - durationMs: 开始执行到完成（startedAt → finishedAt）
   * - waitMs: 入队到开始执行（queuedAt → startedAt）
   */
  getDurationStats(): {
    sampleCount: number;
    p50DurationMs: number | null;
    p95DurationMs: number | null;
    p50WaitMs: number | null;
    p95WaitMs: number | null;
  } {
    const durations = this.recentCompletions
      .map((c) => c.durationMs)
      .sort((a, b) => a - b);
    const waits = this.recentCompletions
      .map((c) => c.waitMs)
      .sort((a, b) => a - b);
    return {
      sampleCount: this.recentCompletions.length,
      p50DurationMs: percentile(durations, 50),
      p95DurationMs: percentile(durations, 95),
      p50WaitMs: percentile(waits, 50),
      p95WaitMs: percentile(waits, 95),
    };
  }

  getStats(): {
    queueLength: number;
    criticalPriorityQueueLength: number;
    highPriorityQueueLength: number;
    lowPriorityQueueLength: number;
    runningCount: number;
    maxConcurrent: number;
    timeout: number;
  } {
    return {
      queueLength:
        this.criticalPriorityQueue.length +
        this.highPriorityQueue.length +
        this.lowPriorityQueue.length,
      criticalPriorityQueueLength: this.criticalPriorityQueue.length,
      highPriorityQueueLength: this.highPriorityQueue.length,
      lowPriorityQueueLength: this.lowPriorityQueue.length,
      runningCount: this.running.size,
      maxConcurrent: this.maxConcurrent,
      timeout: this.timeout,
    };
  }
}
