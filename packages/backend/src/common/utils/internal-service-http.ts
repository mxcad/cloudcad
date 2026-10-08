///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import * as http from 'http';
import * as https from 'https';
import type { ClsService } from 'nestjs-cls';
import { buildOutboundTraceHeaders } from './outbound-trace';

/**
 * backend → 内部服务（storage-service 等）的 HTTP 传输层唯一出口。
 *
 * 历史上 HttpStorageProvider 与 HttpVersionControlProvider 各自内联了一份
 * 逐字节相同的 request/requestBuffer（URL 构造、http/https 分流、超时/destroy、
 * 错误模板、追踪头透传 #309、#419 共享密钥头）——任何传输层变更（重试/TLS/鉴权头）
 * 要改 4 处。收敛到此：两个 provider 成为纯 adapter，只传 serviceName 与配置。
 *
 * 纯函数式工厂（无 DI、无框架绑定）：调用方在构造期用自身配置建一个 client；
 * 追踪上下文（requestId/traceId）随请求变化，故在请求期经 cls 读取，不在构造期捕获。
 */

/** 内部服务调用超时（storage-service 转换/落盘可能较慢，60s） */
const INTERNAL_SERVICE_TIMEOUT_MS = 60000;

export interface InternalServiceClientOptions {
  /** 内部服务基址（如 http://localhost:3200） */
  baseUrl: string;
  /** 是否 HTTPS（决定 http/https 分流与默认端口） */
  useHttps: boolean;
  /** #419：内部服务共享密钥头（空则不带头，向后兼容本地开发） */
  secretHeaders: Record<string, string>;
  /** CLS 服务：请求期读取 requestId/traceId 做追踪透传（#309） */
  cls?: ClsService;
  /** 追踪头里的调用方标识（'http-storage' / 'http-version-control'） */
  serviceName: string;
}

export interface InternalServiceClient {
  /** JSON 请求：非 2xx 或响应非 JSON 时 reject */
  request(path: string, method: string, body?: string): Promise<any>;
  /** 二进制请求：返回原始 Buffer（非 2xx 时 reject） */
  requestBuffer(path: string, method: string): Promise<Buffer>;
}

export function createInternalServiceClient(
  options: InternalServiceClientOptions
): InternalServiceClient {
  const { baseUrl, useHttps, secretHeaders, cls, serviceName } = options;
  const mod = useHttps ? https : http;

  function buildHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      // X-Request-Id/X-Trace-Id 透传（#309）：storage-service 侧日志据此串联
      ...buildOutboundTraceHeaders(
        {
          requestId: cls?.get<string>('requestId'),
          traceId: cls?.get<string>('traceId'),
        },
        serviceName,
      ),
      // #419：内部服务共享密钥（storage-service 非 health 路由校验）
      ...secretHeaders,
    };
  }

  function request(path: string, method: string, body?: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const url = new URL(path, baseUrl);
      const reqOptions: http.RequestOptions = {
        hostname: url.hostname,
        port: url.port || (useHttps ? 443 : 80),
        path: url.pathname + url.search,
        method,
        headers: buildHeaders(),
        timeout: INTERNAL_SERVICE_TIMEOUT_MS,
      };
      if (body) reqOptions.headers!['Content-Length'] = Buffer.byteLength(body);
      const req = mod.request(reqOptions, (res) => {
        let data = '';
        res.on('data', (chunk: string) => (data += chunk));
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 400) {
            return reject(
              new Error(
                `HTTP ${res.statusCode} for ${method} ${path}: ${data.substring(0, 200)}`
              )
            );
          }
          try {
            resolve(JSON.parse(data));
          } catch {
            reject(new Error(`Invalid JSON: ${data}`));
          }
        });
      });
      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Timeout: ${method} ${path}`));
      });
      if (body) req.write(body);
      req.end();
    });
  }

  function requestBuffer(path: string, method: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const url = new URL(path, baseUrl);
      const reqOptions: http.RequestOptions = {
        hostname: url.hostname,
        port: url.port || (useHttps ? 443 : 80),
        path: url.pathname + url.search,
        method,
        headers: buildHeaders(),
        timeout: INTERNAL_SERVICE_TIMEOUT_MS,
      };
      const req = mod.request(reqOptions, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 400) {
            const body = Buffer.concat(chunks).toString('utf-8');
            return reject(
              new Error(
                `HTTP ${res.statusCode} for ${method} ${path}: ${body.substring(0, 200)}`
              )
            );
          }
          resolve(Buffer.concat(chunks));
        });
      });
      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Timeout: ${method} ${path}`));
      });
      req.end();
    });
  }

  return { request, requestBuffer };
}
