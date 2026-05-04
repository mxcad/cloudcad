import { IWarmupStrategy, WarmupResult } from './warmup.strategy';
import { DatabaseService } from '../../database/database.service';
import { RedisCacheService } from '../../common/services/redis-cache.service';
/**
 * 权限预热策略
 * 预热活跃用户的权限数据
 */
export declare class PermissionStrategy implements IWarmupStrategy {
    private readonly prisma;
    private readonly redisCache;
    readonly name = "permissions";
    private readonly logger;
    private readonly maxUsersToWarmup;
    constructor(prisma: DatabaseService, redisCache: RedisCacheService);
    /**
     * 执行权限预热
     */
    warmup(): Promise<WarmupResult>;
}
//# sourceMappingURL=permission.strategy.d.ts.map