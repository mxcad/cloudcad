// ‍ 版权所有（C）2002-2026，成都梦想凯德科技有限公司。
// ‍ Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// ‍ 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// ‍ The code, documentation, and related materials of this software belong to
// ‍ Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// ‍ software must include the following copyright statement.
// ‍ 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
// ‍ This application should reach an agreement with Chengdu Dream Kaide
// ‍ Technology Co., Ltd. to use this software, its documentation, or related
// ‍ materials.
// ‍https://www.mxdraw.com/

/**
 * 移动端通知订阅：纯轮询（30s），不做 SSE。
 *
 * 移动端在 WebView 与后台退出的场景下长连接极不稳定，重连风暴还会打爆限流；
 * 公告不是秒级时效业务（部署停机提前量以分钟计），30s 轮询是合适的取舍。
 * 与 PC 端共用同一批后端接口与同一个 ack 存储键，已读状态跨端不冲突
 * （PC 与手机各存各的，属预期行为）。
 *
 * 纯函数（排序 / ack 读写）与组合式状态分离，便于单测直接断言。
 * 模块级状态沿用 useAuthState 的既有范式，唯一消费者是 App.vue 的挂载点。
 */
import {
  computed,
  onMounted,
  onUnmounted,
  ref,
  type ComputedRef,
  type Ref,
} from 'vue';
import { noticeCenterControllerGetCurrent } from '../api-sdk';
import type { NoticeResponseDto } from '@cloudcad/api-sdk';

export type Notice = NoticeResponseDto;

/** 轮询间隔：与后端 Cache-Control（10s）配合，10s 内不重复请求 */
const NOTICE_POLL_INTERVAL_MS = 30_000;

/** 已读 TTL：每条通知每个设备在 24h 内只提醒一次 */
const NOTICE_ACK_TTL_MS = 24 * 60 * 60 * 1000;

/** 与 PC 端共用同一键，便于排查；两端互不读取对方进程内的状态 */
const NOTICE_ACK_STORAGE_KEY = 'cloudcad_notice_acks';

/** 级别 → 优先级，数字越大越先弹。未知级别排最后 */
const LEVEL_PRIORITY: Record<string, number> = {
  info: 1,
  warning: 2,
  danger: 3,
};

/** 取一条通知的排序时间戳（发布时间，缺失时退回创建时间） */
function noticeTimestamp(notice: Notice): number {
  const raw = notice.publishedAt ?? notice.createdAt ?? null;
  if (!raw) return 0;
  const time = new Date(raw).getTime();
  return Number.isFinite(time) ? time : 0;
}

/**
 * 排序：级别降序 → 发布时间降序 → id 升序。
 * id 兜底保证稳定排序：同一条通知被推两次时顺序不抖动。
 */
export function sortNotices(list: Notice[]): Notice[] {
  return [...list].sort((a, b) => {
    const byLevel =
      (LEVEL_PRIORITY[b.level] ?? 0) - (LEVEL_PRIORITY[a.level] ?? 0);
    if (byLevel !== 0) return byLevel;
    const byTime = noticeTimestamp(b) - noticeTimestamp(a);
    if (byTime !== 0) return byTime;
    return a.id.localeCompare(b.id);
  });
}

type AckMap = Record<string, number>;

/** 读取已读记录。解析失败返回空表而不是抛错（存储被污染不该让应用崩掉） */
export function readAcks(storage: Storage = localStorage): AckMap {
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

  const acks: AckMap = {};
  for (const [id, at] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof at === 'number' && Number.isFinite(at)) acks[id] = at;
  }
  return acks;
}

/** 写入已读记录。配额满/隐私模式静默失败（下次启动会重新提醒，属可接受降级） */
export function writeAcks(acks: AckMap, storage: Storage = localStorage): void {
  try {
    storage.setItem(NOTICE_ACK_STORAGE_KEY, JSON.stringify(acks));
  } catch {
    // 忽略：已读只是体验优化，不是数据安全边界
  }
}

/** TTL 内是否已读过 */
export function isAcknowledged(
  acks: AckMap,
  noticeId: string,
  now: number,
  ttlMs: number = NOTICE_ACK_TTL_MS
): boolean {
  const at = acks[noticeId];
  return typeof at === 'number' && now - at < ttlMs;
}

/** 过滤出未读的通知（入参已排序，只做筛选以保持顺序） */
export function filterUnacknowledged(
  notices: Notice[],
  acks: AckMap,
  now: number,
  ttlMs: number = NOTICE_ACK_TTL_MS
): Notice[] {
  return notices.filter(
    (notice) => !isAcknowledged(acks, notice.id, now, ttlMs)
  );
}

// ── 组合式状态 ──────────────────────────────────────────

const notices = ref<Notice[]>([]);
const acks = ref<AckMap>(readAcks());

const pending = computed(() =>
  filterUnacknowledged(notices.value, acks.value, Date.now())
);
const active = computed(() => pending.value[0] ?? null);

let pollTimer: ReturnType<typeof setInterval> | null = null;
let mountedCount = 0;
let fetching = false;

async function fetchCurrent(): Promise<void> {
  if (fetching) return;
  fetching = true;
  try {
    const res = await noticeCenterControllerGetCurrent();
    if (res.error) return;
    notices.value = sortNotices(Array.isArray(res.data) ? res.data : []);
  } catch {
    // 静默：下一个轮询周期重试
  } finally {
    fetching = false;
  }
}

function startPolling(): void {
  if (pollTimer) return;
  void fetchCurrent();
  pollTimer = setInterval(() => {
    void fetchCurrent();
  }, NOTICE_POLL_INTERVAL_MS);
}

function stopPolling(): void {
  if (!pollTimer) return;
  clearInterval(pollTimer);
  pollTimer = null;
}

/** 标记已读（落盘后更新响应式状态） */
function acknowledge(notice: Notice): void {
  const now = Date.now();
  const next: AckMap = { ...acks.value, [notice.id]: now };
  acks.value = next;
  writeAcks(next);
}

/** 过期记录清理，防止 localStorage 随公告数量增长 */
function pruneAcks(): void {
  const now = Date.now();
  const kept: AckMap = {};
  for (const [id, at] of Object.entries(acks.value)) {
    if (now - at < NOTICE_ACK_TTL_MS) kept[id] = at;
  }
  acks.value = kept;
  writeAcks(kept);
}

export interface UseNoticeStream {
  /** 当前生效中的全部通知（已排序） */
  notices: Ref<Notice[]>;
  /** 尚未提醒的通知队列 */
  pending: ComputedRef<Notice[]>;
  /** 当前应弹的那一条；队列为空时 null */
  active: ComputedRef<Notice | null>;
  /** 标记已读并推进到下一条 */
  acknowledge: (notice: Notice) => void;
  /** 立即拉取一次（如从后台切回时） */
  refresh: () => Promise<void>;
}

/**
 * 挂载/卸载时启停轮询。引用计数：多个消费者同时挂载时不会重复起定时器，
 * 最后一个卸载才停。
 */
export function useNoticeStream(): UseNoticeStream {
  onMounted(() => {
    mountedCount += 1;
    if (mountedCount === 1) startPolling();
  });

  onUnmounted(() => {
    mountedCount = Math.max(0, mountedCount - 1);
    if (mountedCount === 0) {
      stopPolling();
      pruneAcks();
    }
  });

  return { notices, pending, active, acknowledge, refresh: fetchCurrent };
}

export const NOTICE_ACK_STORAGE_KEY_FOR_TEST = NOTICE_ACK_STORAGE_KEY;
