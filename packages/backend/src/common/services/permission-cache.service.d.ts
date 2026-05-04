import { OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { SystemPermission, ProjectPermission } from '../enums/permissions.enum';
import { MultiLevelCacheService } from '../../cache-architecture/services/multi-level-cache.service';
import { CacheVersionService } from '../../cache-architecture/services/cache-version.service';
export declare class PermissionCacheService implements OnModuleDestroy {
    private readonly redis;
    private readonly multiLevelCache;
    private readonly cacheVersionService?;
    private readonly logger;
    private readonly defaultTTL;
    private readonly CHANNEL_PREFIX;
    private subscriber;
    constructor(redis: Redis, multiLevelCache: MultiLevelCacheService, cacheVersionService?: CacheVersionService | undefined);
    onModuleDestroy(): Promise<void>;
    /**
     * 设置版本控制
     */
    private setupVersionControl;
    /**
     * 订阅缓存失效事件
     */
    private subscribeToInvalidationEvents;
    /**
     * 处理缓存失效事件
     * 只处理 5 秒内的事件，防止过期的事件在重启的地方再次处理
     */
    private handleInvalidationEvent;
    /**
     * 发布缓存失效事件
     */
    private publishInvalidationEvent;
    /**
     * 生成缓存键
     */
    private generateCacheKey;
    /**
     * 设置缓存
     */
    set<T>(key: string, value: T, ttl?: number): Promise<void>;
    /**
     * 获取缓存
     */
    get<T>(key: string): Promise<T | null>;
    /**
     * 删除缓存
     */
    delete(key: string): Promise<void>;
    /**
     * 清除用户缓存（公共接口）
     */
    clearUserCache(userId: string): Promise<void>;
    /**
     * 清除用户缓存（内部实现，不发布事件）
     * 使用多级缓存进行删除
     */
    private clearUserCacheInternal;
    /**
     * 清除项目缓存（公共接口）
     */
    clearProjectCache(projectId: string): Promise<void>;
    /**
     * 清除项目缓存（内部实现）
     */
    private clearProjectCacheInternal;
    /**
     * 清除角色缓存（公共接口）
     */
    clearRoleCache(roleName: string): Promise<void>;
    /**
     * 清除角色缓存（内部实现）
     */
    private clearRoleCacheInternal;
    /**
     * 清除所有缓存（公共接口）
     */
    clearAllCache(): Promise<void>;
    /**
     * 清除所有缓存（内部实现）
     */
    private clearAllCacheInternal;
    /**
     * 批量清除用户缓存
     */
    clearMultipleUserCache(userIds: string[]): Promise<void>;
    /**
     * 批量清除项目缓存
     */
    clearMultipleProjectCache(projectIds: string[]): Promise<void>;
    /**
     * 缓存用户系统权限
     */
    cacheUserPermissions(userId: string, permissions: SystemPermission[]): Promise<void>;
    /**
     * 获取用户系统权限缓存
     */
    getUserPermissions(userId: string): Promise<SystemPermission[] | null>;
    /**
     * 缓存用户角色
     */
    cacheUserRole(userId: string, role: string): Promise<void>;
    /**
     * 获取用户角色缓存
     */
    getUserRole(userId: string): Promise<string | null>;
    /**
     * 缓存项目权限
     */
    cacheProjectPermissions(projectId: string, permissions: ProjectPermission[]): Promise<void>;
    /**
     * 获取项目权限缓存
     */
    getProjectPermissions(projectId: string): Promise<ProjectPermission[] | null>;
    /**
     * 获取或加载用户权限
     */
    getOrLoadUserPermissions(userId: string, loader: () => Promise<SystemPermission[]>): Promise<SystemPermission[]>;
    /**
     * 获取或加载项目权限
     */
    getOrLoadProjectPermissions(projectId: string, loader: () => Promise<ProjectPermission[]>): Promise<ProjectPermission[]>;
    /**
     * 清理过期缓存（多级缓存自动清理，这里返回 0）
     * @returns 清理的条目数量
     */
    cleanup(): Promise<number>;
    /**
     * 获取缓存大小
     */
    size(): Promise<number>;
    /**
     * 获取缓存统计信息
     */
    getStats(): Promise<{
        totalEntries: number;
        capacity: number;
        memoryUsage: string;
        hitRate: number;
    }>;
}
//# sourceMappingURL=permission-cache.service.d.ts.map