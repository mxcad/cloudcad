import { RolesService } from './roles.service';
import { ProjectRolesService } from './project-roles.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { RoleDto } from './dto/role.dto';
import { CreateProjectRoleDto } from './dto/create-project-role.dto';
import { UpdateProjectRoleDto } from './dto/update-project-role.dto';
import { PermissionsDto } from './dto/permissions.dto';
import { AuthenticatedRequest } from '../common/types/request.types';
export declare class RolesController {
    private readonly rolesService;
    private readonly projectRolesService;
    constructor(rolesService: RolesService, projectRolesService: ProjectRolesService);
    findAll(): Promise<RoleDto[]>;
    findOne(id: string): Promise<RoleDto>;
    getRolePermissions(id: string): Promise<string[]>;
    addPermissions(id: string, body: {
        permissions: string[];
    }): Promise<RoleDto>;
    removePermissions(id: string, body: {
        permissions: string[];
    }): Promise<RoleDto>;
    create(createRoleDto: CreateRoleDto): Promise<RoleDto>;
    update(id: string, updateRoleDto: UpdateRoleDto): Promise<RoleDto>;
    remove(id: string): Promise<{
        message: string;
    }>;
    getAllProjectRoles(): Promise<any[]>;
    getSystemProjectRoles(): Promise<any[]>;
    getProjectRolesByProject(projectId: string): Promise<any[]>;
    getProjectRolePermissions(id: string): Promise<import("@prisma/client").$Enums.ProjectPermission[]>;
    createProjectRole(dto: CreateProjectRoleDto, req: AuthenticatedRequest): Promise<any>;
    updateProjectRole(id: string, dto: UpdateProjectRoleDto, req: AuthenticatedRequest): Promise<any>;
    deleteProjectRole(id: string, req: AuthenticatedRequest): Promise<{
        message: string;
    }>;
    addProjectRolePermissions(id: string, body: PermissionsDto, req: AuthenticatedRequest): Promise<any>;
    removeProjectRolePermissions(id: string, body: PermissionsDto, req: AuthenticatedRequest): Promise<any>;
}
//# sourceMappingURL=roles.controller.d.ts.map