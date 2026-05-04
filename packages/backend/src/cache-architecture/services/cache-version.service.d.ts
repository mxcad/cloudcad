import { OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
/**
 * 缓存版本类型
 */
export declare enum CacheVersionType {
    USER_PERMISSIONS = "user_permissions",
    USER_ROLE = "user_role",
    PROJECT_PERMISSIONS = "project_permissions",
    PROJECT_MEMBERS = "project_members",
    ROLE_PERMISSIONS = "role_permissions",
    SYSTEM_CONFIG = "system_config"
}
/**
 * 缓存版本信息
 */
interface CacheVersionInfo {
    /** 版本号 */
    version: string;
    /** 更新时间戳 */
    updatedAt: number;
    /** 版本描述 */
    description?: string;
}
/**
 * 缓存版本管理服务
 *
 * 功能：
 * 1. 为不同类型的缓存数据维护版本号
 * 2. 通过版本号确保缓存一致性
 * 3. 支持版本升级和回滚
 * 4. 防止使用过期数据
 */
export declare class CacheVersionService implements OnModuleInit {
    private readonly configService;
    private readonly redis;
    private readonly logger;
    private readonly VERSION_PREFIX;
    private readonly VERSION_LOCK_PREFIX;
    private readonly defaultTTL;
    private readonly distributedLockTTL;
    constructor(configService: ConfigService, redis: Redis);
    onModuleInit(): Promise<void>;
    /**
     * 获取指定类型的缓存版本
     *
     * @param type 缓存类型
     * @param key 可选的缓存键（用于特定数据的版本控制）
     * @returns 版本信息
     */
    getVersion(type: CacheVersionType, key?: string): Promise<CacheVersionInfo | null>;
    /**
     * 创建新的缓存版本
     *
     * @param type 缓存类型
     * @param key 可选的缓存键
     * @param description 版本描述
     * @returns 新版本号
     */
    createVersion(type: CacheVersionType, key?: string, description?: string): Promise<string>;
    /**
     * 更新缓存版本（创建新版本）
     *
     * @param type 缓存类型
     * @param key 可选的缓存键
     * @param description 版本描述
     * @returns 新版本号
     */
    updateVersion(type: CacheVersionType, key?: string, description?: string): Promise<string>;
    /**
     * 删除缓存版本
     *
     * @param type 缓存类型
     * @param key 可选的缓存键
     */
    deleteVersion(type: CacheVersionType, key?: string): Promise<void>;
    /**
     * 批量删除缓存版本
     *
     * @param type 缓存类型
     * @param keys 缓存键列表
     */
    deleteVersions(type: CacheVersionType, keys: string[]): Promise<void>;
    /**
     * 检查缓存版本是否过期
     *
     * @param type 缓存类型
     * @param key 可选的缓存键
     * @param maxAge 最大有效时间（毫秒）
     * @returns 是否过期
     */
    isVersionExpired(type: CacheVersionType, key?: string, maxAge?: number): Promise<boolean>;
    /**
     * 获取版本化的缓存键
     *
     * @param baseKey 基础缓存键
     * @param type 缓存类型
     * @param key 可选的缓存键
     * @returns 带版本号的缓存键
     */
    getVersionedKey(baseKey: string, type: CacheVersionType, key?: string): Promise<string>;
    /**
     * 验证缓存键的版本是否有效
     *
     * @param versionedKey 带版本号的缓存键
     * @param type 缓存类型
     * @param key 可选的缓存键
     * @returns 是否有效
     */
    validateKey(versionedKey: string, type: CacheVersionType, key?: string): Promise<boolean>;
    /**
     * 获取所有版本信息（用于调试）
     *
     * @param type 缓存类型
     * @returns 版本信息列表
     */
    getAllVersions(type: CacheVersionType): Promise<Array<{
        key: string;
        version: string;
        updatedAt: number;
    }>>;
    /**
     * 清理过期版本
     *
     * @param type 缓存类型
     * @param maxAge 最大有效时间（毫秒）
     * @returns 清理的版本数量
     */
    cleanupExpiredVersions(type: CacheVersionType, maxAge?: number): Promise<number>;
    /**
     * 生成版本键
     */
    private getVersionKey;
    /**
     * 生成版本锁键
     */
    private getVersionLockKey;
    /**
     * 获取分布式锁
     */
    private acquireLock;
    /**
     * 释放分布式锁
     */
    private releaseLock;
}
export {};
//# sourceMappingURL=cache-version.service.d.ts.map