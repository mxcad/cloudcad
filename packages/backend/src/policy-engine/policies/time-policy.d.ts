import { BasePolicy } from './base-policy';
import { IPermissionPolicy, PolicyContext, PolicyEvaluationResult, PolicyConfigSchema } from '../interfaces/permission-policy.interface';
/**
 * 时间策略配置
 */
export interface TimePolicyConfig {
    /** 允许的时间段（开始时间，格式：HH:mm） */
    startTime: string;
    /** 允许的时间段（结束时间，格式：HH:mm） */
    endTime: string;
    /** 允许的工作日（0=周日, 1=周一, ..., 6=周六） */
    allowedDays?: number[];
    /** 时区（默认为系统时区） */
    timezone?: string;
}
/**
 * 时间策略
 *
 * 基于时间段的访问控制，可以配置允许访问的时间范围和工作日
 */
export declare class TimePolicy extends BasePolicy implements IPermissionPolicy {
    private config;
    constructor(policyId: string, config: TimePolicyConfig);
    getType(): string;
    getName(): string;
    getDescription(): string;
    evaluate(context: PolicyContext): Promise<PolicyEvaluationResult>;
    /**
     * 解析时间字符串（格式：HH:mm）
     */
    private parseTime;
    validateConfig(config: Record<string, unknown>): boolean;
    getConfigSchema(): PolicyConfigSchema;
}
//# sourceMappingURL=time-policy.d.ts.map