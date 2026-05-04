import { PolicyType } from '../enums/policy-type.enum';
import { Permission as PrismaPermission } from '@prisma/client';
import { CreatePolicyDto } from './create-policy.dto';
declare const UpdatePolicyDto_base: import("@nestjs/common").Type<Partial<Omit<CreatePolicyDto, "type">>>;
/**
 * 更新策略 DTO
 */
export declare class UpdatePolicyDto extends UpdatePolicyDto_base {
    type?: PolicyType;
    name?: string;
    description?: string;
    config?: Record<string, unknown>;
    permissions?: PrismaPermission[];
    enabled?: boolean;
    priority?: number;
}
export {};
//# sourceMappingURL=update-policy.dto.d.ts.map