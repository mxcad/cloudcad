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

/**
 * 通用通知中心的共享常量与事件契约。
 *
 * kind / level 用 String 而非 Prisma 枚举：公告类型会随业务增长（system / download
 * 之后还会加），而 Prisma 枚举既不能直接 @ApiProperty，新增值又要跑迁移。
 */

import type { Notice } from '@cloudcad/db';

/** 通知类型白名单 */
export const NOTICE_KINDS = ['system', 'download'] as const;
export type NoticeKind = (typeof NOTICE_KINDS)[number];

/** 通知级别白名单，驱动前端弹框配色与队列优先级 */
export const NOTICE_LEVELS = ['info', 'warning', 'danger'] as const;
export type NoticeLevel = (typeof NOTICE_LEVELS)[number];

/** 级别优先级（数值越大越先弹） */
export const NOTICE_LEVEL_PRIORITY: Record<NoticeLevel, number> = {
  danger: 3,
  warning: 2,
  info: 1,
};

/** Redis pub/sub 频道：跨实例投递通知事件 */
export const NOTICE_EVENTS_CHANNEL = 'notice:events';

/** 专用订阅连接 DI token（ioredis 订阅模式独占连接，不能复用命令连接） */
export const NOTICE_REDIS_SUBSCRIBER = 'NOTICE_REDIS_SUBSCRIBER';

/** SSE 心跳间隔（30s 注释帧，防反代按空闲超时切断长连接） */
export const NOTICE_HEARTBEAT_MS = 30_000;

/** 一次性 SSE ticket 的 Redis 键前缀与 TTL（5 分钟） */
export const NOTICE_TICKET_PREFIX = 'notice:sse:ticket:';
export const NOTICE_TICKET_TTL_SECONDS = 300;

/** 跨实例事件载荷 */
export type NoticeEvent =
  | { type: 'publish'; notice: Notice }
  | { type: 'update'; notice: Notice }
  | { type: 'retract'; noticeId: string };
