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
 * 会话转移（桌面端 EXE → 系统浏览器）一次性凭证常量。
 *
 * 一次性 token = randomBytes(32).toString('base64url')，长度恒为 43 字符。
 * Redis key 前缀 + 60 秒 TTL + Lua GETDEL 原子消费（取出即焚），参照 device-auth 范式。
 */
export const SESSION_TRANSFER_TOKEN_EXPIRES_IN = 60;

export const SESSION_TRANSFER_KEY_PREFIX = 'session_transfer:';

export const sessionTransferKey = (token: string): string =>
  `${SESSION_TRANSFER_KEY_PREFIX}${token}`;
