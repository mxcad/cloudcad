///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
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
 * 缓存配置常量
 *
 * 统一缓存 TTL 配置，确保各服务使用一致的缓存过期时间
 */

/**
 * 缓存 TTL 配置（单位：秒）
 *
 * ⚠️ 单位必须是秒：MultiLevelCacheService.set 把该值原样透传给两级 provider——
 * L1 用 `Date.now() + ttl * 1000` 换算过期时间，L2 走 Redis `SET ... EX <秒>`。
 * 历史上这里写成毫秒，导致权限缓存实际存活 1000 倍于预期（收回权限最长 3.5 天
 * 才生效），见 Gitea #468。改成秒时注释同步改，别再退回毫秒。
 */
export const CACHE_TTL = {
  /** 系统权限缓存 - 5 分钟 */
  SYSTEM_PERMISSION: 5 * 60,

  /** 用户角色缓存 - 10 分钟 */
  USER_ROLE: 10 * 60,

  /** 项目权限缓存 - 5 分钟 */
  PROJECT_PERMISSION: 5 * 60,

  /** 项目所有者缓存 - 10 分钟 */
  PROJECT_OWNER: 10 * 60,

  /** 项目成员角色缓存 - 5 分钟 */
  PROJECT_MEMBER_ROLE: 5 * 60,

  /** 角色权限缓存 - 10 分钟 */
  ROLE_PERMISSION: 10 * 60,

  /** 角色继承关系缓存 - 10 分钟 */
  ROLE_INHERITANCE: 10 * 60,

  /** 角色层级路径缓存 - 15 分钟 */
  ROLE_HIERARCHY_PATH: 15 * 60,

  /** 节点访问角色缓存 - 10 分钟 */
  NODE_ACCESS_ROLE: 10 * 60,
} as const;
