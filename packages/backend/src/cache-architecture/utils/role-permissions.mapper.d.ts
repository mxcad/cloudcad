import { SystemPermission } from '../../common/enums/permissions.enum';
/**
 * 角色权限映射工具类
 * 提供系统角色到权限列表的映射关系
 */
export declare class RolePermissionsMapper {
    /**
     * 角色权限映射表
     */
    private static readonly rolePermissions;
    /**
     * 根据角色名称获取对应的权限列表
     * @param role 角色名称（如 ADMIN, USER）
     * @returns 权限列表
     */
    static getPermissionsByRole(role: string): SystemPermission[];
    /**
     * 获取所有可用的角色名称
     * @returns 角色名称数组
     */
    static getAvailableRoles(): string[];
    /**
     * 检查角色是否具有指定权限
     * @param role 角色名称
     * @param permission 权限
     * @returns 是否具有该权限
     */
    static hasPermission(role: string, permission: SystemPermission): boolean;
}
//# sourceMappingURL=role-permissions.mapper.d.ts.map