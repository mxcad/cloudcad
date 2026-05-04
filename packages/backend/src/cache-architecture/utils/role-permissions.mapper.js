///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import { SystemPermission } from '../../common/enums/permissions.enum';
/**
 * 角色权限映射工具类
 * 提供系统角色到权限列表的映射关系
 */
export class RolePermissionsMapper {
    /**
     * 根据角色名称获取对应的权限列表
     * @param role 角色名称（如 ADMIN, USER）
     * @returns 权限列表
     */
    static getPermissionsByRole(role) {
        return this.rolePermissions[role] || [];
    }
    /**
     * 获取所有可用的角色名称
     * @returns 角色名称数组
     */
    static getAvailableRoles() {
        return Object.keys(this.rolePermissions);
    }
    /**
     * 检查角色是否具有指定权限
     * @param role 角色名称
     * @param permission 权限
     * @returns 是否具有该权限
     */
    static hasPermission(role, permission) {
        const permissions = this.getPermissionsByRole(role);
        return permissions.includes(permission);
    }
}
/**
 * 角色权限映射表
 */
RolePermissionsMapper.rolePermissions = {
    ADMIN: [
        SystemPermission.SYSTEM_USER_READ,
        SystemPermission.SYSTEM_USER_CREATE,
        SystemPermission.SYSTEM_USER_UPDATE,
        SystemPermission.SYSTEM_USER_DELETE,
        SystemPermission.SYSTEM_ROLE_READ,
        SystemPermission.SYSTEM_ROLE_CREATE,
        SystemPermission.SYSTEM_ROLE_UPDATE,
        SystemPermission.SYSTEM_ROLE_DELETE,
        SystemPermission.SYSTEM_ROLE_PERMISSION_MANAGE,
        SystemPermission.SYSTEM_FONT_READ,
        SystemPermission.SYSTEM_FONT_UPLOAD,
        SystemPermission.SYSTEM_FONT_DELETE,
        SystemPermission.SYSTEM_FONT_DOWNLOAD,
        SystemPermission.SYSTEM_ADMIN,
        SystemPermission.SYSTEM_MONITOR,
    ],
    USER: [],
};
//# sourceMappingURL=role-permissions.mapper.js.map