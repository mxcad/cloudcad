import { BasePolicy } from './base-policy';
import { IPermissionPolicy, PolicyContext, PolicyEvaluationResult, PolicyConfigSchema } from '../interfaces/permission-policy.interface';
/**
 * 设备策略配置
 */
export interface DevicePolicyConfig {
    /** 允许的设备类型 */
    allowedTypes: DeviceType[];
    /** 拒绝的设备类型 */
    deniedTypes?: DeviceType[];
    /** 是否允许未知设备 */
    allowUnknown?: boolean;
}
/**
 * 设备类型枚举
 */
export declare enum DeviceType {
    /** 桌面浏览器 */
    DESKTOP = "DESKTOP",
    /** 移动设备 */
    MOBILE = "MOBILE",
    /** 平板设备 */
    TABLET = "TABLET",
    /** API 客户端 */
    API_CLIENT = "API_CLIENT",
    /** 未知设备 */
    UNKNOWN = "UNKNOWN"
}
/**
 * 设备策略
 *
 * 基于设备类型的访问控制，通过 User-Agent 识别设备类型
 */
export declare class DevicePolicy extends BasePolicy implements IPermissionPolicy {
    private config;
    constructor(policyId: string, config: DevicePolicyConfig);
    getType(): string;
    getName(): string;
    getDescription(): string;
    evaluate(context: PolicyContext): Promise<PolicyEvaluationResult>;
    /**
     * 检测设备类型
     */
    private detectDeviceType;
    validateConfig(config: Record<string, unknown>): boolean;
    getConfigSchema(): PolicyConfigSchema;
}
//# sourceMappingURL=device-policy.d.ts.map