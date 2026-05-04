import { ProjectRole } from '../../common/enums/permissions.enum';
/**
 * 项目角色映射工具类
 * 提供数据库角色名称到项目访问角色的映射关系
 */
export declare class ProjectRoleMapper {
    /**
     * 角色名称映射表
     * 将数据库中的角色名称映射到项目访问角色
     */
    private static readonly roleMap;
    /**
     * 将数据库角色名称映射到项目访问角色
     * @param roleName 数据库中的角色名称（如 PROJECT_OWNER, PROJECT_ADMIN）
     * @returns 项目访问角色
     */
    static mapRoleToAccessRole(roleName: string): ProjectRole;
    /**
     * 获取所有可用的数据库角色名称
     * @returns 角色名称数组
     */
    static getAvailableDatabaseRoles(): string[];
    /**
     * 获取所有可用的项目访问角色
     * @returns 项目访问角色数组
     */
    static getAvailableAccessRoles(): ProjectRole[];
    /**
     * 检查数据库角色是否存在
     * @param roleName 数据库角色名称
     * @returns 是否存在
     */
    static hasDatabaseRole(roleName: string): boolean;
}
//# sourceMappingURL=project-role.mapper.d.ts.map