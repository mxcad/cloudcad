import { DatabaseService } from '../../database/database.service';
import { SystemPermission } from '../enums/permissions.enum';
import { PermissionCacheService } from './permission-cache.service';
import { RoleInheritanceService } from './role-inheritance.service';
import { PermissionContext } from '../utils/permission.utils';
import { PolicyConfigService } from '../../policy-engine/services/policy-config.service';
import { PolicyEngineService } from '../../policy-engine/services/policy-engine.service';
import { IPermissionStore } from '../interfaces/permission-store.interface';
export interface Role {
    id: string;
    name: string;
    description?: string;
    category?: string;
    isSystem: boolean;
    permissions?: {
        permission: SystemPermission;
    }[];
}
export interface UserWithPermissions {
    id: string;
    email: string;
    username: string;
    nickname?: string;
    avatar?: string;
    role: Role;
    status: string;
}
/**
 * 系统权限检查服务
 *
 * 功能：
 * 1. 检查用户是否具有指定系统权限
 * 2. 支持系统权限缓存优化性能
 * 3. 支持上下文感知的权限检查
 */
export declare class PermissionService {
    private readonly prisma;
    private readonly cacheService;
    private readonly roleInheritanceService;
    private readonly permissionStore?;
    private readonly policyConfigService?;
    private readonly policyEngineService?;
    private readonly logger;
    constructor(prisma: DatabaseService, cacheService: PermissionCacheService, roleInheritanceService: RoleInheritanceService, permissionStore?: IPermissionStore | undefined, policyConfigService?: PolicyConfigService | undefined, policyEngineService?: PolicyEngineService | undefined);
    /**
     * 系统权限检查入口
     *
     * @param userId 用户 ID
     * @param permission 系统权限
     * @returns 是否具有权限
     */
    checkSystemPermission(userId: string, permission: SystemPermission): Promise<boolean>;
    /**
     * 检查用户是否为系统管理员
     */
    private isSystemAdmin;
    /**
     * 检查用户的系统权限（支持角色继承）
     */
    private checkUserSystemPermission;
    /**
     * 获取用户的系统权限（包括继承的权限）
     */
    getUserPermissions(user: UserWithPermissions): Promise<SystemPermission[]>;
    /**
     * 检查用户是否具有指定角色
     */
    hasRole(user: UserWithPermissions, roleNames: string[]): boolean;
    /**
     * 支持上下文的权限检查
     *
     * 在基础权限检查的基础上，增加上下文感知的额外验证
     *
     * @param userId 用户 ID
     * @param permission 系统权限
     * @param context 上下文信息
     * @returns 是否具有权限
     */
    checkSystemPermissionWithContext(userId: string, permission: SystemPermission, context: PermissionContext): Promise<boolean>;
    /**
     * 检查上下文规则
     *
     * 使用策略引擎评估动态权限策略
     *
     * @returns 是否通过上下文规则检查
     */
    private checkContextRules;
    /**
     * 旧的硬编码上下文规则（向后兼容）
     *
     * @deprecated 使用策略引擎替代
     */
    private checkLegacyContextRules;
    /**
     * 检查 IP 地址白名单
     */
    private checkIpAddressWhitelist;
    /**
     * 检查设备限制
     */
    private checkDeviceRestriction;
    /**
     * 清除用户权限缓存
     */
    clearUserCache(userId: string): Promise<void>;
    /**
     * 批量检查系统权限
     *
     * @param userId 用户ID
     * @param permissions 需要检查的权限列表
     * @returns 权限检查结果映射（权限 -> 是否有权限）
     */
    checkSystemPermissionsBatch(userId: string, permissions: SystemPermission[]): Promise<Map<SystemPermission, boolean>>;
}
//# sourceMappingURL=permission.service.d.ts.map