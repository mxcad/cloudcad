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
 * 每条通知的每个**内容版本**每个设备在 TTL 内只提醒一次，避免客户端重连导致
 * 重复弹窗。存储刻意用 localStorage 而不是后端已读表：离线部署没有可靠的用户
 * 在线状态，已读回传会产生大量无用写入。代价是换设备会重新提醒 —— 对停机公告
 * 这是可接受的，宁可多提醒一次也不能静默错过。
 *
 * 本文件只有纯函数 + 存储读写，不持有 React 状态；跨标签页同步的 BroadcastChannel
 * 由 NoticeProvider 的 effect 管理生命周期。
 */

import { NOTICE_ACK_TTL_MS } from '@/constants/timeouts';

/** 簿记键 → 已读时间戳（毫秒） */
export type NoticeAckMap = Record<string, number>;

/**
 * 已读簿记键 = 通知 id + 内容版本（updatedAt）。
 *
 * 只按 id 记会让「同一条通知的更新」被静默吞掉：级别从普通升成紧急、标题正文
 * 被改过、或下线后重新发布，客户端都认作「已经提醒过了」而不再弹框。停机/等保
 * 公告场景下这是最坏的结果——宁可多提醒一次也不能静默错过。把 updatedAt 编进
 * 键里后，任何一次写库都会让旧键失配、新内容重新提醒一次；内容没变则不重复弹。
 *
 * updatedAt 缺失时版本段为空串，键仍保持复合形态（不会退化回按 id 判重，那样会
 * 静默复活上面的漏洞）。
 */
export function ackEntryKey(
  noticeId: string,
  updatedAt?: string | Date | null
): string {
  // Date 走 toISOString：String(date) 用本地时区与本地格式，同一时刻在不同机器
  // 上会算出不同的键，等于把判重随机化
  const version =
    updatedAt instanceof Date ? updatedAt.toISOString() : (updatedAt ?? '');
  return `${noticeId}:${version}`;
}

export const NOTICE_ACK_STORAGE_KEY = 'cloudcad_notice_acks';

/** 未登录账号的统一簿记键：避免把游客期的已读挂到之后登录的账号上 */
const ANONYMOUS_OWNER = 'anonymous';

/**
 * 已读簿记按账号分键。此前全端共用一个键，同一浏览器上 A 账号关掉公告后，
 * B 账号登录在 TTL 内不会再次收到提醒——多账号共用办公机时安全公告会被
 * 前一个账号静默消费。未登录时归入固定占位键，与任意账号隔离。
 *
 * 旧键（不带账号后缀）无需迁移：其内容最多存活 TTL，自然失效。
 */
export function ackStorageKey(ownerId?: string | null): string {
  return `${NOTICE_ACK_STORAGE_KEY}:${ownerId || ANONYMOUS_OWNER}`;
}

/** 读取已读记录。解析失败返回空表而不是抛错（存储被污染不该让应用崩掉） */
export function readAcks(
  storage: Storage = localStorage,
  ownerId?: string | null
): NoticeAckMap {
  let raw: string | null;
  try {
    raw = storage.getItem(ackStorageKey(ownerId));
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
  storage: Storage = localStorage,
  ownerId?: string | null
): void {
  try {
    storage.setItem(ackStorageKey(ownerId), JSON.stringify(acks));
  } catch {
    // 忽略：已读只是体验优化，不是数据安全边界
  }
}

/** TTL 内是否已读过（entryKey 见 ackEntryKey） */
export function isAcknowledged(
  acks: NoticeAckMap,
  entryKey: string,
  now: number,
  ttlMs: number = NOTICE_ACK_TTL_MS
): boolean {
  const at = acks[entryKey];
  return typeof at === 'number' && now - at < ttlMs;
}

/** 标记已读（纯函数，返回新对象） */
export function markAcknowledged(
  acks: NoticeAckMap,
  entryKey: string,
  now: number
): NoticeAckMap {
  return { ...acks, [entryKey]: now };
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

// ---------------------------------------------------------------------------
// 已查看（viewed）簿记：bell 徽标的「未读」判定依据。
//
// 刻意与上面的 ack 分开，不能复用：
//   ack 带 24h TTL，过期即重新弹框/toast（停机公告跨天要再提醒一次），
//   这是刻意设计；而「已查看」一旦为真就该永久成立——用户明确点开看过，
//   红点不该因为 24h 到点又重新亮起（观感上是 bug）。
// 故 viewed 无 TTL、只按 noticeId 存集合，靠 pruneViewed 剔除不再生效的条目
// 控制体积。
// ---------------------------------------------------------------------------

export const NOTICE_VIEWED_STORAGE_KEY = 'cloudcad_notice_viewed';

export function viewedStorageKey(ownerId?: string | null): string {
  return `${NOTICE_VIEWED_STORAGE_KEY}:${ownerId || ANONYMOUS_OWNER}`;
}

/** 读取已查看的通知 ID 列表。解析失败返回空数组而不是抛错 */
export function readViewed(
  storage: Storage = localStorage,
  ownerId?: string | null
): string[] {
  let raw: string | null;
  try {
    raw = storage.getItem(viewedStorageKey(ownerId));
  } catch {
    return [];
  }
  if (!raw) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  return [
    ...new Set(
      parsed.filter((id): id is string => typeof id === 'string' && id.length > 0)
    ),
  ];
}

/** 写入已查看列表。配额满/隐私模式静默失败 */
export function writeViewed(
  viewed: string[],
  storage: Storage = localStorage,
  ownerId?: string | null
): void {
  try {
    storage.setItem(viewedStorageKey(ownerId), JSON.stringify(viewed));
  } catch {
    // 忽略：已查看只是体验优化，不是数据安全边界
  }
}

export function isViewed(viewed: string[], noticeId: string): boolean {
  return viewed.includes(noticeId);
}

/** 标记为已查看（幂等，返回新数组） */
export function markViewed(viewed: string[], noticeId: string): string[] {
  return isViewed(viewed, noticeId) ? viewed : [...viewed, noticeId];
}

/**
 * 剔除不再生效的通知 ID，控制 localStorage 体积。
 *
 * 空集合直接返回原值：首屏尚未拉回数据时 notices 恒为空，此时若按「全部公告
 * 已消失」清理会把用户的已读记录一次性抹掉，随后红点集体复亮。
 */
export function pruneViewed(
  viewed: string[],
  validIds: ReadonlySet<string>
): string[] {
  if (validIds.size === 0) return viewed;
  return viewed.filter((id) => validIds.has(id));
}
