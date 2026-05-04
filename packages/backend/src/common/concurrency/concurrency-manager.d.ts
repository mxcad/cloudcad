/**
 * 并发管理器
 *
 * 功能：
 * 1. 提供分布式锁机制，防止并发冲突
 * 2. 支持任务超时控制
 * 3. 支持锁状态查询和管理
 */
export declare class ConcurrencyManager {
    private readonly logger;
    private readonly locks;
    /**
     * 获取锁并执行任务
     *
     * @param key 锁的键
     * @param task 要执行的任务函数
     * @returns 任务执行结果，成功返回 true，失败返回 false
     */
    acquireLock<T>(key: string, task: () => Promise<T>): Promise<T | null>;
    /**
     * 执行带超时的任务
     *
     * @param task 要执行的任务函数
     * @param timeout 超时时间（毫秒）
     * @returns 任务执行结果，成功返回结果，超时或失败返回 null
     */
    withTimeout<T>(task: () => Promise<T>, timeout: number): Promise<T | null>;
    /**
     * 检查锁是否存在
     *
     * @param key 锁的键
     * @returns 是否存在锁
     */
    isLocked(key: string): boolean;
    /**
     * 释放锁
     *
     * @param key 锁的键
     * @returns 是否成功释放
     */
    releaseLock(key: string): boolean;
    /**
     * 获取所有被锁定的键
     *
     * @returns 锁键数组
     */
    getLockedKeys(): string[];
    /**
     * 获取当前锁的数量
     *
     * @returns 锁的数量
     */
    getLockCount(): number;
    /**
     * 清除所有锁
     *
     * @returns 清除的锁数量
     */
    clearAllLocks(): number;
}
//# sourceMappingURL=concurrency-manager.d.ts.map