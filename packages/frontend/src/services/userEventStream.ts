import { noticeCenterControllerIssueTicket } from '@/api-sdk';
import { loadAuthState } from '@/lib/authState';
import {
  openEventStream,
  type EventStreamHandle,
} from '@/services/eventStream';

/**
 * 统一用户事件流协调器（ADR-0083）：整个浏览器共享一条 SSE 长连接。
 *
 * 背景：HTTP/1.1 下浏览器每主机连接上限 6，旧「每标签 2 条常驻 SSE（账户事件 +
 * 通知）」在 3 个标签即占满连接池、卡死全部请求。现收敛为「全浏览器 1 条统一流」：
 * - 领导者：抢 Web Lock `cloudcad-user-events:<userId>` → 签一次性 ticket →
 *   开唯一一条 EventSource（/v1/users/events/stream），命名帧（event: account /
 *   event: notice）分发给本标签订阅者，并经 BroadcastChannel 扇出给跟随标签；
 * - 跟随者：不开连接，只听 BroadcastChannel；领导者标签关闭/崩溃时锁自动释放，
 *   排队中的跟随者立即接管；
 * - 降级：无 Web Locks / BroadcastChannel 的老浏览器，每标签直开统一流
 *   （每标签 1 条连接，仍优于旧的 2 条）。
 *
 * 帧是纯信号（account=会员等账户变更；notice=通知变更，建连首帧为快照），
 * 订阅者收到后自行重拉权威数据（profile / 通知列表）。
 *
 * 已知取舍（ADR-0083 记录）：领导者标签冻结（未关闭）时跟随者持锁等待、
 * 无法接管，关领导者标签即恢复。
 */

export type UserEventKind = 'account' | 'notice';

export type UserEventHandler = (payload: unknown) => void;

const LOCK_PREFIX = 'cloudcad-user-events:';
const CHANNEL_NAME = 'cloudcad-user-events';
const STREAM_PATH = '/v1/users/events/stream';
const RETRY_BASE_MS = 5000;
const RETRY_MAX_MS = 30000;

interface UserEventSession {
  userId: string;
  /** 本标签是领导者（持锁；降级模式下每标签即自身领导者） */
  isLeader: boolean;
  handle: EventStreamHandle | null;
  channel: BroadcastChannel | null;
  retryTimer: ReturnType<typeof setTimeout> | null;
  /** 当前重试间隔（指数退避，建连/收帧成功重置） */
  retryDelay: number;
  /** 解析 locks.request 回调的 Promise → 释放锁（降级模式为 null） */
  lockRelease: (() => void) | null;
  /** 已拆除：后续回调（迟到的锁回调/帧/关闭）一律忽略 */
  tornDown: boolean;
  subscribers: Record<UserEventKind, Set<UserEventHandler>>;
}

let session: UserEventSession | null = null;

function supportsCrossTab(): boolean {
  // jsdom（及部分老浏览器）navigator.locks 属性存在但值为 null，
  // 'locks' in navigator 不是可靠的能力判断，必须确认实际可调用
  return (
    typeof navigator?.locks?.request === 'function' &&
    typeof BroadcastChannel !== 'undefined'
  );
}

function subscriberCount(s: UserEventSession): number {
  return s.subscribers.account.size + s.subscribers.notice.size;
}

/**
 * 订阅统一用户事件流，返回退订函数。
 *
 * 首个订阅者出现时建立会话（领导者选举 / 降级直连）；最后一个订阅者移除时
 * 拆除会话（领导者关流放锁，跟随者仅停止监听）。游客态（无 token / 无 user）
 * 不建会话，调用方须按登录态门控。
 */
export function subscribeUserEvents(
  kind: UserEventKind,
  handler: UserEventHandler
): () => void {
  let s = session;
  if (!s) {
    const auth = loadAuthState();
    if (!auth.accessToken || !auth.user?.id) return () => {};
    s = createSession(auth.user.id);
    session = s;
  }
  s.subscribers[kind].add(handler);
  return () => {
    const cur = session;
    if (!cur) return;
    cur.subscribers[kind].delete(handler);
    if (subscriberCount(cur) === 0) teardownSession();
  };
}

function createSession(userId: string): UserEventSession {
  const s: UserEventSession = {
    userId,
    isLeader: false,
    handle: null,
    channel: null,
    retryTimer: null,
    retryDelay: RETRY_BASE_MS,
    lockRelease: null,
    tornDown: false,
    subscribers: { account: new Set(), notice: new Set() },
  };

  if (!supportsCrossTab()) {
    // 降级：无跨标签能力，本标签直开统一流（每标签 1 条连接）
    s.isLeader = true;
    void openStream(s);
    return s;
  }

  const channel = new BroadcastChannel(CHANNEL_NAME);
  channel.onmessage = (e: MessageEvent) => {
    const data = e.data as {
      type?: string;
      kind?: UserEventKind;
      payload?: unknown;
    } | null;
    if (
      !s.tornDown &&
      data?.type === 'frame' &&
      (data.kind === 'account' || data.kind === 'notice')
    ) {
      dispatchLocal(s, data.kind, data.payload);
    }
  };
  s.channel = channel;

  // 抢锁：领导者回调期间持有锁直到 lockRelease()；标签关闭/崩溃时浏览器自动
  // 释放，排队中的跟随者立即接管。回调触发时本标签已无订阅者则立即放行
  // （不持锁空开流），让锁传给下一个等待者。
  navigator.locks.request(
    LOCK_PREFIX + userId,
    () =>
      new Promise<void>((resolve) => {
        if (s.tornDown) {
          resolve();
          return;
        }
        if (subscriberCount(s) === 0) {
          resolve();
          return;
        }
        s.isLeader = true;
        s.lockRelease = resolve;
        void openStream(s);
      })
  );
  return s;
}

/**
 * 领导者开（重开）统一流。ticket 一次性（后端 Redis GETDEL 消费），每次建连
 * 前必须重新签发；签发失败/断连/401 均走退避重试。
 */
async function openStream(s: UserEventSession): Promise<void> {
  if (s.tornDown || !s.isLeader) return;

  const res = await noticeCenterControllerIssueTicket({ throwOnError: false });
  if (s.tornDown || !s.isLeader) return;
  const ticket = res.data?.ticket;
  if (!ticket) {
    scheduleRetry(s);
    return;
  }

  s.handle = openEventStream({
    path: STREAM_PATH,
    query: { ticket },
    namedEvents: ['account', 'notice'],
    onOpen: () => {
      if (!s.tornDown) s.retryDelay = RETRY_BASE_MS;
    },
    onNamedFrame: (kind, data) => {
      if (s.tornDown) return;
      s.retryDelay = RETRY_BASE_MS; // 收到帧 = 连接健康，重置退避
      const eventKind = kind as UserEventKind;
      dispatchLocal(s, eventKind, data);
      broadcastFrame(s, eventKind, data);
    },
    onClose: (reason) => {
      if (s.tornDown) return;
      s.handle = null;
      // manual = 被下一次重签取代（无需重试）；其余（401/断网/代理截断）重签重连
      if (reason !== 'manual') scheduleRetry(s);
    },
  });
}

function scheduleRetry(s: UserEventSession): void {
  if (s.tornDown || !s.isLeader || s.retryTimer) return;
  s.retryTimer = setTimeout(() => {
    s.retryTimer = null;
    if (s.tornDown || !s.isLeader) return;
    void openStream(s);
  }, s.retryDelay);
  s.retryDelay = Math.min(s.retryDelay * 2, RETRY_MAX_MS);
}

function dispatchLocal(
  s: UserEventSession,
  kind: UserEventKind,
  payload: unknown
): void {
  s.subscribers[kind].forEach((fn) => {
    try {
      fn(payload);
    } catch {
      // 单个订阅者异常不影响其他订阅者与流本身
    }
  });
}

function broadcastFrame(
  s: UserEventSession,
  kind: UserEventKind,
  payload: unknown
): void {
  if (!s.channel) return;
  try {
    s.channel.postMessage({ type: 'frame', kind, payload });
  } catch {
    // channel 已关闭（与拆除竞态）——忽略
  }
}

function teardownSession(): void {
  const s = session;
  if (!s || s.tornDown) return;
  s.tornDown = true;
  session = null;
  if (s.retryTimer) clearTimeout(s.retryTimer);
  s.handle?.close();
  s.handle = null;
  s.channel?.close();
  s.channel = null;
  // 释放锁：排队中的跟随者立即接管（降级模式无锁，无操作）
  s.lockRelease?.();
  s.lockRelease = null;
}
