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

import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { ClsServiceManager } from 'nestjs-cls';
import * as os from 'os';
import { randomUUID } from 'crypto';
import { getClientIp } from '../utils/client-ip';
import { buildAccessLogEntry, isAccessLogExcluded } from './access-log';
import { getAccessLogger } from './access-logger';
import type { Logger as PinoLogger } from 'pino';

/**
 * 访问日志 + 响应头中间件（ADR-0055 §1 / §8）：
 *
 * 1. 全局为每个响应设置 `X-Request-Id` / `X-Trace-Id` / `X-Node-Id`（前端可读，CORS 已暴露）；
 * 2. 在响应结束时写入一条访问日志（time/ip/method/path/status/duration/requestId/traceId/userAgent），
 *    排除健康检查 / 指标 / 静态资源，query 敏感键脱敏；
 * 3. 经 LOG_ACCESS_ENABLED 开关（默认开启），落盘 access-*.log（pino-roll 保留 180 天）。
 *
 * 必须在 CLS 中间件之后挂载（requestId/traceId 由 CLS 注入），在 Nest 路由之前。
 */
@Injectable()
export class AccessLogMiddleware implements NestMiddleware {
  private readonly logger = new Logger(AccessLogMiddleware.name);
  private readonly nodeId: string;

  constructor(private readonly accessLogger?: PinoLogger) {
    // X-Node-Id：优先取 HOSTNAME env，回退 os.hostname()
    this.nodeId = process.env.HOSTNAME || os.hostname() || 'unknown';
  }

  use(req: Request, res: Response, next: NextFunction) {
    // ---- 1. 响应头注入（必须在任何响应发送前设置） ----
    try {
      const cls = ClsServiceManager.getClsService();
      const requestId =
        cls?.get<string>('requestId') ||
        (req.headers['x-request-id'] as string) ||
        randomUUID();
      const traceId =
        cls?.get<string>('traceId') ||
        (req.headers['x-trace-id'] as string) ||
        randomUUID();

      res.setHeader('X-Request-Id', requestId);
      res.setHeader('X-Trace-Id', traceId);
      res.setHeader('X-Node-Id', this.nodeId);

      // 将 requestId/traceId 挂到请求上，供后续构建访问日志复用（避免重复读取 CLS）
      const augmented = req as Request & {
        accessRequestId?: string;
        accessTraceId?: string;
      };
      augmented.accessRequestId = requestId;
      augmented.accessTraceId = traceId;
    } catch {
      // CLS 未初始化（如测试或异常路径）时静默降级：不设置响应头也不阻断请求
    }

    // ---- 2. 排除路径检查 ----
    const path = req.originalUrl || req.url || '';
    if (isAccessLogExcluded(path)) {
      next();
      return;
    }

    const startTime = process.hrtime.bigint();
    const clientIp = getClientIp(req as never);
    const userAgent = req.headers['user-agent'] || 'unknown';

    res.on('finish', () => {
      try {
        const durationMs = Number(process.hrtime.bigint() - startTime) / 1e6;
        const augmented = req as Request & {
          accessRequestId?: string;
          accessTraceId?: string;
        };
        const requestId = augmented.accessRequestId || '';
        const traceId = augmented.accessTraceId || '';

        const entry = buildAccessLogEntry({
          reqUrl: path,
          method: req.method,
          status: res.statusCode,
          durationMs,
          requestId,
          traceId,
          clientIp,
          userAgent,
        });

        const logger = this.accessLogger ?? getAccessLogger();
        logger.info(entry, 'access');
      } catch (err) {
        // 访问日志写失败不应影响业务请求
        this.logger.warn(
          `访问日志写入失败: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    });

    next();
  }
}
