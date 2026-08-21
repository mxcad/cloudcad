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
 * EXE 轮询间隔建议值（秒）
 */
export const DEVICE_CODE_POLL_INTERVAL = 5;

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

export type DeviceAuthStatus =
  (typeof DEVICE_AUTH_STATUS)[keyof typeof DEVICE_AUTH_STATUS];

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
