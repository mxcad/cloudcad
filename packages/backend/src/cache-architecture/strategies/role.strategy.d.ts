import { IWarmupStrategy, WarmupResult } from './warmup.strategy';
import { DatabaseService } from '../../database/database.service';
import { RedisCacheService } from '../../common/services/redis-cache.service';
/**
 * 角色预热策略
 * 预热项目成员的角色权限
 */
export declare class RoleStrategy implements IWarmupStrategy {
    private readonly prisma;
    private readonly redisCache;
    readonly name = "roles";
    private readonly logger;
    private readonly maxProjectsToWarmup;
    constructor(prisma: DatabaseService, redisCache: RedisCacheService);
    /**
     * 执行角色预热
     */
    warmup(): Promise<WarmupResult>;
}
//# sourceMappingURL=role.strategy.d.ts.map