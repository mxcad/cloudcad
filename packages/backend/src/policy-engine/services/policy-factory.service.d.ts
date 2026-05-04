import { IPermissionPolicy } from '../interfaces/permission-policy.interface';
import { PolicyType } from '../enums/policy-type.enum';
/**
 * 策略工厂服务
 *
 * 负责策略实例的创建和配置验证。
 * 提取为独立服务以解除 PolicyConfigService 对 PolicyEngineService 的依赖。
 */
export declare class PolicyFactoryService {
    private readonly policyFactories;
    constructor();
    /**
     * 创建策略实例并验证配置
     */
    createPolicy(type: PolicyType, policyId: string, config: Record<string, unknown>): IPermissionPolicy;
    /**
     * 创建策略实例（不验证配置）
     */
    createPolicyUnsafe(type: PolicyType, policyId: string, config: Record<string, unknown>): IPermissionPolicy;
    /**
     * 获取支持的策略类型
     */
    getSupportedPolicyTypes(): PolicyType[];
}
//# sourceMappingURL=policy-factory.service.d.ts.map