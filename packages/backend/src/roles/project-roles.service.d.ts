import { DatabaseService } from '../database/database.service';
import { ProjectPermission } from '../common/enums/permissions.enum';
export interface CreateProjectRoleDto {
    projectId?: string;
    name: string;
    description?: string;
    permissions: string[];
}
export interface UpdateProjectRoleDto {
    name?: string;
    description?: string;
    permissions?: string[];
}
/**
 * 项目角色服务
 * 管理项目角色和权限分配
 */
export declare class ProjectRolesService {
    private readonly prisma;
    private readonly logger;
    constructor(prisma: DatabaseService);
    /**
     * 创建系统默认角色（仅在系统初始化时调用一次）
     */
    createSystemDefaultRoles(): Promise<void>;
    /**
     * 创建项目角色
     */
    create(dto: CreateProjectRoleDto, userId?: string): Promise<any>;
    /**
     * 更新项目角色
     */
    update(roleId: string, dto: UpdateProjectRoleDto, userId?: string): Promise<any>;
    /**
     * 删除项目角色
     */
    delete(roleId: string, userId?: string): Promise<void>;
    /**
     * 获取所有项目角色
     */
    findAll(): Promise<any[]>;
    /**
     * 获取项目角色详情
     */
    findOne(roleId: string): Promise<any>;
    /**
     * 获取特定项目的角色列表
     */
    findByProject(projectId: string): Promise<any[]>;
    /**
     * 获取系统默认项目角色列表（仅返回 isSystem=true 的角色）
     */
    findSystemRoles(): Promise<any[]>;
    /**
     * 获取角色的所有权限
     */
    getRolePermissions(roleId: string): Promise<ProjectPermission[]>;
    /**
     * 为角色分配权限
     */
    assignPermissions(roleId: string, permissions: string[], // 接受 string[]，内部转换
    userId?: string): Promise<void>;
    /**
     * 移除角色权限
     */
    removePermissions(roleId: string, permissions: string[], // 接受 string[]，内部转换
    userId?: string): Promise<void>;
    /**
     * 更新角色权限（替换所有权限）
     */
    updatePermissions(roleId: string, permissions: string[]): Promise<void>;
}
//# sourceMappingURL=project-roles.service.d.ts.map