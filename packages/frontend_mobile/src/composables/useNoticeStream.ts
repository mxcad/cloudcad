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
 * 纯函数（排序 / ack 读写）已收编到 utils/noticeAck.ts（与 PC 端同构），
 * 本文件只保留组合式状态。以下 re-export 维持既有对外 API，消费方零改动。
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
import {
  ackEntryKey,
  filterUnacknowledged,
  pruneExpiredAcks,
  readAcks,
  selectPopableNotice,
  selectWarningNotices,
  sortNotices,
  writeAcks,
  type Notice,
  type NoticeAckMap,
} from '../utils/noticeAck';
import { unwrap } from '../utils/apiError';
import { onSessionChanged } from '../utils/authSession';

export {
  ackEntryKey,
  ackStorageKey,
  filterUnacknowledged,
  isAcknowledged,
  readAcks,
  sortNotices,
  writeAcks,
  NOTICE_ACK_STORAGE_KEY as NOTICE_ACK_STORAGE_KEY_FOR_TEST,
} from '../utils/noticeAck';
export type { Notice } from '../utils/noticeAck';

/** 轮询间隔：与后端 Cache-Control（10s）配合，10s 内不重复请求 */
const NOTICE_POLL_INTERVAL_MS = 30_000;

/**
 * 当前登录账号 id。读 localStorage.user 而非 useUser 的响应式 ref：已读簿记是
 * 模块级状态，不挂在组件生命期上，登录/登出改由 authSession 的会话事件重建。
 */
function currentOwnerId(): string | null {
  try {
    const raw = localStorage.getItem('user');
    if (!raw) return null;
    const user = JSON.parse(raw) as { id?: unknown } | null;
    return typeof user?.id === 'string' && user.id ? user.id : null;
  } catch {
    return null;
  }
}

// ── 组合式状态 ──────────────────────────────────────────

const notices = ref<Notice[]>([]);
const acks = ref<NoticeAckMap>(readAcks(localStorage, currentOwnerId()));

// 已读簿记按账号隔离：会话写入/清理后重建，避免继承上一个账号的已读
onSessionChanged((event) => {
  if (event === 'written') {
    acks.value = readAcks(localStorage, currentOwnerId());
    return;
  }
  acks.value = readAcks(localStorage, null);
});

const pending = computed(() =>
  filterUnacknowledged(notices.value, acks.value, Date.now())
);
/**
 * 当前应弹框的那一条：只取 danger，warning/info 不走弹框（见 selectPopableNotice）。
 * 与 PC 端三级分流契约一致，纯函数在 utils/noticeAck.ts。
 */
const active = computed(() => selectPopableNotice(pending.value));
/** warning 轻提示队列（未读、已排序），由提示组件一次展示一条并 ack 推进 */
const warnings = computed(() => selectWarningNotices(pending.value));

let pollTimer: ReturnType<typeof setInterval> | null = null;
let mountedCount = 0;
let fetching = false;

async function fetchCurrent(): Promise<void> {
  if (fetching) return;
  fetching = true;
  try {
    const res = await noticeCenterControllerGetCurrent();
    unwrap(res);
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
  const next: NoticeAckMap = {
    ...acks.value,
    [ackEntryKey(notice.id, notice.updatedAt)]: now,
  };
  acks.value = next;
  writeAcks(next, localStorage, currentOwnerId());
}

/** 过期记录清理，防止 localStorage 随公告数量增长 */
function pruneAcks(): void {
  const kept = pruneExpiredAcks(acks.value, Date.now());
  acks.value = kept;
  writeAcks(kept, localStorage, currentOwnerId());
}

export interface UseNoticeStream {
  /** 当前生效中的全部通知（已排序） */
  notices: Ref<Notice[]>;
  /** 尚未提醒的通知队列 */
  pending: ComputedRef<Notice[]>;
  /** 当前应弹框的那一条（仅 danger）；队列为空或只有 warning/info 时 null */
  active: ComputedRef<Notice | null>;
  /** warning 轻提示队列（未读、已排序），一次展示一条并 ack 推进 */
  warnings: ComputedRef<Notice[]>;
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

  return { notices, pending, active, warnings, acknowledge, refresh: fetchCurrent };
}
