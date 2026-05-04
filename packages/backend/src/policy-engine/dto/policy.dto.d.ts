import { PolicyType } from '../enums/policy-type.enum';
import { Permission as PrismaPermission } from '@prisma/client';
/**
 * 策略配置 DTO（简化负载）
 */
export declare class PolicyConfigPayloadDto {
    config: Record<string, unknown>;
}
/**
 * 策略响应 DTO
 */
export declare class PolicyResponseDto {
    id: string;
    type: PolicyType;
    name: string;
    description?: string;
    config: Record<string, unknown>;
    permissions: PrismaPermission[];
    enabled: boolean;
    priority?: number;
    createdAt: Date;
    updatedAt: Date;
}
/**
 * 策略评估结果 DTO
 */
export declare class PolicyEvaluationResultDto {
    allowed: boolean;
    reason?: string;
    policyId: string;
    policyType: string;
    evaluatedAt: Date;
}
/**
 * 策略评估汇总 DTO
 */
export declare class PolicyEvaluationSummaryDto {
    allowed: boolean;
    results: PolicyEvaluationResultDto[];
    denialReason?: string;
}
/**
 * 策略配置 Schema 属性 DTO
 */
export declare class PolicyConfigSchemaPropertyDto {
    type: string;
    description: string;
    default?: unknown;
    enum?: string[];
    minimum?: number;
    maximum?: number;
    items?: unknown;
}
/**
 * 策略配置 Schema DTO
 */
export declare class PolicyConfigSchemaDto {
    properties: Record<string, PolicyConfigSchemaPropertyDto>;
    required: string[];
}
//# sourceMappingURL=policy.dto.d.ts.map