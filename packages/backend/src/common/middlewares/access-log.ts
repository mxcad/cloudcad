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
 * 访问日志核心逻辑（纯函数，便于单测）。
 *
 * 满足等保 8.3.5.1/2「网络访问行为审计」：记录 时间/IP/URL/结果/用户 等字段，
 * 排除健康检查与指标端点，query 敏感键脱敏。ADR-0055 §1 决策。
 */

/** 访问日志单条记录字段 */
export interface AccessLogEntry {
  /** 访问时间（ISO 8601） */
  time: string;
  /** 客户端 IP（经代理 X-Forwarded-For 解析） */
  ip: string;
  /** HTTP 方法 */
  method: string;
  /** 请求路径（含脱敏后的 query） */
  path: string;
  /** HTTP 状态码 */
  status: number;
  /** 耗时（毫秒） */
  duration: number;
  /** 请求 ID（与响应头 X-Request-Id 一致） */
  requestId: string;
  /** 跟踪 ID（与响应头 X-Trace-Id 一致） */
  traceId: string;
  /** User-Agent */
  userAgent: string;
}

/** query 中值需脱敏的敏感键（大小写不敏感） */
const SENSITIVE_QUERY_KEYS = new Set([
  'password',
  'passwd',
  'pwd',
  'token',
  'access_token',
  'refresh_token',
  'secret',
  'authorization',
  'apikey',
  'api_key',
  'api-key',
  'accesskey',
  'access_key',
  'access-key',
  'accesskeys',
  'accesskeyid',
  'accesskeysecret',
  'sign',
  'signature',
  'verificationcode',
  'verification_code',
  'code',
  'mobile',
  'phone',
  'email',
]);

/** 值脱敏后的占位符 */
export const MASKED_VALUE = '[Redacted]';

/**
 * 判断请求路径是否需要写入访问日志。
 * 排除：健康检查、指标端点、静态资源（缩略图等二进制/高频资源）。
 * @param path 含全局前缀的路径（如 /api/health/live）
 */
export function isAccessLogExcluded(path: string): boolean {
  if (!path) return true;
  // 全局前缀 api 已被剥离时（如 Nest 内部 path），兼容裸路径
  const p = path.replace(/^\/api(?=\/)/, '');
  return (
    /^\/health\b/.test(p) ||
    /^\/metrics\b/.test(p) ||
    /\/thumbnail\b/.test(p) ||
    /^\/favicon\.ico$/.test(p)
  );
}

/**
 * 对原始 URL 的 query 敏感键进行脱敏。
 * 输入形如 `/api/auth/login?password=xxx&token=y`，
 * 输出形如 `/api/auth/login?password=[Redacted]&token=[Redacted]`。
 * 无 query 或空串原样返回。
 */
export function maskSensitiveQuery(rawUrl: string): string {
  if (!rawUrl) return rawUrl;
  const qIdx = rawUrl.indexOf('?');
  if (qIdx === -1) return rawUrl;
  const pathPart = rawUrl.slice(0, qIdx);
  const query = rawUrl.slice(qIdx + 1);
  if (!query) return rawUrl;

  const masked = query
    .split('&')
    .map((pair) => {
      const eqIdx = pair.indexOf('=');
      if (eqIdx === -1) return pair;
      const key = pair.slice(0, eqIdx);
      if (SENSITIVE_QUERY_KEYS.has(key.toLowerCase())) {
        return `${key}=${MASKED_VALUE}`;
      }
      return pair;
    })
    .join('&');

  return `${pathPart}?${masked}`;
}

/**
 * 构建一条访问日志记录。
 * @param reqUrl 原始 URL（含 query，脱敏前）
 * @param method HTTP 方法
 * @param status HTTP 状态码
 * @param durationMs 耗时（毫秒）
 * @param requestId 请求 ID
 * @param traceId 跟踪 ID
 * @param clientIp 客户端 IP
 * @param userAgent User-Agent
 * @param now ISO 时间（可选，便于测试注入）
 */
export function buildAccessLogEntry(params: {
  reqUrl: string;
  method: string;
  status: number;
  durationMs: number;
  requestId: string;
  traceId: string;
  clientIp: string;
  userAgent: string;
  now?: string;
}): AccessLogEntry {
  return {
    time: params.now ?? new Date().toISOString(),
    ip: params.clientIp,
    method: params.method,
    path: maskSensitiveQuery(params.reqUrl),
    status: params.status,
    duration: params.durationMs,
    requestId: params.requestId,
    traceId: params.traceId,
    userAgent: params.userAgent,
  };
}
