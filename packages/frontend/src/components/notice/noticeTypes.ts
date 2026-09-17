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
 * 通知队列排序。
 *
 * 横幅只弹队列首条，因此顺序即优先级：级别高者先弹，同级按发布时间新的先弹。
 *
 * 刻意不依赖 @/api-sdk：这里只需要 id/级别/时间三个字段，用 NoticeLike 声明
 * 最小形状即可，后端 NoticeResponseDto 结构化满足就可用。这样前端类型文件不
 * 与自动生成的 SDK 产物耦合（notice-center 后端契约变更时只需对齐 NoticeLike）。
 */

/** 排序所需的最小通知形状：id 必填，级别与发布时间可选 */
export interface NoticeLike {
  id: string;
  /** 级别数字，越大越先弹 */
  level?: number;
  publishedAt?: string;
  createdAt?: string;
}

function levelOf(notice: NoticeLike): number {
  return typeof notice.level === 'number' && Number.isFinite(notice.level)
    ? notice.level
    : 0;
}

/** 发布时间：优先 publishedAt，缺省回退 createdAt；解析失败视为最旧 */
function timeOf(notice: NoticeLike): number {
  const raw = notice.publishedAt ?? notice.createdAt;
  if (typeof raw !== 'string') return 0;
  const ms = Date.parse(raw);
  return Number.isNaN(ms) ? 0 : ms;
}

/** 返回新数组，不改动调用方的队列引用 */
export function sortNoticeQueue<T extends NoticeLike>(notices: T[]): T[] {
  return [...notices].sort(
    (a, b) => levelOf(b) - levelOf(a) || timeOf(b) - timeOf(a)
  );
}
