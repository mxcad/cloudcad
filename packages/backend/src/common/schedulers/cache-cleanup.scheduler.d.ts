import { PermissionCacheService } from '../services/permission-cache.service';
import { CacheMonitorService } from '../../cache-architecture/services/cache-monitor.service';
import { L3CacheProvider } from '../../cache-architecture/providers/l3-cache.provider';
export declare class CacheCleanupScheduler {
    private readonly cacheService;
    private readonly cacheMonitorService;
    private readonly l3Cache;
    private readonly logger;
    constructor(cacheService: PermissionCacheService, cacheMonitorService: CacheMonitorService, l3Cache: L3CacheProvider);
    /**
     * 每 10 分钟执行一次缓存清理
     */
    handleCacheCleanup(): Promise<void>;
    /**
     * 每小时记录缓存统计信息
     */
    logCacheStats(): Promise<void>;
    /**
     * 每天记录健康状态
     */
    logHealthStatus(): Promise<void>;
}
//# sourceMappingURL=cache-cleanup.scheduler.d.ts.map