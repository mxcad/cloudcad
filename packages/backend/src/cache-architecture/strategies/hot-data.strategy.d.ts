import { IWarmupStrategy, WarmupResult } from './warmup.strategy';
import { L3CacheProvider } from '../providers/l3-cache.provider';
import { MultiLevelCacheService } from '../services/multi-level-cache.service';
/**
 * 热点数据预热策略
 * 从 L3 缓存中识别高频访问数据并预加载到 L1/L2
 */
export declare class HotDataStrategy implements IWarmupStrategy {
    private readonly l3Cache;
    private readonly multiLevelCache;
    readonly name = "hot-data";
    private readonly logger;
    constructor(l3Cache: L3CacheProvider, multiLevelCache: MultiLevelCacheService);
    /**
     * 执行热点数据预热
     */
    warmup(): Promise<WarmupResult>;
}
//# sourceMappingURL=hot-data.strategy.d.ts.map