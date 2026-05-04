import { PolicyType } from '../enums/policy-type.enum';
import { Permission as PrismaPermission } from '@prisma/client';
/**
 * 创建策略 DTO
 */
export declare class CreatePolicyDto {
    type: PolicyType;
    name: string;
    description?: string;
    config: Record<string, unknown>;
    permissions: PrismaPermission[];
    enabled?: boolean;
    priority?: number;
}
//# sourceMappingURL=create-policy.dto.d.ts.map