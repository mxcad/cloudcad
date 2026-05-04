import { OnModuleInit } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { SystemRole, SystemPermission } from '../enums/permissions.enum';
import { PermissionCacheService } from './permission-cache.service';
/**
 * 角色层级节点接口
 */
export interface RoleHierarchyNode {
    id: string;
    name: string;
    description?: string;
    category: string;
    level: number;
    isSystem: boolean;
    children: RoleHierarchyNode[];
}
/**
 * 角色继承服务
 *
 * 功能：
 * 1. 获取角色的所有权限（包括继承的权限）
 * 2. 检查角色是否继承自另一个角色
 * 3. 获取角色层级路径
 * 4. 缓存角色继承关系优化性能
 */
export declare class RoleInheritanceService implements OnModuleInit {
    private readonly prisma;
    private readonly cacheService;
    private readonly logger;
    private static readonly MAX_HIERARCHY_DEPTH;
    constructor(prisma: DatabaseService, cacheService: PermissionCacheService);
    /**
     * 获取角色的所有权限（包括继承的权限）
     * 使用 Prisma ORM 递归查询
     *
     * @param roleName 角色名称
     * @returns 角色拥有的所有权限（包括从父角色继承的权限）
     */
    getRolePermissions(roleName: SystemRole): Promise<SystemPermission[]>;
    /**
     * 强制刷新角色权限缓存（清除缓存后重新获取）
     */
    forceRefreshRolePermissions(roleName: SystemRole): Promise<SystemPermission[]>;
    /**
     * 递归收集角色及其所有祖先角色的 ID
     */
    private collectRoleAncestors;
    /**
     * 检查角色是否继承自另一个角色
     *
     * @param childRoleName 子角色名称
     * @param parentRoleName 父角色名称
     * @returns 是否继承自该父角色
     */
    isInheritedFrom(childRoleName: SystemRole, parentRoleName: SystemRole): Promise<boolean>;
    /**
     * 递归收集角色及其所有祖先角色的名称
     */
    private collectAncestorNames;
    /**
     * 获取角色层级路径
     *
     * @param roleName 角色名称
     * @returns 从根角色到当前角色的路径（数组）
     */
    getRoleHierarchyPath(roleName: SystemRole): Promise<string[]>;
    /**
     * 检查用户是否具有指定权限（考虑角色继承）
     *
     * @param userId 用户ID
     * @param permission 系统权限
     * @returns 是否具有权限
     */
    checkUserPermissionWithInheritance(userId: string, permission: SystemPermission): Promise<boolean>;
    /**
     * 清除角色权限缓存
     *
     * @param roleName 角色名称
     */
    clearRoleCache(roleName: SystemRole): Promise<void>;
    /**
     * 递归清除角色权限缓存（包括所有子角色）
     *
     * @param roleName 角色名称
     */
    clearRoleCacheRecursive(roleName: SystemRole): Promise<void>;
    /**
     * 获取所有角色的层级关系
     *
     * @returns 角色层级关系树
     */
    getRoleHierarchyTree(): Promise<RoleHierarchyNode[]>;
    /**
     * 递归构建层级节点
     */
    private buildHierarchyNode;
    /**
     * 初始化系统角色层级关系
     *
     * 根据 SYSTEM_ROLE_HIERARCHY 枚举建立角色层级关系
     * 使用事务确保所有更新原子性
     */
    initializeRoleHierarchy(): Promise<void>;
    /**
     * 模块初始化时预热缓存（异步执行，不阻塞启动）
     */
    onModuleInit(): Promise<void>;
    /**
     * 异步预热缓存（后台执行）
     */
    private warmupCacheAsync;
    /**
     * 清除所有活跃用户的权限缓存
     */
    private clearAllActiveUsersCache;
}
//# sourceMappingURL=role-inheritance.service.d.ts.map