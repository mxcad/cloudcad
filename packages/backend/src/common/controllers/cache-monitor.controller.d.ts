import { RedisCacheService } from '../services/redis-cache.service';
import { CacheWarmupService } from '../../cache-architecture/services/cache-warmup.service';
export declare class CacheMonitorController {
    private readonly redisCacheService;
    private readonly cacheWarmupService;
    constructor(redisCacheService: RedisCacheService, cacheWarmupService: CacheWarmupService);
    getStats(): Promise<{
        totalEntries: number;
        memoryUsage: string;
    }>;
    clearAll(): Promise<{
        message: string;
    }>;
    manualWarmup(): Promise<{
        success: boolean;
        message: string;
        duration: number;
    }>;
    warmupUser(userId: string): Promise<{
        message: string;
    }>;
    warmupProject(projectId: string): Promise<{
        message: string;
    }>;
}
//# sourceMappingURL=cache-monitor.controller.d.ts.map