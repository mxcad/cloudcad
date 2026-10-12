import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Response, Request } from 'express';
import {
  setSseHeaders,
  resolveSseUserId,
  startSseKeepalive,
} from '../common/sse/sse.helpers';
import {
  ACCOUNT_EVENTS_CHANNEL,
  type AccountEventsSseEvent,
} from './account-events-sse.constants';

/**
 * 账户事件 SSE 推送（per-user 长连接）。
 *
 * 复用转换任务 SSE 的基础设施模式（`text/event-stream` 头 + JWT 鉴权（req.user 或
 * query token，EventSource 无法带 header）+ `EventEmitter2` 通道订阅 + 保活），语义
 * 不同：转换面板是「刷新信号」（建连即推一次）；账户事件是「变更信号」——客户端登录
 * 时已持有用户资料，故建连不推初始帧，仅在 `updateMembership` 等账户写操作后推送，
 * 前端收到即 `refreshUser()` 重拉 `/auth/profile`，使已登录用户无需退出重登即拿到
 * 最新会员态。
 */
@Injectable()
export class AccountEventsSseService {
  private readonly jwtSecret: string;

  constructor(
    private readonly eventEmitter: EventEmitter2,
    configService: ConfigService
  ) {
    const jwtConfig = configService.get('jwt', { infer: true });
    this.jwtSecret = jwtConfig?.secret || '';
  }

  /**
   * 打开 per-user SSE 流：写 SSE 头 + 订阅本用户通道（账户变更即推送），15s 保活
   * （防代理断连），连接关闭时清理订阅与定时器。不推初始帧（客户端已持有用户资料）。
   */
  async streamAccountEvents(
    userId: string,
    res: Response,
    req: Request
  ): Promise<void> {
    setSseHeaders(res);

    let closed = false;
    res.on('close', () => {
      closed = true;
    });

    const channel = ACCOUNT_EVENTS_CHANNEL(userId);
    const stopKeepalive = startSseKeepalive(res, () => closed);
    const onEvent = (event: AccountEventsSseEvent) => {
      if (closed) return;
      res.write(`data: ${JSON.stringify(event)}\n\n`);
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
   * Authorization header，token 走 query，与转换任务 SSE 一致）。
   */
  resolveUserId(req: Request, res: Response): string | null {
    return resolveSseUserId(req, res, this.jwtSecret);
  }
}
