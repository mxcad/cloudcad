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
 * 通知中心的类型定义与纯函数。
 *
 * 本文件不依赖 React、不读写 localStorage，便于单测直接断言。
 * 展示用的 title/body 一律按后端原文渲染，不走 i18n（管理员按目标语言填写）。
 */

import type { NoticeResponseDto } from '@/api-sdk';

/** 后端返回的一条通知 */
export type Notice = NoticeResponseDto;

/** 级别 → 展示优先级。数字越大越先弹。未知级别排最后 */
export const NOTICE_LEVEL_PRIORITY: Record<string, number> = {
  info: 1,
  warning: 2,
  danger: 3,
};

/**
 * SSE 事件载荷。
 *
 * `snapshot` 是建连后服务端下发的当前全量，`publish`/`update`/`retract` 是增量。
 * 建连顺序是「先订阅、后发快照」，两步之间发布的公告会同时出现在快照和事件里，
 * 由消费方按 id 合并去重 —— 重复到达无副作用，遗漏才会丢公告。
 */
export type NoticeSseEvent =
  | { type: 'snapshot'; notices: Notice[] }
  | { type: 'publish'; notice: Notice }
  | { type: 'update'; notice: Notice }
  | { type: 'retract'; noticeId: string }
  | { type: 'unknown' };

/**
 * 解析一条 SSE 文本帧。
 *
 * 全部走防御式校验：脏帧返回 'unknown' 而不是抛错，避免单条坏消息
 * 打断整条连接（EventSource 的 onmessage 抛错不会自动重连，只会静默停摆）。
 */
export function parseNoticeEvent(raw: string): NoticeSseEvent {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { type: 'unknown' };
  }

  if (!data || typeof data !== 'object') return { type: 'unknown' };
  const obj = data as Record<string, unknown>;

  switch (obj.type) {
    case 'snapshot':
      return {
        type: 'snapshot',
        notices: Array.isArray(obj.notices) ? (obj.notices as Notice[]) : [],
      };
    case 'publish':
    case 'update':
      return obj.notice && typeof obj.notice === 'object'
        ? { type: obj.type, notice: obj.notice as Notice }
        : { type: 'unknown' };
    case 'retract':
      return typeof obj.noticeId === 'string'
        ? { type: 'retract', noticeId: obj.noticeId }
        : { type: 'unknown' };
    default:
      return { type: 'unknown' };
  }
}

/** 取一条通知的排序时间戳（发布时间，缺失时退回创建时间） */
function noticeTimestamp(notice: Notice): number {
  const raw = notice.publishedAt ?? notice.createdAt ?? null;
  if (!raw) return 0;
  const time = new Date(raw).getTime();
  return Number.isFinite(time) ? time : 0;
}

/**
 * 排序：级别降序 → 发布时间降序。
 *
 * 多实例并发下同一条通知可能被推两次，排序必须稳定（按 id 兜底），
 * 否则两次排序结果不同会让队列顺序抖动。
 */
export function sortNotices(list: Notice[]): Notice[] {
  return [...list].sort((a, b) => {
    const byLevel =
      (NOTICE_LEVEL_PRIORITY[b.level] ?? 0) -
      (NOTICE_LEVEL_PRIORITY[a.level] ?? 0);
    if (byLevel !== 0) return byLevel;
    const byTime = noticeTimestamp(b) - noticeTimestamp(a);
    if (byTime !== 0) return byTime;
    return a.id.localeCompare(b.id);
  });
}
