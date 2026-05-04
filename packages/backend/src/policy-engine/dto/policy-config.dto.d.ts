import { PolicyType } from '../enums/policy-type.enum';
import { Permission as PrismaPermission } from '@prisma/client';
/**
 * 策略配置 DTO
 *
 * 用于策略配置的传输和验证
 */
export declare class PolicyConfigDto {
    type: PolicyType;
    name: string;
    description?: string;
    config: Record<string, unknown>;
    permissions: PrismaPermission[];
    enabled?: boolean;
    priority?: number;
}
/**
 * 策略配置列表 DTO
 */
export declare class PolicyConfigListDto {
    policies: PolicyConfigDto[];
    total: number;
}
/**
 * 策略配置统计 DTO
 */
export declare class PolicyConfigStatsDto {
    total: number;
    enabled: number;
    disabled: number;
    byType: Record<string, number>;
}
//# sourceMappingURL=policy-config.dto.d.ts.map