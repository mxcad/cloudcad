import { ConfigService } from '@nestjs/config';
import { ProjectRole, SystemPermission } from '../enums/permissions.enum';
import Redis from 'ioredis';
import { Role } from '@prisma/client';
/**
 * Redis 缓存服务
 *
 * 功能：
 * 1. 使用 Redis 存储权限缓存
 * 2. 支持缓存过期
 * 3. 支持缓存清理
 * 4. 提供缓存统计
 */
export declare class RedisCacheService {
    private readonly configService;
    private readonly redis;
    private readonly logger;
    private readonly KEY_PREFIX;
    private readonly defaultTTL;
    private readonly permissionTTL;
    constructor(configService: ConfigService, redis: Redis);
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
     * 清除用户相关缓存
     */
    clearUserCache(userId: string): Promise<void>;
    /**
     * 清除节点相关缓存（项目/文件夹/文件）
     */
    clearNodeCache(nodeId: string): Promise<void>;
    /**
     * 清除项目缓存（向后兼容）
     * @deprecated 使用 clearNodeCache 代替
     */
    clearProjectCache(projectId: string): Promise<void>;
    /**
     * 清除文件缓存（向后兼容）
     * @deprecated 使用 clearNodeCache 代替
     */
    clearFileCache(fileId: string): Promise<void>;
    /**
     * 缓存用户权限
     */
    cacheUserPermissions(userId: string, permissions: SystemPermission[]): Promise<void>;
    /**
     * 获取用户权限缓存
     */
    getUserPermissions(userId: string): Promise<SystemPermission[] | null>;
    /**
     * 缓存节点访问权限（统一管理项目/文件夹/文件的访问权限）
     */
    cacheNodeAccessRole(userId: string, nodeId: string, role: ProjectRole): Promise<void>;
    /**
     * 获取节点访问角色缓存
     */
    getNodeAccessRole(userId: string, nodeId: string): Promise<ProjectRole | null>;
    /**
     * 获取文件访问角色缓存（向后兼容）
     * @deprecated 使用 getNodeAccessRole 代替
     */
    getFileAccessRole(userId: string, nodeId: string): Promise<ProjectRole | null>;
    /**
     * 缓存用户角色
     */
    cacheUserRole(userId: string, role: Role): Promise<void>;
    /**
     * 获取用户角色缓存
     */
    getUserRole(userId: string): Promise<any | null>;
    /**
     * 获取缓存统计信息
     */
    getStats(): Promise<{
        totalEntries: number;
        memoryUsage: string;
    }>;
    /**
     * 清理所有权限缓存
     */
    clearAll(): Promise<void>;
}
//# sourceMappingURL=redis-cache.service.d.ts.map