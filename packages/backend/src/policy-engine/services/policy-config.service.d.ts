import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../../database/database.service';
import { PermissionCacheService } from '../../common/services/permission-cache.service';
import { PolicyFactoryService } from './policy-factory.service';
import { PolicyType } from '../enums/policy-type.enum';
import { Permission as PrismaPermission } from '@prisma/client';
/**
 * 权限策略配置
 */
export interface PermissionPolicyConfig {
    id?: string;
    type: PolicyType;
    name: string;
    description?: string;
    config: Record<string, unknown>;
    permissions: PrismaPermission[];
    enabled: boolean;
    priority?: number;
}
/**
 * 策略配置服务
 *
 * 负责管理权限策略的配置（创建、更新、删除、查询）
 */
export declare class PolicyConfigService {
    private readonly configService;
    private readonly prisma;
    private readonly cacheService;
    private readonly policyFactory;
    private readonly logger;
    private readonly cachePrefix;
    private readonly cacheTTL;
    constructor(configService: ConfigService, prisma: DatabaseService, cacheService: PermissionCacheService, policyFactory: PolicyFactoryService);
    /**
     * 创建策略配置
     */
    createPolicyConfig(config: PermissionPolicyConfig, createdBy: string): Promise<PermissionPolicyConfig & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
    }>;
    /**
     * 更新策略配置
     */
    updatePolicyConfig(policyId: string, updates: Partial<PermissionPolicyConfig>, updatedBy: string): Promise<PermissionPolicyConfig & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
    }>;
    /**
     * 删除策略配置
     */
    deletePolicyConfig(policyId: string, deletedBy: string): Promise<void>;
    /**
     * 获取策略配置
     */
    getPolicyConfig(policyId: string): Promise<(PermissionPolicyConfig & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
    }) | null>;
    /**
     * 获取所有策略配置
     */
    getAllPolicyConfigs(): Promise<(PermissionPolicyConfig & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
    })[]>;
    /**
     * 根据权限获取启用的策略配置
     */
    getEnabledPoliciesForPermission(permission: PrismaPermission): Promise<(PermissionPolicyConfig & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
    })[]>;
    /**
     * 启用/禁用策略配置
     */
    togglePolicyConfig(policyId: string, enabled: boolean, updatedBy: string): Promise<PermissionPolicyConfig & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
    }>;
    /**
     * 格式化策略配置
     */
    private formatPolicyConfig;
    /**
     * 清除缓存
     */
    private clearCache;
}
//# sourceMappingURL=policy-config.service.d.ts.map