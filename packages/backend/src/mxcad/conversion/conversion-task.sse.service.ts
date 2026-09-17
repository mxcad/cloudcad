import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Response, Request } from 'express';
import { verify } from 'jsonwebtoken';
import {
  CONVERSION_TASK_CHANNEL,
  type ConversionTaskSseEvent,
} from './conversion-task-sse.constants';

/**
 * SSE 保活间隔：空闲连接（无任务变更）时防止代理按超时断开。
 * 用 SSE 注释行（`: keep-alive`）——EventSource 视为注释不触发 onmessage，仅保活。
 */
const SSE_KEEPALIVE_INTERVAL_MS = 15000;

/**
 * S4-3 转换任务 SSE 推送（per-user 长连接）。
 *
 * 复用 batch-download `SseManager` 的 SSE 基础设施模式（`text/event-stream` 头 +
 * JWT 鉴权（req.user 或 query token，EventSource 无法带 header）+ `EventEmitter2`
 * 通道订阅 + 保活），但语义不同：batch-download 是 per-task 终态即断流；转换面板是
 * per-user 长连接（用户可能有多个任务），事件是「刷新信号」（前端收到即 refreshCloud），
 * 流不随单个任务终态结束，直到客户端断开。
 */
@Injectable()
export class ConversionTaskSseService {
  private readonly logger = new Logger(ConversionTaskSseService.name);
  private readonly jwtSecret: string;

  constructor(
    private readonly eventEmitter: EventEmitter2,
    configService: ConfigService
  ) {
    const jwtConfig = configService.get('jwt', { infer: true });
    this.jwtSecret = jwtConfig?.secret || '';
  }

  /**
   * 打开 per-user SSE 流：写 SSE 头 + 初始刷新信号，订阅本用户通道（状态变更即推送），
   * 15s 保活（防代理断连），连接关闭时清理订阅与定时器。
   */
  async streamTasks(
    userId: string,
    res: Response,
    req: Request
  ): Promise<void> {
    this.setSseHeaders(res);
    res.flushHeaders();

    let closed = false;
    res.on('close', () => {
      closed = true;
    });

    // 初始刷新信号：前端据此立即 refreshCloud 一次（对齐挂载拉取，并确认流已建立）
    if (!closed) {
      res.write(`data: ${JSON.stringify({ type: 'refresh' })}\n\n`);
    }

    const channel = CONVERSION_TASK_CHANNEL(userId);
    const onEvent = (event: ConversionTaskSseEvent) => {
      if (closed) return;
      res.write(`data: ${JSON.stringify({ ...event, type: 'status' })}\n\n`);
    };
    this.eventEmitter.on(channel, onEvent);

    // 保活：空闲期防代理超时断连（注释行不触发前端 onmessage）
    const keepAliveTimer = setInterval(() => {
      if (closed) {
        clearInterval(keepAliveTimer);
        return;
      }
      res.write(': keep-alive\n\n');
    }, SSE_KEEPALIVE_INTERVAL_MS);

    req.on('close', () => {
      closed = true;
      this.eventEmitter.off(channel, onEvent);
      clearInterval(keepAliveTimer);
    });
  }

  /**
   * 解析 userId：req.user（session / 中间件注入）或 query token（EventSource 无法带
   * Authorization header，token 走 query，与 batch-download SSE 一致）。
   */
  resolveUserId(req: Request, res: Response): string | null {
    const user = (req as { user?: { id?: string } }).user;
    if (user?.id) return user.id;

    const token = (req.query as { token?: string })?.token;
    if (token) {
      try {
        const decoded = verify(token, this.jwtSecret) as { id: string };
        return decoded.id;
      } catch {
        res.status(401).end();
        return null;
      }
    }

    res.status(401).end();
    return null;
  }

  private setSseHeaders(res: Response): void {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
  }
}
