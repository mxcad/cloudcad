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
 * 设备授权流常量
 */

/**
 * 合法 CLIENT_ID 白名单
 */
export const CLIENT_ID_WHITELIST: ReadonlySet<string> = new Set([
  'mx_cad_viewer',
  'mxcad_fast_view',
  'mx_cad_editor',
]);

/**
 * 设备码过期时间（秒）
 */
export const DEVICE_CODE_EXPIRES_IN = 300;

/**
 * EXE 轮询节奏建议值（秒），0.3 = 每 300ms 发一次请求。
 * 这是唯一的节奏定义处；device-auth.controller.ts 的 @Throttle 只是兜底保护，
 * 必须保持高于此值对应的请求率，否则客户端按此间隔轮询自己就会撞 429（见那里）。
 * 授权确认在后端是瞬时状态切换（Redis HSET），间隔只影响 EXE 拿到 token 的
 * 等待时间，不影响服务端代价。
 * 注意单位是秒不是毫秒：EXE 侧用 interval * 1000。
 */
export const DEVICE_CODE_POLL_INTERVAL = 0.3;

/**
 * Redis Key 前缀
 */
export const REDIS_KEY_PREFIX = 'device_auth:';

/**
 * 设备码主数据 Redis Key
 */
export const deviceAuthKey = (deviceCode: string): string =>
  `${REDIS_KEY_PREFIX}${deviceCode}`;

/**
 * 用户码→设备码反向索引 Redis Key
 */
export const deviceAuthUserCodeKey = (userCode: string): string =>
  `${REDIS_KEY_PREFIX}user_code:${userCode}`;

/**
 * 设备码状态
 */
export const DEVICE_AUTH_STATUS = {
  PENDING: 'PENDING',
  AUTHORIZED: 'AUTHORIZED',
  EXPIRED: 'EXPIRED',
} as const;

/**
 * 设备码 Redis Hash 字段
 */
export const DEVICE_AUTH_FIELDS = {
  USER_CODE: 'user_code',
  CLIENT_ID: 'client_id',
  STATUS: 'status',
  USER_ID: 'user_id',
  CREATED_AT: 'created_at',
  CLIENT_TYPE: 'client_type',
} as const;
