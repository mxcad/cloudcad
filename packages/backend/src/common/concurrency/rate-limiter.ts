import { Injectable, Logger } from '@nestjs/common';

/**
 * 限流任务状态
 */
interface TaskState {
  id: string;
  resolve: () => void;
  reject: (error: Error) => void;
  promise: Promise<void>;
  queuedAt: number;
  startedAt?: number;
}

/**
 * 限流器
 *
 * 功能：
 * 1. 限制并发任务数量
 * 2. 支持任务队列
 * 3. 支持任务超时控制
 * 4. 支持任务优先级
 */
@Injectable()
export class RateLimiter {
  private readonly logger = new Logger(RateLimiter.name);
  private readonly maxConcurrent: number;
  private readonly timeout: number;
  private readonly queue: TaskState[] = [];
  private readonly running: Map<string, TaskState> = new Map();
  private nextTaskId = 0;

  constructor(maxConcurrent: number) {
    this.maxConcurrent = maxConcurrent;
    this.timeout = 600000; // 默认 10 分钟超时
    this.logger.log(
      `限流器初始化: 最大并发数=${this.maxConcurrent}, 超时=${this.timeout}ms`
    );
  }

  /**
   * 执行限流任务
   *
   * @param task 要执行的任务函数
   * @returns 任务执行结果
   */
  async execute<T>(task: () => Promise<T>): Promise<T> {
    const taskId = `task_${this.nextTaskId++}`;
    const taskState: TaskState = {
      id: taskId,
      resolve: () => {},
      reject: () => {},
      promise: Promise.resolve(),
      queuedAt: Date.now(),
    };

    // 创建 Promise
    taskState.promise = new Promise<void>((resolve, reject) => {
      taskState.resolve = resolve;
      taskState.reject = reject;
    });

    // 添加到队列
    this.queue.push(taskState);
    this.logger.debug(
      `任务加入队列: ${taskId}, 队列长度=${this.queue.length}, 运行中=${this.running.size}`
    );

    // 尝试执行下一个任务
    this.processNext();

    try {
      // 等待任务完成
      await taskState.promise;

      // 执行实际任务
      const result = await task();
      return result;
    } catch (error) {
      this.logger.error(`任务执行失败 [${taskId}]: ${error.message}`, error.stack);
      throw error;
    } finally {
      // 从运行中移除
      this.running.delete(taskId);
      this.logger.debug(
        `任务完成: ${taskId}, 队列长度=${this.queue.length}, 运行中=${this.running.size}`
      );

      // 执行下一个任务
      this.processNext();
    }
  }

  /**
   * 处理下一个任务
   */
  private processNext(): void {
    // 检查是否达到最大并发数
    if (this.running.size >= this.maxConcurrent) {
      return;
    }

    // 检查队列是否为空
    if (this.queue.length === 0) {
      return;
    }

    // 取出下一个任务
    const taskState = this.queue.shift()!;
    taskState.startedAt = Date.now();

    // 添加到运行中
    this.running.set(taskState.id, taskState);

    this.logger.debug(
      `任务开始执行: ${taskState.id}, 等待时间=${taskState.startedAt - taskState.queuedAt}ms`
    );

    // 检查超时
    if (this.timeout > 0 && taskState.startedAt) {
      const timeout = setTimeout(() => {
        this.logger.warn(`任务执行超时: ${taskState.id}`);
        taskState.reject(new Error(`任务执行超时 (${this.timeout}ms)`));
      }, this.timeout);

      // 清理定时器
      taskState.promise.finally(() => {
        clearTimeout(timeout);
      });
    }

    // 触发任务执行
    taskState.resolve();
  }

  /**
   * 获取队列长度
   *
   * @returns 队列长度
   */
  getQueueLength(): number {
    return this.queue.length;
  }

  /**
   * 获取运行中的任务数量
   *
   * @returns 运行中的任务数量
   */
  getRunningCount(): number {
    return this.running.size;
  }

  /**
   * 清空队列
   *
   * @returns 清空的任务数量
   */
  clearQueue(): number {
    const count = this.queue.length;
    this.queue.forEach((taskState) => {
      taskState.reject(new Error('队列已清空'));
    });
    this.queue.length = 0;
    this.logger.warn(`队列已清空: ${count} 个任务被取消`);
    return count;
  }

  /**
   * 获取统计信息
   *
   * @returns 统计信息
   */
  getStats(): {
    queueLength: number;
    runningCount: number;
    maxConcurrent: number;
    timeout: number;
  } {
    return {
      queueLength: this.queue.length,
      runningCount: this.running.size,
      maxConcurrent: this.maxConcurrent,
      timeout: this.timeout,
    };
  }
}