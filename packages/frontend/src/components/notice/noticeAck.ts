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
 * 通知已读（ack）记录。
 *
 * 每条通知每个设备在 TTL 内只提醒一次，避免管理员重发或客户端重连导致重复弹窗。
 * 存储刻意用 localStorage 而不是后端已读表：离线部署没有可靠的用户在线状态，
 * 已读回传会产生大量无用写入。代价是换设备会重新提醒 —— 对停机公告这是可接受的，
 * 宁可多提醒一次也不能静默错过。
 *
 * 本文件只有纯函数 + 存储读写，不持有 React 状态；跨标签页同步的 BroadcastChannel
 * 由 NoticeProvider 的 effect 管理生命周期。
 */

import { NOTICE_ACK_TTL_MS } from '@/constants/timeouts';

/** 通知 id → 已读时间戳（毫秒） */
export type NoticeAckMap = Record<string, number>;

export const NOTICE_ACK_STORAGE_KEY = 'cloudcad_notice_acks';

/** localStorage 键名，测试用 */
export const NOTICE_ACK_DEFAULT_TTL_MS = NOTICE_ACK_TTL_MS;

/** 读取已读记录。解析失败返回空表而不是抛错（存储被污染不该让应用崩掉） */
export function readAcks(storage: Storage = localStorage): NoticeAckMap {
  let raw: string | null;
  try {
    raw = storage.getItem(NOTICE_ACK_STORAGE_KEY);
  } catch {
    return {};
  }
  if (!raw) return {};

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

  const acks: NoticeAckMap = {};
  for (const [id, at] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof at === 'number' && Number.isFinite(at)) acks[id] = at;
  }
  return acks;
}

/** 写入已读记录。配额满/隐私模式静默失败（下次启动会重新提醒，属可接受降级） */
export function writeAcks(
  acks: NoticeAckMap,
  storage: Storage = localStorage
): void {
  try {
    storage.setItem(NOTICE_ACK_STORAGE_KEY, JSON.stringify(acks));
  } catch {
    // 忽略：已读只是体验优化，不是数据安全边界
  }
}

/** TTL 内是否已读过 */
export function isAcknowledged(
  acks: NoticeAckMap,
  noticeId: string,
  now: number,
  ttlMs: number = NOTICE_ACK_TTL_MS
): boolean {
  const at = acks[noticeId];
  return typeof at === 'number' && now - at < ttlMs;
}

/** 标记已读（纯函数，返回新对象） */
export function markAcknowledged(
  acks: NoticeAckMap,
  noticeId: string,
  now: number
): NoticeAckMap {
  return { ...acks, [noticeId]: now };
}

/** 剔除过期记录，防止 localStorage 随公告数量无限增长 */
export function pruneExpiredAcks(
  acks: NoticeAckMap,
  now: number,
  ttlMs: number = NOTICE_ACK_TTL_MS
): NoticeAckMap {
  const pruned: NoticeAckMap = {};
  for (const [id, at] of Object.entries(acks)) {
    if (now - at < ttlMs) pruned[id] = at;
  }
  return pruned;
}
