/**
 * 通知已读簿记 + 级别排序（移动端唯一出口，纯函数 + 存储读写）。
 *
 * 与 PC 端 packages/frontend/src/components/notice/noticeAck.ts、noticeTypes.ts
 * 是同构实现。存储键（cloudcad_notice_acks）、TTL（24h）与数据结构
 * （Record<通知id, 已读时间戳毫秒>）是与 PC 共享同一个 localStorage 键的跨端契约，
 * 必须逐字节一致；调整前先对照 PC 端同步，禁止单端擅改。
 *
 * 不依赖 Vue 响应式、不持有模块状态，便于单测直接断言；
 * 组合式状态（轮询 / pending 队列）在 composables/useNoticeStream.ts。
 */
import type { NoticeResponseDto } from '@cloudcad/api-sdk'

/** 后端返回的一条通知 */
export type Notice = NoticeResponseDto

/** 通知 id → 已读时间戳（毫秒） */
export type NoticeAckMap = Record<string, number>

/** 与 PC 端共用同一键，便于排查；两端互不读取对方进程内的状态 */
export const NOTICE_ACK_STORAGE_KEY = 'cloudcad_notice_acks'

/** 已读 TTL：每条通知每个设备在 24h 内只提醒一次 */
export const NOTICE_ACK_TTL_MS = 24 * 60 * 60 * 1000

/** 读取已读记录。解析失败返回空表而不是抛错（存储被污染不该让应用崩掉） */
export function readAcks(storage: Storage = localStorage): NoticeAckMap {
  let raw: string | null
  try {
    raw = storage.getItem(NOTICE_ACK_STORAGE_KEY)
  } catch {
    return {}
  }
  if (!raw) return {}

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return {}
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}

  const acks: NoticeAckMap = {}
  for (const [id, at] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof at === 'number' && Number.isFinite(at)) acks[id] = at
  }
  return acks
}

/** 写入已读记录。配额满/隐私模式静默失败（下次启动会重新提醒，属可接受降级） */
export function writeAcks(acks: NoticeAckMap, storage: Storage = localStorage): void {
  try {
    storage.setItem(NOTICE_ACK_STORAGE_KEY, JSON.stringify(acks))
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
  const at = acks[noticeId]
  return typeof at === 'number' && now - at < ttlMs
}

/** 过滤出未读的通知（入参已排序，只做筛选以保持顺序） */
export function filterUnacknowledged(
  notices: Notice[],
  acks: NoticeAckMap,
  now: number,
  ttlMs: number = NOTICE_ACK_TTL_MS
): Notice[] {
  return notices.filter((notice) => !isAcknowledged(acks, notice.id, now, ttlMs))
}

/** 剔除过期记录，防止 localStorage 随公告数量无限增长 */
export function pruneExpiredAcks(
  acks: NoticeAckMap,
  now: number,
  ttlMs: number = NOTICE_ACK_TTL_MS
): NoticeAckMap {
  const pruned: NoticeAckMap = {}
  for (const [id, at] of Object.entries(acks)) {
    if (now - at < ttlMs) pruned[id] = at
  }
  return pruned
}

/** 级别 → 优先级，数字越大越先弹。未知级别排最后 */
export const NOTICE_LEVEL_PRIORITY: Record<string, number> = {
  info: 1,
  warning: 2,
  danger: 3,
}

/** 取一条通知的排序时间戳（发布时间，缺失时退回创建时间） */
function noticeTimestamp(notice: Notice): number {
  const raw = notice.publishedAt ?? notice.createdAt ?? null
  if (!raw) return 0
  const time = new Date(raw).getTime()
  return Number.isFinite(time) ? time : 0
}

/**
 * 排序：级别降序 → 发布时间降序 → id 升序。
 * id 兜底保证稳定排序：同一条通知被推两次时顺序不抖动。
 */
export function sortNotices(list: Notice[]): Notice[] {
  return [...list].sort((a, b) => {
    const byLevel =
      (NOTICE_LEVEL_PRIORITY[b.level] ?? 0) - (NOTICE_LEVEL_PRIORITY[a.level] ?? 0)
    if (byLevel !== 0) return byLevel
    const byTime = noticeTimestamp(b) - noticeTimestamp(a)
    if (byTime !== 0) return byTime
    return a.id.localeCompare(b.id)
  })
}
