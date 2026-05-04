import { RoleCategory } from '../../common/enums/permissions.enum';
export declare class CreateRoleDto {
    name: string;
    description?: string;
    category?: RoleCategory;
    level?: number;
    permissions: string[];
}
//# sourceMappingURL=create-role.dto.d.ts.map