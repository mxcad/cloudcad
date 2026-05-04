import { OnModuleInit } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { WarmupResult } from '../strategies/warmup.strategy';
import { HotDataStrategy } from '../strategies/hot-data.strategy';
import { PermissionStrategy } from '../strategies/permission.strategy';
import { RoleStrategy } from '../strategies/role.strategy';
import { DatabaseService } from '../../database/database.service';
import { RedisCacheService } from '../../common/services/redis-cache.service';
/**
 * 缓存预热配置接口
 */
export interface ICacheWarmupConfig {
    /** 是否启用预热 */
    enabled: boolean;
    /** 定时任务表达式 */
    schedule: string;
    /** 热点数据阈值（次/分钟） */
    hotDataThreshold: number;
    /** 最大预热数据量 */
    maxWarmupSize: number;
    /** 最大用户数 */
    maxUsers: number;
    /** 最大项目数 */
    maxProjects: number;
    /** 启用的数据类型 */
    dataTypes: string[];
}
/**
 * 统一的缓存预热服务
 *
 * 功能：
 * 1. 使用策略模式管理多种预热策略
 * 2. 支持定时预热（Cron）
 * 3. 支持启动时预热（OnModuleInit）
 * 4. 支持手动触发预热
 * 5. 提供配置管理和统计信息
 *
 * 架构设计：
 * - 策略层：5 个独立策略类（热点数据、权限、角色、用户、项目）
 * - 执行层：统一调度，支持策略组合
 * - 调度层：Cron 定时 + 启动时 + 手动触发
 */
export declare class CacheWarmupService implements OnModuleInit {
    private readonly configService;
    private readonly schedulerRegistry;
    private readonly prisma;
    private readonly redisCache;
    private readonly hotDataStrategy;
    private readonly permissionStrategy;
    private readonly roleStrategy;
    private readonly logger;
    private readonly strategies;
    private _config;
    constructor(configService: ConfigService, schedulerRegistry: SchedulerRegistry, prisma: DatabaseService, redisCache: RedisCacheService, hotDataStrategy: HotDataStrategy, permissionStrategy: PermissionStrategy, roleStrategy: RoleStrategy);
    /**
     * 模块初始化时自动执行缓存预热
     * 优化：禁用启动时预热，改为懒加载策略，加快启动速度
     * 缓存将在首次访问时自动加载
     */
    onModuleInit(): Promise<void>;
    /**
     * 每小时执行缓存预热（定时任务）
     */
    scheduledWarmup(): Promise<void>;
    /**
     * 注册所有预热策略
     */
    private registerStrategies;
    /**
     * 加载配置
     */
    private get config();
    private set config(value);
    /**
     * 统一预热接口
     * @param strategies 要执行的策略名称列表，不传则执行所有启用的策略
     * @returns 所有策略的执行结果
     */
    warmup(strategies?: string[]): Promise<WarmupResult[]>;
    /**
     * 手动触发预热
     */
    triggerWarmup(): Promise<{
        success: boolean;
        count: number;
        duration: number;
        error?: string;
    }>;
    /**
     * 获取预热配置
     */
    getConfig(): ICacheWarmupConfig;
    /**
     * 更新预热配置
     */
    updateConfig(config: Partial<ICacheWarmupConfig>): void;
    /**
     * 更新定时任务
     */
    private updateScheduler;
    /**
     * 获取预热统计
     */
    getWarmupStats(): {
        config: ICacheWarmupConfig;
        strategies: string[];
        strategyCount: number;
    };
    /**
     * 手动触发缓存预热（兼容原 common 版本接口）
     */
    manualWarmup(): Promise<{
        success: boolean;
        message: string;
        duration: number;
    }>;
    /**
     * 预热指定用户的缓存（兼容原 common 版本接口）
     */
    warmupUser(userId: string): Promise<void>;
    /**
     * 预热指定项目的缓存（兼容原 common 版本接口）
     */
    warmupProject(projectId: string): Promise<void>;
    /**
     * 获取预热历史（兼容原 cache-architecture 版本接口）
     * 注意：重构后不再跟踪单个键的预热历史，返回空数组
     */
    getWarmupHistory(): Array<{
        key: string;
        lastWarmup: Date;
    }>;
    /**
     * 清除预热历史（兼容原 cache-architecture 版本接口）
     */
    clearWarmupHistory(): void;
}
//# sourceMappingURL=cache-warmup.service.d.ts.map