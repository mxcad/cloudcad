import { DatabaseService } from '../database/database.service';
import { ProjectPermission, ProjectRole } from '../common/enums/permissions.enum';
import { ProjectRolesService } from './project-roles.service';
import { PermissionCacheService } from '../common/services/permission-cache.service';
import { IPermissionStore } from '../common/interfaces/permission-store.interface';
/**
 * 项目权限检查服务
 * 与系统权限完全解耦，专注于项目内的权限控制
 */
export declare class ProjectPermissionService {
    private readonly prisma;
    private readonly projectRolesService;
    private readonly cacheService;
    private readonly permissionStore?;
    private readonly logger;
    constructor(prisma: DatabaseService, projectRolesService: ProjectRolesService, cacheService: PermissionCacheService, permissionStore?: IPermissionStore | undefined);
    /**
     * 检查用户在项目中的权限
     *
     * @param userId 用户ID
     * @param projectId 项目ID
     * @param permission 需要检查的项目权限
     * @returns 是否具有权限
     */
    checkPermission(userId: string, projectId: string, permission: ProjectPermission): Promise<boolean>;
    /**
     * 检查用户是否为项目所有者
     */
    isProjectOwner(userId: string, projectId: string): Promise<boolean>;
    /**
     * 检查用户的项目角色权限
     * 优化后：先从缓存获取用户所有权限，避免 N+1 查询
     */
    private checkRolePermission;
    /**
     * 获取用户在项目中的所有权限
     * 所有用户都基于实际权限查询，包括项目所有者
     */
    getUserPermissions(userId: string, projectId: string): Promise<ProjectPermission[]>;
    /**
     * 获取用户在项目中的角色
     */
    getUserRole(userId: string, projectId: string): Promise<ProjectRole | null>;
    /**
     * 检查用户是否具有指定角色
     */
    hasRole(userId: string, projectId: string, roleNames: ProjectRole[]): Promise<boolean>;
    /**
     * 检查用户是否为项目成员
     */
    isProjectMember(userId: string, projectId: string): Promise<boolean>;
    /**
     * 清除用户的项目权限缓存
     *
     * 缓存键命名规范：
     * - project:owner:${userId}:${projectId} - 项目所有者缓存
     * - project:role:${userId}:${projectId} - 项目成员角色缓存（与系统角色缓存 role:user:${userId} 保持一致）
     * - project:permission:${userId}:${projectId}:${permission} - 项目权限缓存
     */
    clearUserCache(userId: string, projectId: string): Promise<void>;
    /**
     * 批量检查权限（多个权限，OR 逻辑）
     * 只要有一个权限就返回 true
     * 优化后：使用并行检查提升性能
     * 所有用户都基于权限验证，包括项目所有者
     */
    checkAnyPermission(userId: string, projectId: string, permissions: ProjectPermission[]): Promise<boolean>;
    /**
     * 批量检查权限（多个权限，AND 逻辑）
     * 必须所有权限都满足才返回 true
     * 优化后：使用并行检查提升性能
     * 所有用户都基于权限验证，包括项目所有者
     */
    checkAllPermissions(userId: string, projectId: string, permissions: ProjectPermission[]): Promise<boolean>;
}
//# sourceMappingURL=project-permission.service.d.ts.map