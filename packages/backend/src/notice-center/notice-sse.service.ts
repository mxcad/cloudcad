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

import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import Redis from 'ioredis';
import type { Notice } from '@cloudcad/db';
import type { Request, Response } from 'express';
import {
  NOTICE_EVENTS_CHANNEL,
  NOTICE_HEARTBEAT_MS,
  NOTICE_REDIS_SUBSCRIBER,
  type NoticeEvent,
} from './notice.types';

/** 本机 SSE 连接。closed 标志防止关闭后重复清理 */
interface StreamConnection {
  res: Response;
  userId: string;
  heartbeat: ReturnType<typeof setInterval> | null;
  closed: boolean;
}

/**
 * 通知 SSE 连接管理（单实例内）。
 *
 * 跨实例投递由 Redis pub/sub 承担：发布方写库后 publish，每个实例的订阅连接收到后
 * 转发给本机所有连接。EventEmitter2 是进程内总线，多实例部署会丢推送，因此不用。
 *
 * 连接建立顺序刻意是「先订阅、后发快照」：订阅在 onModuleInit 完成，open() 里直接发快照。
 * 两步之间发布的公告只会重复到达（客户端按 noticeId 去重），不会漏。
 */
@Injectable()
export class NoticeSseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NoticeSseService.name);
  private readonly connections = new Set<StreamConnection>();

  constructor(
    @Inject(NOTICE_REDIS_SUBSCRIBER) private readonly subscriber: Redis
  ) {}

  async onModuleInit(): Promise<void> {
    this.subscriber.on('message', this.handleRedisMessage.bind(this));
    await this.subscriber.subscribe(NOTICE_EVENTS_CHANNEL);
    this.logger.log('通知 SSE 订阅就绪');
  }

  async onModuleDestroy(): Promise<void> {
    for (const conn of this.connections) {
      this.dispose(conn);
    }
    await this.subscriber.quit().catch(() => undefined);
  }

  /**
   * 建立一条 SSE 连接。snapshot 由调用方查询后传入（避免与 NoticeCenterService 循环依赖）。
   */
  open(req: Request, res: Response, userId: string, snapshot: Notice[]): void {
    const conn: StreamConnection = {
      res,
      userId,
      heartbeat: null,
      closed: false,
    };
    this.connections.add(conn);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    // nginx 反代不缓冲，否则心跳与事件会攒在缓冲里
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    this.writeFrame(conn, { type: 'snapshot', notices: snapshot });

    conn.heartbeat = setInterval(() => {
      if (conn.closed) return;
      try {
        res.write(': ping\n\n');
      } catch {
        this.dispose(conn);
      }
    }, NOTICE_HEARTBEAT_MS);

    const onClientClosed = () => this.dispose(conn);
    req.on('close', onClientClosed);
    res.on('close', onClientClosed);
  }

  get activeConnections(): number {
    return this.connections.size;
  }

  private handleRedisMessage(_channel: string, message: string): void {
    let event: NoticeEvent;
    try {
      event = JSON.parse(message) as NoticeEvent;
    } catch {
      this.logger.warn('收到无法解析的通知事件，已忽略');
      return;
    }

    for (const conn of this.connections) {
      if (conn.closed || !this.isRelevant(event, conn.userId)) continue;
      try {
        this.writeFrame(conn, event);
      } catch {
        this.dispose(conn);
      }
    }
  }

  /** 定向通知只推给目标用户；retract 广播（客户端按 id 移除，无副作用） */
  private isRelevant(event: NoticeEvent, userId: string): boolean {
    if (event.type === 'retract') return true;
    const targetUserId = event.notice.userId ?? null;
    return targetUserId === null || targetUserId === userId;
  }

  private writeFrame(conn: StreamConnection, frame: unknown): void {
    conn.res.write(`data: ${JSON.stringify(frame)}\n\n`);
  }

  private dispose(conn: StreamConnection): void {
    if (conn.closed) return;
    conn.closed = true;
    if (conn.heartbeat) clearInterval(conn.heartbeat);
    this.connections.delete(conn);
  }
}
