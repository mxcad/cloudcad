///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

/**
 * 通知订阅的接线测试（统一用户事件流版，ADR-0083）。
 *
 * 建连/重签 ticket/退避重连/跨标签领导者接管已收敛到 services/userEventStream
 * 协调器（其内部行为由 userEventStream.spec.ts 覆盖），本文件钉住 hook 侧契约：
 *   1. 登录态向协调器登记 notice 信号回调，收到任意帧就整表重拉 GET /current
 *      （帧只是「有变化」的信号，权威全集始终来自 GET /current）；
 *   2. 轮询永不删——SSE 建连失败、断网、代理截断长连接时它是最坏情况的地板；
 *   3. 游客态只轮询不订阅（ticket 端点需要 JWT）；卸载即退订。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';

const mockGetCurrent = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ error: undefined, data: [] })
);
vi.mock('@/api-sdk', () => ({
  noticeCenterControllerGetCurrent: (...args: unknown[]) =>
    mockGetCurrent(...args),
}));

// 登录态决定「只轮询」还是「轮询 + 统一事件流」
const authState = vi.hoisted(() => ({ token: 'jwt_1' as string | null }));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ token: authState.token }),
}));

// 协调器桩：记录 notice 订阅，测试侧可模拟「帧到达」
const noticeHandlers = vi.hoisted(() => new Set<(p: unknown) => void>());
vi.mock('@/services/userEventStream', () => ({
  subscribeUserEvents: (
    kind: 'account' | 'notice',
    handler: (p: unknown) => void
  ) => {
    if (kind === 'notice') noticeHandlers.add(handler);
    return () => {
      noticeHandlers.delete(handler);
    };
  },
}));

import { useNoticeStream } from './useNoticeStream';
import { NOTICE_POLL_INTERVAL_MS } from '@/constants/timeouts';
import type { Notice } from './noticeTypes';

function notice(overrides: Partial<Notice> = {}): Notice {
  return {
    id: 'n_1',
    kind: 'system',
    level: 'info',
    title: '系统维护',
    body: '将于 22:00 停机',
    autoExpire: false,
    createdAt: '2026-09-17T00:00:00.000Z',
    updatedAt: '2026-09-17T00:00:00.000Z',
    ...overrides,
  };
}

/** flush 一次微任务：把拉取等异步尾巴跑完 */
async function flush(): Promise<void> {
  await act(async () => {});
}

/** 模拟协调器分发一帧（建连快照帧或推送帧，对 hook 而言无差别） */
function emitFrame(payload: unknown): void {
  act(() => {
    noticeHandlers.forEach((fn) => fn(payload));
  });
}

describe('useNoticeStream', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mockGetCurrent.mockResolvedValue({ error: undefined, data: [] });
    noticeHandlers.clear();
    authState.token = 'jwt_1';
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  describe('挂载行为', () => {
    it('挂载即拉一次当前生效通知，不等第一轮轮询', async () => {
      renderHook(() => useNoticeStream(true));
      expect(mockGetCurrent).toHaveBeenCalledTimes(1);
      await flush();
    });

    it('登录态向协调器登记 notice 信号回调', async () => {
      renderHook(() => useNoticeStream(true));
      await flush();

      expect(noticeHandlers.size).toBe(1);
    });

    it('未启用时不订阅也不轮询', async () => {
      const { result } = renderHook(() => useNoticeStream(false));
      await flush();

      expect(mockGetCurrent).not.toHaveBeenCalled();
      expect(noticeHandlers.size).toBe(0);
      expect(result.current).toEqual({ notices: [], source: 'idle' });
    });
  });

  describe('事件流帧', () => {
    it('收到帧就整表重拉 GET /current，并按级别降序替换本地状态', async () => {
      mockGetCurrent
        .mockResolvedValueOnce({
          error: undefined,
          data: [
            notice({ id: 'n_info', level: 'info' }),
            notice({ id: 'n_danger', level: 'danger' }),
          ],
        })
        .mockResolvedValueOnce({
          error: undefined,
          data: [notice({ id: 'n_danger', level: 'danger' })],
        });

      const { result } = renderHook(() => useNoticeStream(true));
      await flush();
      expect(result.current.notices.map((n) => n.id)).toEqual([
        'n_danger',
        'n_info',
      ]);

      emitFrame({ type: 'publish', notice: { id: 'n_danger' } });
      await flush();

      // 帧本身不带权威内容，触发的是第二次整表重拉
      expect(mockGetCurrent).toHaveBeenCalledTimes(2);
      expect(result.current.notices.map((n) => n.id)).toEqual(['n_danger']);
    });

    it('页面隐藏时帧不触发拉取（与轮询同一门控）', async () => {
      Object.defineProperty(document, 'visibilityState', {
        value: 'hidden',
        configurable: true,
      });
      try {
        renderHook(() => useNoticeStream(true));
        await flush();
        expect(mockGetCurrent).not.toHaveBeenCalled();

        emitFrame({ type: 'publish', notice: { id: 'n_1' } });
        await flush();
        expect(mockGetCurrent).not.toHaveBeenCalled();
      } finally {
        Object.defineProperty(document, 'visibilityState', {
          value: 'visible',
          configurable: true,
        });
      }
    });
  });

  describe('轮询兜底', () => {
    it('游客态不订阅：GET /current 是 @Public，游客轮询仍能拿到广播公告', async () => {
      authState.token = null;
      renderHook(() => useNoticeStream(true));
      await flush();

      expect(noticeHandlers.size).toBe(0);
      expect(mockGetCurrent).toHaveBeenCalledTimes(1);
    });

    it('SSE 缺席时仍按周期轮询（地板不丢）', async () => {
      authState.token = null;
      renderHook(() => useNoticeStream(true));
      await flush();
      expect(mockGetCurrent).toHaveBeenCalledTimes(1);

      await act(async () => {
        vi.advanceTimersByTime(NOTICE_POLL_INTERVAL_MS);
      });
      expect(mockGetCurrent).toHaveBeenCalledTimes(2);
    });

    it('拉取失败静默降级：不抛错、不覆盖已有状态，后续轮询照常', async () => {
      // 首轮拿到权威全集，第二轮（轮询）抛错——验证失败轮不会把已有状态清空
      mockGetCurrent.mockResolvedValueOnce({
        error: undefined,
        data: [notice({ id: 'n_1' })],
      });
      mockGetCurrent.mockRejectedValueOnce(new Error('网络断开'));

      const { result } = renderHook(() => useNoticeStream(true));
      await flush();
      expect(result.current.notices).toHaveLength(1);

      await act(async () => {
        vi.advanceTimersByTime(NOTICE_POLL_INTERVAL_MS);
      });
      await flush();
      // 失败那一轮被吞掉（不冒成 unhandled rejection），状态未被覆盖
      expect(mockGetCurrent).toHaveBeenCalledTimes(2);
      expect(result.current.notices).toHaveLength(1);
    });

    it('页面隐藏时不拉取，变可见立即补拉', async () => {
      // 直接覆盖 document 的 visibilityState getter，跑完必须还原（其余用例按可见态断言）
      Object.defineProperty(document, 'visibilityState', {
        value: 'hidden',
        configurable: true,
      });
      const restoreVisibility = () =>
        Object.defineProperty(document, 'visibilityState', {
          value: 'visible',
          configurable: true,
        });
      try {
        renderHook(() => useNoticeStream(true));
        await flush();
        // 挂载即拉也被 visibility 判据挡住
        expect(mockGetCurrent).not.toHaveBeenCalled();

        restoreVisibility();
        act(() => {
          document.dispatchEvent(new Event('visibilitychange'));
        });
        await flush();
        expect(mockGetCurrent).toHaveBeenCalledTimes(1);
      } finally {
        restoreVisibility();
      }
    });
  });

  it('卸载后退订：晚到帧不再触发拉取', async () => {
    const { unmount } = renderHook(() => useNoticeStream(true));
    await flush();
    expect(noticeHandlers.size).toBe(1);

    unmount();
    expect(noticeHandlers.size).toBe(0);

    emitFrame({ type: 'publish', notice: { id: 'n_1' } });
    await flush();
    expect(mockGetCurrent).toHaveBeenCalledTimes(1);
  });
});
