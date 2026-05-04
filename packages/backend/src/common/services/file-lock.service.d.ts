import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../config/app.config';
interface LockHandle {
    lockPath: string;
    release: () => Promise<void>;
}
export declare class FileLockService {
    private configService;
    private readonly logger;
    private readonly lockDir;
    private readonly lockTimeout;
    private readonly lockRetryInterval;
    private readonly maxRetries;
    constructor(configService: ConfigService<AppConfig>);
    /**
     * 确保锁目录存在（同步方法，在构造函数中调用）
     */
    private ensureLockDir;
    /**
     * 获取锁文件路径
     */
    private getLockPath;
    /**
     * 获取锁
     * @param lockName 锁名称
     * @returns 锁句柄
     */
    acquireLock(lockName: string): Promise<LockHandle>;
    /**
     * 使用锁执行操作
     * @param lockName 锁名称
     * @param fn 要执行的函数
     * @returns 函数执行结果
     */
    withLock<T>(lockName: string, fn: () => Promise<T>): Promise<T>;
    /**
     * 检查锁是否存在
     * @param lockName 锁名称
     * @returns 是否存在
     */
    isLocked(lockName: string): Promise<boolean>;
    /**
     * 强制释放锁（仅用于紧急情况）
     * @param lockName 锁名称
     */
    forceRelease(lockName: string): Promise<void>;
    /**
     * 清理所有过期锁
     */
    cleanupExpiredLocks(): Promise<number>;
    /**
     * 等待指定时间
     */
    private sleep;
}
export {};
//# sourceMappingURL=file-lock.service.d.ts.map