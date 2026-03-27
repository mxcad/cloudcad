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
  };
}
