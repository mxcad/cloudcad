/**
 * 上传队列 - 支持真正的并发执行
 */
export class UploadQueue {
  private maxConcurrent: number;
  private running: number;
  private queue: Array<{
    task: () => Promise<void>;
    resolve: () => void;
    reject: (error: Error) => void;
  }>;

  constructor(maxConcurrent: number = 3) {
    this.maxConcurrent = maxConcurrent;
    this.running = 0;
    this.queue = [];
  }

  /**
   * 将任务加入队列并返回 Promise
   * 任务会在并发限制允许时自动执行
   */
  enqueue(task: () => Promise<void>): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.queue.push({ task, resolve, reject });
      this.processQueue();
    });
  }

  /**
   * 处理队列中的任务
   * 关键：不 await task()，让任务异步并行执行
   */
  private processQueue(): void {
    // 启动尽可能多的任务（直到达到并发上限或队列为空）
    while (this.running < this.maxConcurrent && this.queue.length > 0) {
      this.running++;
      const item = this.queue.shift();
      if (!item) {
        this.running--;
        return;
      }
      const { task, resolve, reject } = item;

      // 不 await，让任务异步执行
      task()
        .then(() => {
          resolve();
        })
        .catch((error) => {
          reject(error);
        })
        .finally(() => {
          this.running--;
          // 任务完成后处理下一个
          this.processQueue();
        });
    }
  }

  /**
   * 获取当前队列长度
   */
  getQueueLength(): number {
    return this.queue.length;
  }

  /**
   * 获取当前运行中的任务数
   */
  getRunningCount(): number {
    return this.running;
  }
}
