import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Response, Request } from 'express';
import {
  setSseHeaders,
  resolveSseUserId,
  startSseKeepalive,
} from '../../common/sse/sse.helpers';
import {
  CONVERSION_TASK_CHANNEL,
  type ConversionTaskSseEvent,
} from './conversion-task-sse.constants';

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
    setSseHeaders(res);

    let closed = false;
    res.on('close', () => {
      closed = true;
    });

    // 初始刷新信号：前端据此立即 refreshCloud 一次（对齐挂载拉取，并确认流已建立）
    if (!closed) {
      res.write(`data: ${JSON.stringify({ type: 'refresh' })}\n\n`);
    }

    const channel = CONVERSION_TASK_CHANNEL(userId);
    const stopKeepalive = startSseKeepalive(res, () => closed);
    const onEvent = (event: ConversionTaskSseEvent) => {
      if (closed) return;
      res.write(`data: ${JSON.stringify({ ...event, type: 'status' })}\n\n`);
    };
    this.eventEmitter.on(channel, onEvent);

    req.on('close', () => {
      closed = true;
      this.eventEmitter.off(channel, onEvent);
      stopKeepalive();
    });
  }

  /**
   * 解析 userId：req.user（session / 中间件注入）或 query token（EventSource 无法带
   * Authorization header，token 走 query，与 batch-download SSE 一致）。
   */
  resolveUserId(req: Request, res: Response): string | null {
    return resolveSseUserId(req, res, this.jwtSecret);
  }
}
