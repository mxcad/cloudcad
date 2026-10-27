import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Request, Response } from 'express';
import { setSseHeaders, startSseKeepalive } from '../common/sse/sse.helpers';
import {
  ACCOUNT_EVENTS_CHANNEL,
  type AccountEventsSseEvent,
} from './account-events-sse.constants';
import { NoticeSseService } from '../notice-center/notice-sse.service';
import { NoticeCenterService } from '../notice-center/notice-center.service';

/**
 * 统一用户事件流（ADR-0083）：一条 SSE 长连接复用全部用户级事件，命名事件区分。
 *
 * 背景：此前每个浏览器标签各开 2 条常驻 SSE（账户事件 + 通知流），HTTP/1.1 下
 * 浏览器每主机 6 连接上限使第 3 个标签起连接池耗尽、整站卡死。前端
 * sse-coordinator 按浏览器选举一个领导者标签开本流，BroadcastChannel 分发给
 * 其余标签——N 个标签 = 每浏览器 1 条常驻连接。
 *
 * 帧契约（与旧端点逐字节兼容，仅多 `event:` 行）：
 * - `event: account` + `data: {type:'membership-changed'}`——载荷同旧
 *   `/users/profile/account-events`；
 * - `event: notice` + `data: {type:'snapshot'|'publish'|'update'|'retract', ...}`
 *   ——载荷同旧 `/notices/stream`，含建连快照帧（客户端按 noticeId 去重）。
 *
 * 鉴权走一次性 ticket（复用通知中心 ticket 机制，JWT 不落 URL）；端点在
 * users.controller 的 `GET events/stream`。
 */
@Injectable()
export class UserEventsSseService {
  constructor(
    private readonly eventEmitter: EventEmitter2,
    private readonly noticeSseService: NoticeSseService,
    private readonly noticeCenterService: NoticeCenterService
  ) {}

  /**
   * 打开统一用户事件流：写 SSE 头 → 挂接通知 fan-out（`event: notice` 前缀）→
   * 订阅账户通道（`event: account` 前缀）→ 15s 保活 → req/res 关闭时清理三者。
   *
   * 快照帧在通知订阅挂接之后、经一次 DB 查询再写：查询窗口内发布的通知可能先于
   * 快照到达，与 notices/stream 同款「先订阅、后快照」语义——只会重复到达
   * （客户端按 noticeId 去重），不会漏。
   */
  async openUserEventStream(
    userId: string,
    res: Response,
    req: Request
  ): Promise<void> {
    setSseHeaders(res);

    let closed = false;

    const detachNotice = this.noticeSseService.attachRaw(userId, (frame) => {
      if (closed) return;
      res.write(`event: notice\ndata: ${JSON.stringify(frame)}\n\n`);
    });

    const channel = ACCOUNT_EVENTS_CHANNEL(userId);
    const onAccountEvent = (event: AccountEventsSseEvent) => {
      if (closed) return;
      res.write(`event: account\ndata: ${JSON.stringify(event)}\n\n`);
    };
    this.eventEmitter.on(channel, onAccountEvent);

    const stopKeepalive = startSseKeepalive(res, () => closed);

    const snapshot = await this.noticeCenterService.getEffective(userId);
    if (!closed) {
      res.write(
        `event: notice\ndata: ${JSON.stringify({
          type: 'snapshot',
          notices: snapshot,
        })}\n\n`
      );
    }

    const cleanup = () => {
      if (closed) return;
      closed = true;
      this.eventEmitter.off(channel, onAccountEvent);
      detachNotice();
      stopKeepalive();
    };
    req.on('close', cleanup);
    res.on('close', cleanup);
  }
}
