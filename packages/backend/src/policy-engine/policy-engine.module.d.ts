import { PolicyEngineService } from './services/policy-engine.service';
import { PolicyConfigService } from './services/policy-config.service';
/**
 * 策略引擎模块
 *
 * 提供动态权限策略功能
 */
export declare class PolicyEngineModule {
    private readonly policyEngine;
    private readonly policyConfig;
    constructor(policyEngine: PolicyEngineService, policyConfig: PolicyConfigService);
    /**
     * 注册默认策略
     */
    private registerDefaultPolicies;
}
//# sourceMappingURL=policy-engine.module.d.ts.map