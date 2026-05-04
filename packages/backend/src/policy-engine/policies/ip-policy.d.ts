import { BasePolicy } from './base-policy';
import { IPermissionPolicy, PolicyContext, PolicyEvaluationResult, PolicyConfigSchema } from '../interfaces/permission-policy.interface';
/**
 * IP 策略配置
 */
export interface IpPolicyConfig {
    /** 允许的 IP 地址列表 */
    allowedIps: string[];
    /** 允许的 IP 范围列表（CIDR 格式，如 192.168.1.0/24） */
    allowedRanges?: string[];
    /** 拒绝的 IP 地址列表 */
    deniedIps?: string[];
    /** 拒绝的 IP 范围列表（CIDR 格式） */
    deniedRanges?: string[];
}
/**
 * IP 地址策略
 *
 * 基于 IP 地址的访问控制，支持 IP 地址和 CIDR 范围
 */
export declare class IpPolicy extends BasePolicy implements IPermissionPolicy {
    private config;
    constructor(policyId: string, config: IpPolicyConfig);
    getType(): string;
    getName(): string;
    getDescription(): string;
    evaluate(context: PolicyContext): Promise<PolicyEvaluationResult>;
    /**
     * 检查 IP 地址是否在 CIDR 范围内
     */
    private isIpInRange;
    /**
     * 将 IP 地址转换为数字
     */
    private ipToNumber;
    validateConfig(config: Record<string, unknown>): boolean;
    /**
     * 验证 IP 地址格式
     */
    private isValidIp;
    /**
     * 验证 CIDR 格式
     */
    private isValidCidr;
    getConfigSchema(): PolicyConfigSchema;
}
//# sourceMappingURL=ip-policy.d.ts.map