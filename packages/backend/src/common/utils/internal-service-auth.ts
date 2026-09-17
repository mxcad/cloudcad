///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import * as crypto from 'crypto';

/**
 * 内部服务共享密钥头（#419 等保 8.1.2.2 / #408 决策执行；#421 宿主机侧入站校验）
 *
 * 可信内网隔离路线的鉴权层：
 * - 出站：backend → storage-service(3200) / conversion-service(3100) 的 HTTP 调用统一携带
 *   X-Internal-Service-Secret 头；两个服务的非 health 路由校验该头。
 * - 入站（#421）：宿主机运维脚本（ClamAV 扫描）→ backend 内部告警端点携带该头，
 *   由 InternalSecretGuard 经 isInternalServiceSecretValid 校验。
 *
 * 出站语义（internalServiceSecretHeader）：
 * - secret 为空（本地开发）：返回空对象，不带头（向后兼容，服务侧同样留空即不校验）。
 * - secret 非空（生产）：返回 { 'X-Internal-Service-Secret': secret }。
 *
 * 与 buildOutboundTraceHeaders（X-Request-Id/X-Trace-Id 追踪头）正交，调用方同时展开两者。
 */
export const INTERNAL_SERVICE_SECRET_HEADER =
  'X-Internal-Service-Secret' as const;

/**
 * 构建内部服务共享密钥头。
 * @param secret INTERNAL_SERVICE_SECRET 环境值（空/undefined 时不带头）
 */
export function internalServiceSecretHeader(
  secret: string | undefined | null,
): Record<string, string> {
  // 仅当为字符串且非空时带头，其余（undefined/null/空串/非 string）一律视为未配置。
  // typeof 守卫是运行期兜底：本仓部分 spec 的 ConfigService mock 对未知 key 返回 {}
  // （非 string），若直接 secret.trim() 会抛错；生产 ConfigService.get<string> 只返回
  // string|undefined，此守卫不影响生产语义，仅避免测试 mock 形状导致的崩溃。
  if (typeof secret !== 'string' || secret.trim() === '') return {};
  return { [INTERNAL_SERVICE_SECRET_HEADER]: secret };
}

/**
 * 入站校验：请求头携带的密钥值是否与服务端 INTERNAL_SERVICE_SECRET 匹配（#421 内部告警端点）。
 *
 * Fail-close 语义（与出站 helper 相反）：
 * - 服务端 secret 未配置（空/非 string）→ 一律拒绝。内部端点未配密钥时不得开放，
 *   否则等同向全网开放告警注入入口；
 * - 请求头缺失/非 string/空串 → 拒绝。
 *
 * 比较用 timing-safe equal（先比长度再比内容），避免时序侧信道。
 *
 * @param provided 请求头 X-Internal-Service-Secret 的值
 * @param secret   服务端 INTERNAL_SERVICE_SECRET 环境值
 */
export function isInternalServiceSecretValid(
  provided: unknown,
  secret: unknown,
): boolean {
  if (typeof secret !== 'string' || secret.trim() === '') return false;
  if (typeof provided !== 'string' || provided.length === 0) return false;
  const a = Buffer.from(secret);
  const b = Buffer.from(provided);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
