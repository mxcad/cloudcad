import { RoleCategory } from '../../common/enums/permissions.enum';
import { ProjectPermission } from '../../common/dto/permission.dto';
export declare class RoleDto {
    id: string;
    name: string;
    description?: string;
    category: RoleCategory;
    level: number;
    isSystem: boolean;
    permissions: string[];
    createdAt: Date;
    updatedAt: Date;
}
/**
 * 项目角色权限 DTO
 */
export declare class ProjectRolePermissionDto {
    id: string;
    projectRoleId: string;
    permission: ProjectPermission;
    createdAt: Date;
}
/**
 * 项目角色 DTO
 */
export declare class ProjectRoleDto {
    id: string;
    projectId?: string;
    name: string;
    description?: string;
    isSystem: boolean;
    permissions: ProjectRolePermissionDto[];
    _count?: {
        members: number;
    };
    project?: {
        id: string;
        name: string;
    };
    createdAt: Date;
    updatedAt: Date;
}
//# sourceMappingURL=role.dto.d.ts.map