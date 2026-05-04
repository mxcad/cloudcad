/**
 * 限流器
 *
 * 功能：
 * 1. 限制并发任务数量
 * 2. 支持任务队列
 * 3. 支持任务超时控制
 * 4. 支持任务优先级
 */
export declare class RateLimiter {
    private readonly logger;
    private readonly maxConcurrent;
    private readonly timeout;
    private readonly queue;
    private readonly running;
    private nextTaskId;
    constructor(maxConcurrent: number);
    /**
     * 执行限流任务
     *
     * @param task 要执行的任务函数
     * @returns 任务执行结果
     */
    execute<T>(task: () => Promise<T>): Promise<T>;
    /**
     * 处理下一个任务
     */
    private processNext;
    /**
     * 获取队列长度
     *
     * @returns 队列长度
     */
    getQueueLength(): number;
    /**
     * 获取运行中的任务数量
     *
     * @returns 运行中的任务数量
     */
    getRunningCount(): number;
    /**
     * 清空队列
     *
     * @returns 清空的任务数量
     */
    clearQueue(): number;
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
    };
}
//# sourceMappingURL=rate-limiter.d.ts.map