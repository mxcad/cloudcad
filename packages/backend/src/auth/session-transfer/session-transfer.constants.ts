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

/** base64url(32 bytes) 的固定长度（24*4/3 向上取整后去 padding = 43） */
export const SESSION_TRANSFER_TOKEN_LENGTH = 43;

export const SESSION_TRANSFER_KEY_PREFIX = 'session_transfer:';

/** 前端透明交接路由（无 UI 交互，仅 loading 一闪而过） */
export const SESSION_TRANSFER_PATH = '/session-transfer';

/** 未指定 redirect 时的默认落点（个人中心） */
export const SESSION_TRANSFER_DEFAULT_REDIRECT = '/profile';

export const sessionTransferKey = (token: string): string =>
  `${SESSION_TRANSFER_KEY_PREFIX}${token}`;
