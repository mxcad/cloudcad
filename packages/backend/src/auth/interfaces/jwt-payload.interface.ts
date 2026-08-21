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
 * JWT Access Token Payload
 */
export interface JwtAccessPayload {
  sub: string;
  email: string;
  username: string;
  role: string;
  roleId: string;
  type: 'access';
}

/**
 * JWT Refresh Token Payload
 */
export interface JwtRefreshPayload {
  sub: string;
  type: 'refresh';
}

/**
 * 用户信息（用于生成 Token）
 */
export interface UserForToken {
  id: string;
  email: string | null;
  username: string;
  role?: {
    id: string;
    name: string;
    description?: string | null;
    isSystem: boolean;
    permissions?: Array<{ permission: string }>;
  } | null;
}

/**
 * Session 请求接口
 */
export interface SessionRequest {
  session?: {
    userId?: string;
    userRole?: string;
    userEmail?: string;
    save: () => Promise<void>;
  };
  /**
   * 请求是否通过 HTTPS 传输（express Request.secure，基于 trust proxy + x-forwarded-proto）。
   * 用于 cookie Secure 标志的协议自适应：SESSION_COOKIE_SECURE 未显式设置时，
   * http 请求不带 Secure、https 请求带 Secure（修复离线 http 部署 cookie 被丢弃问题）。
   */
  secure?: boolean;
}

/**
 * 微信临时 Token Payload
 */
export interface WechatTempPayload {
  sub: string;
  type: 'wechat_temp';
  wechatId: string;
  nickname?: string;
  avatar?: string;
}

/**
 * EXE 设备授权 Access Token Payload
 * 与 Web 共用 JWT 验证逻辑，但附加 client_type 和 client_id 用于策略区分
 */
export interface JwtExeAccessPayload extends JwtAccessPayload {
  client_type: 'exe';
  client_id: string;
}

/**
 * EXE 设备授权 Refresh Token Payload
 */
export interface JwtExeRefreshPayload extends JwtRefreshPayload {
  client_type: 'exe';
  client_id: string;
}
