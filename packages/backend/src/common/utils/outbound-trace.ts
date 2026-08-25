///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { randomUUID } from 'crypto';
import { Logger } from '@nestjs/common';

/**
 * 出站 HTTP 追踪头注入（ADR-0055 §3.8 / #309）
 *
 * backend → storage-service / conversion-service 等内部服务的 HTTP 调用
 * 统一携带 X-Request-Id / X-Trace-Id，实现跨服务日志串联：
 * 前端 → backend → 内部服务 全链路一个 id 贯穿。
 *
 * - 有 CLS 请求上下文：复用当前 requestId/traceId（nestjs-cls 注入）
 * - 无上下文（定时任务/后台任务）：生成新 requestId 并记日志保证可追溯
 */

const logger = new Logger('OutboundTrace');

export interface OutboundTraceContext {
  /** 当前请求的 requestId（来自 ClsService.get('requestId')，可缺省） */
  requestId?: string | undefined;
  /** 当前请求的 traceId（来自 ClsService.get('traceId')，可缺省） */
  traceId?: string | undefined;
}

/** 与三个独立服务包（config/storage/conversion）lib/logger.js 的合法 id 规则对齐 */
const REQUEST_ID_RE = /^[A-Za-z0-9._-]{1,128}$/;

/**
 * 构建出站请求追踪头。
 *
 * @param ctx  请求追踪上下文（通常为 cls.get('requestId')/cls.get('traceId')）
 * @param source 调用方标识（用于无上下文场景的日志定位，如 'http-conversion'）
 */
export function buildOutboundTraceHeaders(
  ctx?: OutboundTraceContext,
  source?: string,
): Record<string, string> {
  const incoming = ctx?.requestId;
  const valid = typeof incoming === 'string' && REQUEST_ID_RE.test(incoming);
  const requestId = valid ? (incoming as string) : randomUUID();

  if (!valid) {
    logger.log(
      `出站调用无请求上下文（定时任务/后台任务），已生成新 requestId=${requestId}${
        source ? ` source=${source}` : ''
      }`,
    );
  }

  const traceId =
    typeof ctx?.traceId === 'string' && REQUEST_ID_RE.test(ctx.traceId)
      ? ctx.traceId
      : requestId;

  return {
    'X-Request-Id': requestId,
    'X-Trace-Id': traceId,
  };
}
