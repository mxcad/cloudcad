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
 * 通知已读（ack）记录：noticeId → ack 时间戳，持久化在 localStorage。
 *
 * TTL 内已读的公告不再弹出，TTL 到期后同一公告可再次提醒（公告通常周期性
 * 重申，例如版本发布通知）。跨标签页同步由 NoticeProvider 的 BroadcastChannel
 * 负责，本文件只负责单标签页持久化。
 *
 * 纯函数 + 两个 IO 边界函数（read/write）的拆分便于单测；所有 IO 与解析路径
 * 都吞掉异常并退化为「无已读记录」——ack 存储损坏不能阻塞应用启动。
 */

const NOTICE_ACKS_STORAGE_KEY = 'cloudcad_notice_acks';

/** noticeId → ack 时间戳（ms） */
export type NoticeAckMap = Record<string, number>;

export function readAcks(): NoticeAckMap {
  try {
    const raw = window.localStorage.getItem(NOTICE_ACKS_STORAGE_KEY);
    if (!raw) return {};
    return normalizeAckMap(JSON.parse(raw));
  } catch {
    return {};
  }
}

export function writeAcks(acks: NoticeAckMap): void {
  try {
    window.localStorage.setItem(NOTICE_ACKS_STORAGE_KEY, JSON.stringify(acks));
  } catch {
    // 写入失败（隐私模式 / 配额满）不影响本次弹出，下次读取会退化
  }
}

export function addAck(
  acks: NoticeAckMap,
  noticeId: string,
  at: number
): NoticeAckMap {
  return { ...acks, [noticeId]: at };
}

export function isAcknowledged(
  acks: NoticeAckMap,
  noticeId: string,
  now: number,
  ttlMs: number
): boolean {
  const at = acks[noticeId];
  return typeof at === 'number' && now - at < ttlMs;
}

export function pruneAcks(
  acks: NoticeAckMap,
  now: number,
  ttlMs: number
): NoticeAckMap {
  const next: NoticeAckMap = {};
  for (const [noticeId, at] of Object.entries(acks)) {
    if (typeof at === 'number' && now - at < ttlMs) {
      next[noticeId] = at;
    }
  }
  return next;
}

/** 只接受 {字符串: 有限数字} 形态；其余一律视为空记录，避免脏数据进入判断 */
function normalizeAckMap(parsed: unknown): NoticeAckMap {
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return {};
  }
  const next: NoticeAckMap = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      next[key] = value;
    }
  }
  return next;
}
