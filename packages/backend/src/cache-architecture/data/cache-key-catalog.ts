///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

/**
 * 缓存键目录（系统监控页「按模式删除」的可读单一事实源）
 *
 * 背景：本页的匹配模式此前只能手输，占位符示例写的是 `user:*` 而代码里没有这个前缀；
 * 而 Redis 库里实际住着业务缓存与基础设施键两类，混在同一 DB——管理员手输 `*`
 * 会删到 `mxcad:sess:*` 直接让全体用户登出（L2 deleteByPattern 有 5000 条上限，
 * 但仍会命中并删除会话键）。目录把两者分开，前端据此禁用 infra 条目。
 *
 * 收录范围 = 真正落在 Redis（L2）的键。进程内 Map（storage-info 的 `quota:*`）
 * 与磁盘转换产物缓存对 Redis SCAN 不可见，故不在此列。
 *
 * 本目录是缓存键的**单一事实源**：键构造（utils/cache-key.ts 的 `cacheKey`）与
 * 「按模式删除」白名单（utils/cache-pattern.guard.ts）都从这里派生，
 * 新增或改前缀只改本文件一处。
 */

/** 键归属：cache = 业务缓存（删除仅回源重建）；infra = 基础设施（删除有全局副作用） */
export type CacheKeyScope = 'cache' | 'infra';

export interface CacheKeyCatalogEntry {
  /** 稳定标识（前端关联用，勿改） */
  id: string;
  /** 可读名称（中文，面向运维人员） */
  name: string;
  /** Redis glob 匹配模式（`*` 可跨越 `:` 分段）；同时也是 `cacheKey` 的键模板 */
  pattern: string;
  /** 存的是什么 */
  description: string;
  /** 归属层级 */
  scope: CacheKeyScope;
  /** 删除后的实际后果 */
  removalEffect: string;
  /** TTL 说明 */
  ttl: string;
  /** 真实存在的键示例 */
  example: string;
}

export const CACHE_KEY_CATALOG: CacheKeyCatalogEntry[] = [
  // ── 业务缓存：删除仅触发回源重建，无副作用 ──────────────────────────
  {
    id: 'user_permissions',
    name: '用户系统权限集合',
    pattern: 'user:permissions:*',
    description:
      '某用户在系统中拥有的系统权限列表（PermissionCacheService 写入）',
    scope: 'cache',
    removalEffect: '下次权限判断回源数据库重建，用户无感知',
    ttl: '5 分钟（+0~5 分钟随机抖动）',
    example: 'user:permissions:12',
  },
  {
    id: 'user',
    name: '用户资料',
    pattern: 'user:*',
    description:
      '用户基础资料缓存。⚠️ glob 的 `*` 会跨越 `:` 分段，`user:*` 同时命中 `user:permissions:*`，一次清掉全部用户的资料与权限缓存（无基础设施键共享该前缀）',
    scope: 'cache',
    removalEffect:
      '下次资料读取/权限判断回源数据库重建，用户无感知；但影响所有用户',
    ttl: '5 分钟（+0~5 分钟随机抖动）',
    example: 'user:12',
  },
  {
    id: 'project_permissions',
    name: '项目权限',
    pattern: 'project:permissions:*',
    description: '某项目的权限集合缓存',
    scope: 'cache',
    removalEffect: '回源数据库重建，用户无感知',
    ttl: '5 分钟（+0~5 分钟随机抖动）',
    example: 'project:permissions:34',
  },
  {
    id: 'project',
    name: '项目资料',
    pattern: 'project:*',
    description:
      '项目相关缓存。`project:*` 会同时命中 `project:permissions:*`、`project:permission:*`、`project:owner:*`、`project:role:*`',
    scope: 'cache',
    removalEffect: '回源数据库重建，用户无感知',
    ttl: '5~10 分钟（按条目不同）',
    example: 'project:34',
  },
  {
    id: 'project_permission',
    name: '用户单条项目权限',
    pattern: 'project:permission:*:*:*',
    description:
      '某个用户在某个项目上对某个权限位的判定结果（userId:projectId:permission）',
    scope: 'cache',
    removalEffect: '回源数据库重建，用户无感知',
    ttl: '5 分钟',
    example: 'project:permission:12:34:FILE_VIEW',
  },
  {
    id: 'project_owner',
    name: '项目所有者关系',
    pattern: 'project:owner:*:*',
    description: '某用户在某项目上是否为所有者',
    scope: 'cache',
    removalEffect: '回源数据库重建，用户无感知',
    ttl: '10 分钟',
    example: 'project:owner:12:34',
  },
  {
    id: 'project_role',
    name: '用户在项目中的角色',
    pattern: 'project:role:*:*',
    description: '某用户在某项目中的成员角色',
    scope: 'cache',
    removalEffect: '回源数据库重建，用户无感知',
    ttl: '5 分钟',
    example: 'project:role:12:34',
  },
  {
    id: 'role_permissions',
    name: '角色权限集合',
    pattern: 'role:permissions:*',
    description: '某角色拥有的权限列表（改角色权限后应清此项）',
    scope: 'cache',
    removalEffect: '回源数据库重建，用户无感知',
    ttl: '10 分钟',
    example: 'role:permissions:ADMIN',
  },
  {
    id: 'role_path',
    name: '角色层级路径',
    pattern: 'role:path:*',
    description: '角色继承关系的层级路径缓存',
    scope: 'cache',
    removalEffect: '回源数据库重建，用户无感知',
    ttl: '15 分钟',
    example: 'role:path:ADMIN',
  },
  {
    id: 'role',
    name: '角色资料',
    pattern: 'role:*',
    description:
      '角色相关缓存。`role:*` 会同时命中 `role:permissions:*`、`role:path:*`',
    scope: 'cache',
    removalEffect: '回源数据库重建，用户无感知',
    ttl: '10~15 分钟',
    example: 'role:ADMIN',
  },
  {
    id: 'system_perm',
    name: '用户单条系统权限',
    pattern: 'system_perm:*:*',
    description: '某用户对某系统权限位（如 SYSTEM_ADMIN）的判定结果',
    scope: 'cache',
    removalEffect: '回源数据库重建，用户无感知',
    ttl: '5 分钟',
    example: 'system_perm:12:SYSTEM_ADMIN',
  },
  {
    id: 'system_perms',
    name: '用户系统权限全量',
    pattern: 'system_perms:*',
    description: '某用户的全部系统权限列表（注意是复数，与 system_perm 不同）',
    scope: 'cache',
    removalEffect: '回源数据库重建，用户无感知',
    ttl: '5 分钟',
    example: 'system_perms:12',
  },
  {
    id: 'is_admin',
    name: '用户管理员标记',
    pattern: 'is_admin:*',
    description: '某用户是否为管理员的判定结果',
    scope: 'cache',
    removalEffect: '回源数据库重建，用户无感知',
    ttl: '5 分钟',
    example: 'is_admin:12',
  },
  {
    id: 'wechat_access_token',
    name: '微信 access_token',
    pattern: 'wechat:access_token:*',
    description: '微信开放平台 access_token 及其并发锁（含 `:lock` 后缀）',
    scope: 'cache',
    removalEffect: '下次使用时重新向微信换取，无业务影响',
    ttl: '10 分钟（锁 15 秒）',
    example: 'wechat:access_token:wx_appid:token',
  },

  // ── 基础设施：与业务缓存同库，删除有全局副作用，页面禁用 ────────────
  {
    id: 'session',
    name: '登录会话',
    pattern: 'mxcad:sess:*',
    description:
      'express-session 会话存储（connect-redis，前缀由 main.ts 写死为 mxcad:sess:）',
    scope: 'infra',
    removalEffect: '⚠️ 删除后对应用户立即登出，全部删除等于全体强制下线',
    ttl: '24 小时（SESSION_MAX_AGE）',
    example: 'mxcad:sess:sXyzAbC…',
  },
  {
    id: 'ratelimit',
    name: '接口限流计数',
    pattern: 'ratelimit:*',
    description:
      'RateLimitGuard 的滑动窗口计数（Redis zset，按路由+调用方分桶）',
    scope: 'infra',
    removalEffect: '⚠️ 限流计数清零，登录等接口的暴力破解防护立即失效',
    ttl: '24 小时',
    example: 'ratelimit:/api/v1/auth/login',
  },
  {
    id: 'ip_blacklist_exact',
    name: 'IP 黑名单缓存（精确 IP）',
    pattern: 'ip-blacklist:exact',
    description: '精确 IP 黑名单的 Redis hash 缓存（单个键，field 为 IP）',
    scope: 'infra',
    removalEffect: '⚠️ 黑名单判定回源数据库重建，重建前判定为空',
    ttl: '5 分钟',
    example: 'ip-blacklist:exact',
  },
  {
    id: 'ip_blacklist_cidr',
    name: 'IP 黑名单缓存（网段）',
    pattern: 'ip-blacklist:cidr',
    description: 'CIDR 网段黑名单的 Redis hash 缓存（单个键）',
    scope: 'infra',
    removalEffect: '⚠️ 同精确 IP 项，重建前网段判定为空',
    ttl: '5 分钟',
    example: 'ip-blacklist:cidr',
  },
  {
    id: 'cache_version',
    name: '缓存版本号',
    pattern: 'cache:version:*',
    description:
      'MultiLevelCacheService 的版本控制键（含 cache:version:lock:* 分布式锁）',
    scope: 'infra',
    removalEffect: '⚠️ 缓存版本控制失效；该机制默认未启用，通常无实际条目',
    ttl: '跟随版本最大有效期',
    example: 'cache:version:USER_PERMISSIONS:12',
  },
  {
    id: 'token_blacklist',
    name: 'Token 登出名单',
    pattern: 'token:blacklist:*',
    description:
      'TokenBlacklistService 按完整 JWT 字符串写入的已吊销 token 标记（键为 token:blacklist:<完整 JWT>，值恒为 "1"）',
    scope: 'infra',
    removalEffect: '⚠️ 对应 token 恢复有效，登出与改密后的旧 token 仍可访问',
    ttl: '7 天（CACHE_TTL_TOKEN_BLACKLIST），或写入时按 token 自身剩余有效期',
    example: 'token:blacklist:eyJhbGciOiJIUzI1NiJ9...',
  },
  {
    id: 'sms_verification',
    name: '短信验证码与发送计数',
    pattern: 'sms_verification:*',
    description:
      'SmsVerificationService 写下的短信验证码（code）、发送间隔标记（rate_limit）、当日发送次数（daily_count）与 IP 小时计数（ip_hourly_count），同一 DB 经 ioredis 直写',
    scope: 'infra',
    removalEffect: '⚠️ 已发验证码立即作废，短信发送频率与日限计数清零',
    ttl:
      '验证码 15 分钟（CACHE_TTL_VERIFICATION_CODE）/ 间隔 1 分钟 / 日计与 IP 计数至次日',
    example: 'sms_verification:code:13800138000',
  },
  {
    id: 'register_pending',
    name: '待验证注册账户',
    pattern: 'register:pending:*',
    description:
      'RegistrationService 写入的待邮箱验证注册数据（含明文密码与微信授权信息，键为 register:pending:<email>）',
    scope: 'infra',
    removalEffect:
      '⚠️ 待验证用户无法完成注册；邮箱验证码与注册数据错配',
    ttl: '15 分钟',
    example: 'register:pending:user@example.com',
  },
];

/**
 * 前缀收口状态（#471）：
 * - 键构造统一走 `utils/cache-key.ts` 的 `cacheKey(id, ...parts)`，
 *   pattern 即键模板（连续 `*`/`?` 段按序填参），构造与删除共用同一份 pattern；
 *   旧的 `utils/cache-key.utils.ts`（11 值枚举其中 7 个零引用、19 个 builder 仅 5 处调用）已删除。
 * - 已收口：`permission-cache.service` 的用户/项目/角色权限失效清理。
 * - 未收口：auth 侧（token 黑名单、短信验证码、待验证注册）与各业务写入点仍用内联手写前缀。
 *   它们已在本目录登记，因此监控页可见、也受「按模式删除」守卫保护；
 *   新增写入点请同步登记条目，否则该键既不可按模式删除、也不在监控页可见。
 */
