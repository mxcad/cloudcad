import { ConfigService } from '@nestjs/config';
import { PermissionCacheService } from '../../common/services/permission-cache.service';
import { IPermissionPolicy, PolicyContext, PolicyEvaluationResult } from '../interfaces/permission-policy.interface';
import { PolicyFactoryService } from './policy-factory.service';
import { PolicyType } from '../enums/policy-type.enum';
/**
 * 策略评估结果汇总
 */
export interface PolicyEvaluationSummary {
    /** 是否允许访问 */
    allowed: boolean;
    /** 各策略的评估结果 */
    results: PolicyEvaluationResult[];
    /** 拒绝原因（如果拒绝） */
    denialReason?: string;
}
/**
 * 策略引擎服务
 *
 * 负责管理和评估权限策略
 */
export declare class PolicyEngineService {
    private readonly configService;
    private readonly cacheService;
    private readonly policyFactory;
    private readonly logger;
    private readonly policies;
    private readonly policyCacheTTL;
    constructor(configService: ConfigService, cacheService: PermissionCacheService, policyFactory: PolicyFactoryService);
    /**
     * 注册策略
     */
    registerPolicy(policy: IPermissionPolicy): void;
    /**
     * 批量注册策略
     */
    registerPolicies(policies: IPermissionPolicy[]): void;
    /**
     * 创建策略实例
     */
    createPolicy(type: PolicyType, policyId: string, config: Record<string, unknown>): IPermissionPolicy;
    /**
     * 创建策略实例（不验证配置）
     */
    createPolicyUnsafe(type: PolicyType, policyId: string, config: Record<string, unknown>): IPermissionPolicy;
    /**
     * 评估单个策略
     */
    evaluatePolicy(policy: IPermissionPolicy, context: PolicyContext): Promise<PolicyEvaluationResult>;
    /**
     * 评估多个策略（AND 逻辑，所有策略都通过才允许）
     */
    evaluatePolicies(policies: IPermissionPolicy[], context: PolicyContext): Promise<PolicyEvaluationSummary>;
    /**
     * 评估多个策略（OR 逻辑，任一策略通过就允许）
     */
    evaluatePoliciesAny(policies: IPermissionPolicy[], context: PolicyContext): Promise<PolicyEvaluationSummary>;
    /**
     * 获取已注册的策略
     */
    getPolicies(): IPermissionPolicy[];
    /**
     * 根据类型获取策略
     */
    getPolicyByType(type: string): IPermissionPolicy | undefined;
    /**
     * 移除策略
     */
    removePolicy(type: string): boolean;
    /**
     * 清除所有策略
     */
    clearPolicies(): void;
    /**
     * 清除策略缓存
     */
    clearPolicyCache(policy: IPermissionPolicy): void;
    /**
     * 构建缓存键
     */
    private buildCacheKey;
    /**
     * 获取支持的策略类型
     */
    getSupportedPolicyTypes(): PolicyType[];
}
//# sourceMappingURL=policy-engine.service.d.ts.map