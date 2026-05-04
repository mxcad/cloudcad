import { OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
export declare class TokenBlacklistService implements OnModuleInit {
    private configService;
    private readonly redis;
    private readonly logger;
    private readonly blacklistPrefix;
    private readonly defaultTTL;
    constructor(configService: ConfigService, redis: Redis);
    onModuleInit(): void;
    /**
     * 将Token添加到黑名单
     * @param token JWT Token
     * @param expiresIn Token过期时间（秒）
     */
    addToBlacklist(token: string, expiresIn?: number): Promise<void>;
    /**
     * 检查Token是否在黑名单中
     * @param token JWT Token
     * @returns 是否在黑名单中
     */
    isBlacklisted(token: string): Promise<boolean>;
    /**
     * 将用户的所有Token添加到黑名单
     * @param userId 用户ID
     */
    blacklistUserTokens(userId: string): Promise<void>;
    /**
     * 检查用户是否在黑名单中
     * @param userId 用户ID
     * @returns 是否在黑名单中
     */
    isUserBlacklisted(userId: string): Promise<boolean>;
    /**
     * 从黑名单中移除用户
     * @param userId 用户ID
     */
    removeUserFromBlacklist(userId: string): Promise<void>;
    /**
     * 从黑名单中移除Token
     * @param token JWT Token
     */
    removeFromBlacklist(token: string): Promise<void>;
    /**
     * 清理过期的黑名单条目
     */
    cleanupExpiredTokens(): Promise<void>;
    /**
     * 获取黑名单统计信息
     */
    getBlacklistStats(): Promise<{
        totalTokens: number;
        blacklistedUsers: number;
    }>;
    /**
     * 存储临时数据
     * @param key 键名
     * @param value 值
     * @param ttl 过期时间（秒）
     */
    setTempData(key: string, value: string, ttl: number): Promise<void>;
    /**
     * 获取临时数据
     * @param key 键名
     */
    getTempData(key: string): Promise<string | null>;
    /**
     * 删除临时数据
     * @param key 键名
     */
    deleteTempData(key: string): Promise<void>;
    onModuleDestroy(): Promise<void>;
}
//# sourceMappingURL=token-blacklist.service.d.ts.map