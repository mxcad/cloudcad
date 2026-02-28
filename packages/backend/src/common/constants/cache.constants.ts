/**
 * 缓存配置常量
 *
 * 统一缓存 TTL 配置，确保各服务使用一致的缓存过期时间
 */

/**
 * 缓存 TTL 配置（单位：毫秒）
 */
export const CACHE_TTL = {
  /** 系统权限缓存 - 5 分钟 */
  SYSTEM_PERMISSION: 5 * 60 * 1000,

  /** 用户角色缓存 - 10 分钟 */
  USER_ROLE: 10 * 60 * 1000,

  /** 项目权限缓存 - 5 分钟 */
  PROJECT_PERMISSION: 5 * 60 * 1000,

  /** 项目所有者缓存 - 10 分钟 */
  PROJECT_OWNER: 10 * 60 * 1000,

  /** 项目成员角色缓存 - 5 分钟 */
  PROJECT_MEMBER_ROLE: 5 * 60 * 1000,

  /** 角色权限缓存 - 10 分钟 */
  ROLE_PERMISSION: 10 * 60 * 1000,

  /** 角色继承关系缓存 - 10 分钟 */
  ROLE_INHERITANCE: 10 * 60 * 1000,

  /** 角色层级路径缓存 - 15 分钟 */
  ROLE_HIERARCHY_PATH: 15 * 60 * 1000,

  /** 节点访问角色缓存 - 10 分钟 */
  NODE_ACCESS_ROLE: 10 * 60 * 1000,
} as const;

/**
 * 缓存键前缀
 */
export const CACHE_KEY_PREFIX = {
  /** 系统权限前缀 */
  SYSTEM_PERMISSION: 'system_perm',

  /** 用户权限前缀 */
  USER_PERMISSIONS: 'user_permissions',

  /** 项目权限前缀 */
  PROJECT_PERMISSIONS: 'project_permissions',

  /** 角色权限前缀 */
  ROLE_PERMISSIONS: 'role_permissions',

  /** 项目所有者前缀 */
  PROJECT_OWNER: 'project_owner',

  /** 项目成员角色前缀 */
  PROJECT_MEMBER_ROLE: 'project_role',
} as const;

/**
 * 缓存事件频道前缀
 */
export const CACHE_CHANNEL_PREFIX = {
  /** 权限缓存失效事件前缀 */
  PERMISSION: 'permission:cache:invalidation',
} as const;
