import { Logger } from '@nestjs/common';
import { IPermissionPolicy, PolicyConfigSchema, PolicyContext, PolicyEvaluationResult } from '../interfaces/permission-policy.interface';
/**
 * 权限策略基类
 *
 * 提供策略的通用实现，子类只需实现特定的评估逻辑
 */
export declare abstract class BasePolicy implements IPermissionPolicy {
    protected readonly logger: Logger;
    protected readonly policyId: string;
    constructor(policyId: string);
    /**
     * 获取策略 ID
     */
    getPolicyId(): string;
    /**
     * 获取策略类型（子类必须实现）
     */
    abstract getType(): string;
    /**
     * 获取策略名称（子类必须实现）
     */
    abstract getName(): string;
    /**
     * 获取策略描述（子类必须实现）
     */
    abstract getDescription(): string;
    /**
     * 评估策略（子类必须实现）
     */
    abstract evaluate(context: PolicyContext): Promise<PolicyEvaluationResult>;
    /**
     * 验证策略配置（子类可以重写）
     */
    validateConfig(config: Record<string, unknown>): boolean;
    /**
     * 验证属性类型
     */
    private validatePropertyType;
    /**
     * 获取策略配置 schema（子类必须实现）
     */
    abstract getConfigSchema(): PolicyConfigSchema;
    /**
     * 创建允许的评估结果
     */
    protected createAllowedResult(): PolicyEvaluationResult;
    /**
     * 创建拒绝的评估结果
     */
    protected createDeniedResult(reason: string): PolicyEvaluationResult;
}
//# sourceMappingURL=base-policy.d.ts.map