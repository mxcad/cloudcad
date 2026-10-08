import type { Request, Response } from 'express';
import { verify } from 'jsonwebtoken';

/**
 * SSE 基础设施——单一事实源。
 *
 * 四个 SSE 端点（batch-download SseManager / 转换任务 / 转换文件 / 通知中心）
 * 曾各持一份逐字节相同的响应头、保活与 query-token 鉴权。收敛到此处：
 * 纯函数 + 常量，不绑 DI，各服务按需引用。
 */

/** SSE 保活间隔（ms）：空闲连接防代理按超时断开。注释行不触发前端 onmessage。 */
export const SSE_KEEPALIVE_INTERVAL_MS = 15000;

/**
 * 写 SSE 响应头并 flush。4 个头逐字节一致（Content-Type / Cache-Control /
 * Connection / X-Accel-Buffering），收敛为单一事实源。
 */
export function setSseHeaders(res: Response): void {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
}

/**
 * 解析 SSE 请求的 userId：req.user（session / 中间件注入）优先，否则 query token。
 * EventSource 无法带 Authorization header，故 token 走 query。
 * 无有效身份时写 401 并返回 null（调用方据此 return）。
 */
export function resolveSseUserId(
  req: Request,
  res: Response,
  jwtSecret: string
): string | null {
  const user = (req as { user?: { id?: string } }).user;
  if (user?.id) return user.id;

  const token = req.query.token as string | undefined;
  if (token) {
    try {
      const decoded = verify(token, jwtSecret) as { id: string };
      return decoded.id;
    } catch {
      res.status(401).end();
      return null;
    }
  }

  res.status(401).end();
  return null;
}

/**
 * 启动 SSE 保活定时器：每 intervalMs 写一行 SSE 注释（`: keep-alive`）防代理超时
 * 断连。isClosed() 为真时定时器自停；返回 stop() 供连接关闭 / 终态时立即清理。
 */
export function startSseKeepalive(
  res: Response,
  isClosed: () => boolean,
  intervalMs: number = SSE_KEEPALIVE_INTERVAL_MS
): () => void {
  const timer = setInterval(() => {
    if (isClosed()) {
      clearInterval(timer);
      return;
    }
    res.write(': keep-alive\n\n');
  }, intervalMs);
  return () => clearInterval(timer);
}
