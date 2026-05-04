/**
 * 缓存配置常量
 *
 * 统一缓存 TTL 配置，确保各服务使用一致的缓存过期时间
 */
/**
 * 缓存 TTL 配置（单位：毫秒）
 */
export declare const CACHE_TTL: {
    /** 系统权限缓存 - 5 分钟 */
    readonly SYSTEM_PERMISSION: number;
    /** 用户角色缓存 - 10 分钟 */
    readonly USER_ROLE: number;
    /** 项目权限缓存 - 5 分钟 */
    readonly PROJECT_PERMISSION: number;
    /** 项目所有者缓存 - 10 分钟 */
    readonly PROJECT_OWNER: number;
    /** 项目成员角色缓存 - 5 分钟 */
    readonly PROJECT_MEMBER_ROLE: number;
    /** 角色权限缓存 - 10 分钟 */
    readonly ROLE_PERMISSION: number;
    /** 角色继承关系缓存 - 10 分钟 */
    readonly ROLE_INHERITANCE: number;
    /** 角色层级路径缓存 - 15 分钟 */
    readonly ROLE_HIERARCHY_PATH: number;
    /** 节点访问角色缓存 - 10 分钟 */
    readonly NODE_ACCESS_ROLE: number;
};
/**
 * 缓存键前缀
 */
export declare const CACHE_KEY_PREFIX: {
    /** 系统权限前缀 */
    readonly SYSTEM_PERMISSION: "system_perm";
    /** 用户权限前缀 */
    readonly USER_PERMISSIONS: "user_permissions";
    /** 项目权限前缀 */
    readonly PROJECT_PERMISSIONS: "project_permissions";
    /** 角色权限前缀 */
    readonly ROLE_PERMISSIONS: "role_permissions";
    /** 项目所有者前缀 */
    readonly PROJECT_OWNER: "project_owner";
    /** 项目成员角色前缀 */
    readonly PROJECT_MEMBER_ROLE: "project_role";
};
/**
 * 缓存事件频道前缀
 */
export declare const CACHE_CHANNEL_PREFIX: {
    /** 权限缓存失效事件前缀 */
    readonly PERMISSION: "permission:cache:invalidation";
};
//# sourceMappingURL=cache.constants.d.ts.map