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

import { createHash, timingSafeEqual } from 'crypto';

/**
 * 恒定时间字符串比较（#315 抓取令牌校验）
 *
 * 先做 SHA-256 摘要再 timingSafeEqual：
 * 1. 避免逐字符短路比较的时序侧信道；
 * 2. 固定 32 字节摘要长度，避免直接比较变长原文泄漏长度信息。
 */
export function safeEqualString(a: string, b: string): boolean {
  const digestA = createHash('sha256').update(a, 'utf8').digest();
  const digestB = createHash('sha256').update(b, 'utf8').digest();
  return timingSafeEqual(digestA, digestB);
}

/**
 * 校验请求凭据是否匹配抓取令牌（#315）
 *
 * 支持两种形式（Prometheus 抓取端常用）：
 * - `Authorization: Bearer <SCRAPE_TOKEN>`
 * - `Authorization: Basic base64(<user>:<SCRAPE_TOKEN>)`（用户名任意，密码字段比对令牌）
 *
 * @param authorization 请求头 Authorization 原始值（可 undefined）
 * @param scrapeToken 服务端配置的 SCRAPE_TOKEN（非空由调用方保证）
 */
export function matchScrapeCredentials(
  authorization: string | undefined,
  scrapeToken: string
): boolean {
  if (!authorization || !scrapeToken) {
    return false;
  }

  if (authorization.startsWith('Bearer ')) {
    return safeEqualString(authorization.slice(7).trim(), scrapeToken);
  }

  if (authorization.startsWith('Basic ')) {
    const decoded = Buffer.from(authorization.slice(6), 'base64').toString(
      'utf8'
    );
    const separatorIndex = decoded.indexOf(':');
    if (separatorIndex === -1) {
      return false;
    }
    return safeEqualString(decoded.slice(separatorIndex + 1), scrapeToken);
  }

  return false;
}
