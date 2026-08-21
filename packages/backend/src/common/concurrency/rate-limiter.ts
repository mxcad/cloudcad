import { Injectable, Logger } from '@nestjs/common';

export type TaskPriority = 'critical' | 'high' | 'low';

interface TaskState {
  id: string;
  resolve: () => void;
  reject: (error: Error) => void;
  promise: Promise<void>;
  queuedAt: number;
  startedAt?: number;
  priority: TaskPriority;
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
  private nextTaskId = 0;

  constructor(maxConcurrent: number) {
    this.maxConcurrent = maxConcurrent;
    this.timeout = 600000;
    this.logger.log(
      `限流器初始化: 最大并发数=${this.maxConcurrent}, 超时=${this.timeout}ms`
    );
  }

  async execute<T>(task: () => Promise<T>, priority: TaskPriority = 'high'): Promise<T> {
    const taskId = `task_${this.nextTaskId++}`;
    const taskState: TaskState = {
      id: taskId,
      resolve: () => {},
      reject: () => {},
      promise: Promise.resolve(),
      queuedAt: Date.now(),
      priority,
    };

    taskState.promise = new Promise<void>((resolve, reject) => {
      taskState.resolve = resolve;
      taskState.reject = reject;
    });

    const queue = priority === 'critical' ? this.criticalPriorityQueue
      : priority === 'high' ? this.highPriorityQueue
      : this.lowPriorityQueue;
    queue.push(taskState);
    this.logger.debug(
      `任务加入队列: ${taskId} (${priority}), 紧急队列=${this.criticalPriorityQueue.length}, 高优队列=${this.highPriorityQueue.length}, 低优队列=${this.lowPriorityQueue.length}, 运行中=${this.running.size}`
    );

    this.processNext();

    try {
      await taskState.promise;
      const result = await task();
      return result;
    } catch (error) {
      this.logger.error(
        `任务执行失败 [${taskId}]: ${error.message}`,
        error.stack
      );
      throw error;
    } finally {
      this.running.delete(taskId);
      this.logger.debug(
        `任务完成: ${taskId}, 紧急队列=${this.criticalPriorityQueue.length}, 高优队列=${this.highPriorityQueue.length}, 低优队列=${this.lowPriorityQueue.length}, 运行中=${this.running.size}`
      );
      this.processNext();
    }
  }

  private processNext(): void {
    if (this.running.size >= this.maxConcurrent) {
      return;
    }

    const taskState = this.criticalPriorityQueue.shift()
      ?? this.highPriorityQueue.shift()
      ?? this.lowPriorityQueue.shift();
    if (!taskState) {
      return;
    }

    taskState.startedAt = Date.now();
    this.running.set(taskState.id, taskState);

    this.logger.debug(
      `任务开始执行: ${taskState.id} (${taskState.priority}), 等待时间=${taskState.startedAt - taskState.queuedAt}ms`
    );

    if (this.timeout > 0 && taskState.startedAt) {
      const timeout = setTimeout(() => {
        this.logger.warn(`任务执行超时: ${taskState.id}`);
        this.running.delete(taskState.id);
        taskState.reject(new Error(`任务执行超时 (${this.timeout}ms)`));
        this.processNext();
      }, this.timeout);

      taskState.promise.finally(() => {
        clearTimeout(timeout);
      });
    }

    taskState.resolve();
  }

  getQueueLength(): number {
    return this.criticalPriorityQueue.length + this.highPriorityQueue.length + this.lowPriorityQueue.length;
  }

  getRunningCount(): number {
    return this.running.size;
  }

  clearQueue(): number {
    const allTasks = [...this.criticalPriorityQueue, ...this.highPriorityQueue, ...this.lowPriorityQueue];
    allTasks.forEach((taskState) => {
      taskState.reject(new Error('队列已清空'));
    });
    this.criticalPriorityQueue.length = 0;
    this.highPriorityQueue.length = 0;
    this.lowPriorityQueue.length = 0;
    this.logger.warn(`队列已清空: ${allTasks.length} 个任务被取消`);
    return allTasks.length;
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
      queueLength: this.criticalPriorityQueue.length + this.highPriorityQueue.length + this.lowPriorityQueue.length,
      criticalPriorityQueueLength: this.criticalPriorityQueue.length,
      highPriorityQueueLength: this.highPriorityQueue.length,
      lowPriorityQueueLength: this.lowPriorityQueue.length,
      runningCount: this.running.size,
      maxConcurrent: this.maxConcurrent,
      timeout: this.timeout,
    };
  }
}
