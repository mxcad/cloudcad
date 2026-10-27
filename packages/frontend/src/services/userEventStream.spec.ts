import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 统一用户事件流协调器测试（ADR-0083）。
 *
 * 两个「标签页」= 两次独立模块实例（vi.resetModules 后重新 import），共享
 * 浏览器级全局：Web Locks 注册表与 BroadcastChannel 通道（均为本文件的桩）。
 * openEventStream 桩记录每次建连的完整参数，测试侧可模拟 onOpen / 命名帧 /
 * onClose，等价于真实 EventSource 的生命周期事件。
 */

const mockIssueTicket = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ error: undefined, data: { ticket: 'tk_1' } })
);
vi.mock('@/api-sdk', () => ({
  noticeCenterControllerIssueTicket: (...args: unknown[]) =>
    mockIssueTicket(...args),
}));

const authState = vi.hoisted(() => ({
  accessToken: 'jwt_1' as string | null,
  user: { id: 'u_1' } as { id: string } | null,
}));
vi.mock('@/lib/authState', () => ({
  loadAuthState: () => ({
    accessToken: authState.accessToken,
    refreshToken: null,
    user: authState.user,
  }),
}));

const streamCalls = vi.hoisted(
  () =>
    [] as Array<{
      path: string;
      query?: Record<string, string | undefined>;
      onOpen?: () => void;
      onNamedFrame?: (kind: string, data: unknown) => void;
      onClose?: (reason: string) => void;
    }>
);
vi.mock('@/services/eventStream', () => ({
  openEventStream: (options: (typeof streamCalls)[number]) => {
    streamCalls.push(options);
    return { close: vi.fn() };
  },
}));

// ---- Web Locks 桩：浏览器级锁注册表（跨「标签页」共享） -------------------

type LockCallback = () => Promise<void>;

const lockState = vi.hoisted(() => ({
  held: new Map<string, boolean>(),
  waiting: new Map<string, LockCallback[]>(),
}));

/** 释放锁并按排队顺序唤醒下一个等待者（其回调成为新领导者） */
function releaseLock(name: string): void {
  if (!lockState.held.get(name)) return;
  lockState.held.set(name, false);
  // 只取出队首，其余等待者留在队列（对齐真实浏览器：锁传给下一人，
  // 后续排队者不受影响）
  const queue = lockState.waiting.get(name) ?? [];
  const next = queue.shift();
  if (queue.length === 0) lockState.waiting.delete(name);
  if (next) {
    lockState.held.set(name, true);
    void next().then(() => releaseLock(name));
  }
}

const locksMock = {
  request: (name: string, cb: LockCallback) => {
    if (!lockState.held.get(name)) {
      lockState.held.set(name, true);
      // 真实浏览器在后续任务才执行回调（届时 subscribeUserEvents 的订阅者
      // 登记已完成）；桩必须同样延迟，否则回调看到零订阅者会误判「无订阅者
      // 放行」而不持锁开流。
      void Promise.resolve().then(() => {
        void cb().then(() => releaseLock(name));
      });
      return new Promise<void>(() => {});
    }
    if (!lockState.waiting.has(name)) lockState.waiting.set(name, []);
    lockState.waiting.get(name)!.push(cb);
    return new Promise<void>(() => {});
  },
};

// ---- BroadcastChannel 桩：浏览器级通道（跨「标签页」共享） -----------------

const bcInstances = vi.hoisted(
  () => new Map<string, Set<{ onmessage: ((e: { data: unknown }) => void) | null; name: string }>>()
);

class MockBroadcastChannel {
  name: string;
  onmessage: ((e: { data: unknown }) => void) | null = null;

  constructor(name: string) {
    this.name = name;
    if (!bcInstances.has(name)) bcInstances.set(name, new Set());
    bcInstances.get(name)!.add(this);
  }

  postMessage(data: unknown): void {
    for (const other of bcInstances.get(this.name) ?? []) {
      if (other !== this && other.onmessage) other.onmessage({ data });
    }
  }

  close(): void {
    bcInstances.get(this.name)?.delete(this);
  }
}

// ---- 工具 ------------------------------------------------------------------

type CoordinatorModule = typeof import('@/services/userEventStream');

/** 安装跨标签能力桩（Web Locks + BroadcastChannel） */
function installCrossTabSupport(): void {
  Object.defineProperty(navigator, 'locks', {
    value: locksMock,
    configurable: true,
  });
  vi.stubGlobal('BroadcastChannel', MockBroadcastChannel);
}

/** 移除跨标签能力（降级路径：每标签直开统一流） */
function removeCrossTabSupport(): void {
  Object.defineProperty(navigator, 'locks', {
    value: undefined,
    configurable: true,
  });
  vi.stubGlobal('BroadcastChannel', undefined);
}

/** 加载一个全新模块实例 = 一个「标签页」 */
async function newTab(): Promise<CoordinatorModule> {
  vi.resetModules();
  return import('@/services/userEventStream');
}

/**
 * 冲刷微任务（锁交接 / ticket 签发 / 建连都是纯 promise 链）。
 * 必须走 advanceTimersByTimeAsync(0)：fake timers 生效时 `await
 * Promise.resolve()` 不保证排空原生微任务队列（实测 3 跳链只推进 1 跳），
 * 而 tickAsync 会在推进时钟的同时完整冲刷微任务。
 */
async function flush(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
}

describe('userEventStream（ADR-0083）', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    streamCalls.length = 0;
    lockState.held.clear();
    lockState.waiting.clear();
    bcInstances.clear();
    authState.accessToken = 'jwt_1';
    authState.user = { id: 'u_1' };
    mockIssueTicket.mockResolvedValue({
      error: undefined,
      data: { ticket: 'tk_1' },
    });
    installCrossTabSupport();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    cleanupTabs();
  });

  /** 各用例自行保存退订函数；兜底清理防止模块状态泄漏到下一用例 */
  const unsubscribers: Array<() => void> = [];
  function track(unsub: () => void): () => void {
    unsubscribers.push(unsub);
    return unsub;
  }
  function cleanupTabs(): void {
    while (unsubscribers.length > 0) {
      unsubscribers.pop()!();
    }
  }

  describe('领导者选举与跨标签扇出', () => {
    it('首个标签成为领导者开唯一一条流；跟随标签不开连接，帧经 BroadcastChannel 双端到达', async () => {
      const tabA = await newTab();
      const tabB = await newTab();

      const framesA: unknown[] = [];
      const framesB: unknown[] = [];
      // 两类命名事件各订一个处理器（协调器按 kind 分发，帧只到同 kind 订阅者）
      track(tabA.subscribeUserEvents('notice', (p) => framesA.push(p)));
      track(tabA.subscribeUserEvents('account', (p) => framesA.push(p)));
      track(tabB.subscribeUserEvents('notice', (p) => framesB.push(p)));
      track(tabB.subscribeUserEvents('account', (p) => framesB.push(p)));
      await flush();

      // 全浏览器只有一条流（领导者 tabA 所开），ticket 只签一次
      expect(streamCalls.length).toBe(1);
      expect(streamCalls[0].path).toBe('/v1/users/events/stream');
      expect(streamCalls[0].query).toEqual({ ticket: 'tk_1' });
      expect(mockIssueTicket).toHaveBeenCalledTimes(1);

      // 领导者收到命名帧：本标签分发 + 广播给跟随者
      streamCalls[0].onNamedFrame?.('notice', { type: 'publish' });
      await flush();
      expect(framesA).toEqual([{ type: 'publish' }]);
      expect(framesB).toEqual([{ type: 'publish' }]);

      // account 命名帧同样双端到达
      streamCalls[0].onNamedFrame?.('account', { type: 'membership-changed' });
      await flush();
      expect(framesA).toEqual([{ type: 'publish' }, { type: 'membership-changed' }]);
      expect(framesB).toEqual([{ type: 'publish' }, { type: 'membership-changed' }]);
    });

    it('领导者标签退订（关标签）后，排队中的跟随者立即接管开流', async () => {
      const tabA = await newTab();
      const tabB = await newTab();

      track(tabA.subscribeUserEvents('notice', () => {}));
      await flush();
      expect(streamCalls.length).toBe(1);

      // tabB 订阅 → 锁被 tabA 持有，进入排队（不开流）
      track(tabB.subscribeUserEvents('notice', () => {}));
      await flush();
      expect(streamCalls.length).toBe(1);
      expect(lockState.waiting.get('cloudcad-user-events:u_1')?.length).toBe(1);

      // tabA 最后一个订阅者移除 → 关流 + 放锁 → tabB 接管
      const unsubA = unsubscribers[0];
      unsubA();
      await flush();

      expect(streamCalls.length).toBe(2);
      expect(mockIssueTicket).toHaveBeenCalledTimes(2);
      expect(lockState.held.get('cloudcad-user-events:u_1')).toBe(true);
      expect(lockState.waiting.get('cloudcad-user-events:u_1')).toBeUndefined();
    });

    it('等待锁期间本标签已无订阅者：不持锁空开流，直接放行给下一个等待者', async () => {
      const tabA = await newTab();
      const tabB = await newTab();
      const tabC = await newTab();

      track(tabA.subscribeUserEvents('notice', () => {}));
      await flush();
      expect(streamCalls.length).toBe(1);

      // tabB 排队后立即退订（tornDown，回调触发时直接放行）
      const unsubB = track(tabB.subscribeUserEvents('notice', () => {}));
      await flush();
      unsubB();
      await flush();

      // tabC 排队
      track(tabC.subscribeUserEvents('notice', () => {}));
      await flush();

      // tabA 放锁 → tabB 的回调放行（不开流）→ tabC 接管
      unsubscribers[0]();
      await flush();

      expect(streamCalls.length).toBe(2);
      expect(mockIssueTicket).toHaveBeenCalledTimes(2);
    });
  });

  describe('重连与退避', () => {
    it('断连/401 后退避重签 ticket 重开；收帧成功重置退避', async () => {
      const tab = await newTab();
      track(tab.subscribeUserEvents('notice', () => {}));
      await flush();
      expect(streamCalls.length).toBe(1);

      // 第一次断连 → 5s 后重签（tk_2）重开
      mockIssueTicket.mockResolvedValue({
        error: undefined,
        data: { ticket: 'tk_2' },
      });
      streamCalls[0].onClose?.('error');
      await flush();
      expect(streamCalls.length).toBe(1);

      await vi.advanceTimersByTimeAsync(4999);
      expect(streamCalls.length).toBe(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(mockIssueTicket).toHaveBeenCalledTimes(2);
      expect(streamCalls.length).toBe(2);
      expect(streamCalls[1].query).toEqual({ ticket: 'tk_2' });

      // 收到帧 = 连接健康 → 退避重置回 5s
      streamCalls[1].onNamedFrame?.('notice', { type: 'snapshot' });
      await flush();

      // 第二次断连 → 仍是 5s（而非翻倍后的 10s）
      streamCalls[1].onClose?.('error');
      await vi.advanceTimersByTimeAsync(4999);
      expect(streamCalls.length).toBe(2);
      await vi.advanceTimersByTimeAsync(1);
      expect(streamCalls.length).toBe(3);
    });

    it('连续断连退避指数增长（5s → 10s），上限封顶', async () => {
      const tab = await newTab();
      track(tab.subscribeUserEvents('notice', () => {}));
      await flush();

      streamCalls[0].onClose?.('error');
      await vi.advanceTimersByTimeAsync(5000);
      expect(streamCalls.length).toBe(2);

      streamCalls[1].onClose?.('error');
      await vi.advanceTimersByTimeAsync(9999);
      expect(streamCalls.length).toBe(2);
      await vi.advanceTimersByTimeAsync(1);
      expect(streamCalls.length).toBe(3);
    });

    it('签发失败同样走退避重试，成功后建连', async () => {
      const tab = await newTab();
      mockIssueTicket.mockResolvedValueOnce({
        error: new Error('限流'),
        data: undefined,
      });
      mockIssueTicket.mockResolvedValueOnce({
        error: undefined,
        data: { ticket: 'tk_ok' },
      });

      track(tab.subscribeUserEvents('notice', () => {}));
      await flush();
      expect(streamCalls.length).toBe(0);

      await vi.advanceTimersByTimeAsync(5000);
      expect(streamCalls.length).toBe(1);
      expect(streamCalls[0].query).toEqual({ ticket: 'tk_ok' });
    });

    it('manual 关闭（被下一次重签取代/拆除）不触发重试', async () => {
      const tab = await newTab();
      track(tab.subscribeUserEvents('notice', () => {}));
      await flush();

      streamCalls[0].onClose?.('manual');
      await vi.advanceTimersByTimeAsync(30000);
      expect(streamCalls.length).toBe(1);
      expect(mockIssueTicket).toHaveBeenCalledTimes(1);
    });
  });

  describe('门控与降级', () => {
    it('游客态（无 token / 无 user）不建会话：不签 ticket、不开流', async () => {
      authState.accessToken = null;
      const tab = await newTab();
      const unsub = tab.subscribeUserEvents('notice', () => {});
      await flush();

      expect(mockIssueTicket).not.toHaveBeenCalled();
      expect(streamCalls.length).toBe(0);
      unsub();
    });

    it('最后一个订阅者移除即拆除：关流、放锁、后续帧回调全部失效', async () => {
      const tab = await newTab();
      const handler = vi.fn();
      const unsub = track(tab.subscribeUserEvents('notice', handler));
      await flush();
      expect(streamCalls.length).toBe(1);

      unsub();
      await flush();

      // 拆除后迟到的帧/关闭回调不再产生任何动作
      streamCalls[0].onNamedFrame?.('notice', { type: 'publish' });
      streamCalls[0].onClose?.('error');
      await vi.advanceTimersByTimeAsync(30000);
      expect(handler).not.toHaveBeenCalled();
      expect(streamCalls.length).toBe(1);
      expect(mockIssueTicket).toHaveBeenCalledTimes(1);
    });

    it('无 Web Locks / BroadcastChannel 的老浏览器：每标签直开统一流（降级）', async () => {
      removeCrossTabSupport();
      const tab = await newTab();
      track(tab.subscribeUserEvents('notice', () => {}));
      await flush();

      // 不抢锁，直接开本标签自己的流
      expect(streamCalls.length).toBe(1);
      expect(lockState.held.size).toBe(0);

      const unsub = unsubscribers[0];
      unsub();
      await flush();
      expect(mockIssueTicket).toHaveBeenCalledTimes(1);
    });
  });
});
