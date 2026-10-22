///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

/**
 * 通知订阅的接线测试。
 *
 * 三条契约会各自退化成「用户以为要刷新才能看到」的静默故障，故逐条钉住：
 *   1. 登录态建连必须「一帧一签」——ticket 是后端 Redis GETDEL 消费的一次性凭据，
 *      复用旧 ticket 重连只会 401 并无限重试；
 *   2. 帧只是「有变化」的信号，权威全集始终整表重拉 GET /current（否则帧与轮询
 *      两条路径各自拼状态）；
 *   3. 轮询永不删——SSE 建连失败、断网、代理截断长连接时它是最坏情况的地板。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';

const mockGetCurrent = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ error: undefined, data: [] })
);
const mockIssueTicket = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ error: undefined, data: { ticket: 'tk_1' } })
);
vi.mock('@/api-sdk', () => ({
  noticeCenterControllerGetCurrent: (...args: unknown[]) =>
    mockGetCurrent(...args),
  noticeCenterControllerIssueTicket: (...args: unknown[]) =>
    mockIssueTicket(...args),
}));

// 登录态决定「只轮询」还是「轮询 + SSE」
const authState = vi.hoisted(() => ({ token: 'jwt_1' as string | null }));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ token: authState.token }),
}));

// 建连出口收敛到 openEventStream；把它变成可回调的桩，记录每次完整参数
const streamCalls = vi.hoisted(
  () =>
    [] as Array<{
      path: string;
      query?: Record<string, string | undefined>;
      onFrame: (data: unknown) => void;
      onClose: (reason: string) => void;
    }>
);
vi.mock('@/services/eventStream', () => ({
  openEventStream: (options: (typeof streamCalls)[number]) => {
    streamCalls.push(options);
    return { close: vi.fn() };
  },
}));

import { useNoticeStream } from './useNoticeStream';
import { NOTICE_POLL_INTERVAL_MS } from '@/constants/timeouts';
import type { Notice } from './noticeTypes';

/** 与 useNoticeStream 内部的 NOTICE_SSE_RETRY_MS 保持一致 */
const SSE_RETRY_MS = 5000;

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

/** flush 一次微任务：把签发 ticket / 拉取 / 建连这几个异步尾巴跑完 */
async function flush(): Promise<void> {
  await act(async () => {});
}

describe('useNoticeStream', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mockGetCurrent.mockResolvedValue({ error: undefined, data: [] });
    mockIssueTicket.mockResolvedValue({ error: undefined, data: { ticket: 'tk_1' } });
    streamCalls.length = 0;
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

    it('登录态签发一次性 ticket 并按其建连 /v1/notices/stream', async () => {
      renderHook(() => useNoticeStream(true));
      await flush();

      expect(mockIssueTicket).toHaveBeenCalledTimes(1);
      expect(mockIssueTicket.mock.calls[0][0]).toEqual({ throwOnError: false });
      expect(streamCalls.length).toBe(1);

      const options = streamCalls[0];
      // 后端全局前缀 api/v1，SSE 路径必须带 /v1，否则 404 后无限重签 ticket
      expect(options.path).toBe('/v1/notices/stream');
      expect(options.query).toEqual({ ticket: 'tk_1' });
    });

    it('未启用时不建连也不轮询', async () => {
      const { result } = renderHook(() => useNoticeStream(false));
      await flush();

      expect(mockGetCurrent).not.toHaveBeenCalled();
      expect(mockIssueTicket).not.toHaveBeenCalled();
      expect(streamCalls.length).toBe(0);
      expect(result.current).toEqual({ notices: [], source: 'idle' });
    });
  });

  describe('SSE 帧', () => {
    it('收到帧就整表重拉 GET /current，并按级别降序替换本地状态', async () => {
      mockGetCurrent
        .mockResolvedValueOnce({
          error: undefined,
          data: [notice({ id: 'n_info', level: 'info' }), notice({ id: 'n_danger', level: 'danger' })],
        })
        .mockResolvedValueOnce({
          error: undefined,
          data: [notice({ id: 'n_danger', level: 'danger' })],
        });

      const { result } = renderHook(() => useNoticeStream(true));
      await flush();
      expect(result.current.notices.map((n) => n.id)).toEqual(['n_danger', 'n_info']);

      act(() => {
        streamCalls[0].onFrame({ type: 'publish', notice: { id: 'n_danger' } });
      });
      await flush();

      // 帧本身不带权威内容，触发的是第二次整表重拉
      expect(mockGetCurrent).toHaveBeenCalledTimes(2);
      expect(result.current.notices.map((n) => n.id)).toEqual(['n_danger']);
    });

    it('断连后按退避重建：先重签 ticket 再开新流', async () => {
      mockIssueTicket.mockResolvedValueOnce({ error: undefined, data: { ticket: 'tk_1' } });
      mockIssueTicket.mockResolvedValueOnce({ error: undefined, data: { ticket: 'tk_2' } });

      renderHook(() => useNoticeStream(true));
      await flush();
      expect(streamCalls.length).toBe(1);

      act(() => {
        streamCalls[0].onClose('error');
      });
      // 退避内不重建：ticket 已消费，立刻重连只会拿到 401
      expect(streamCalls.length).toBe(1);

      await act(async () => {
        vi.advanceTimersByTime(SSE_RETRY_MS - 1);
      });
      expect(streamCalls.length).toBe(1);

      await act(async () => {
        vi.advanceTimersByTime(1);
      });
      expect(mockIssueTicket).toHaveBeenCalledTimes(2);
      expect(streamCalls.length).toBe(2);
      expect(streamCalls[1].query).toEqual({ ticket: 'tk_2' });
    });

    it('签发失败时同样走退避重试', async () => {
      mockIssueTicket.mockResolvedValueOnce({ error: new Error('限流'), data: undefined });
      mockIssueTicket.mockResolvedValueOnce({ error: undefined, data: { ticket: 'tk_ok' } });

      renderHook(() => useNoticeStream(true));
      await flush();
      expect(streamCalls.length).toBe(0);

      await act(async () => {
        vi.advanceTimersByTime(SSE_RETRY_MS);
      });
      expect(streamCalls.length).toBe(1);
      expect(streamCalls[0].query).toEqual({ ticket: 'tk_ok' });
    });

    it('本条连接被下一次签发取代（manual）时不重试', async () => {
      renderHook(() => useNoticeStream(true));
      await flush();

      act(() => {
        streamCalls[0].onClose('manual');
      });
      await act(async () => {
        vi.advanceTimersByTime(SSE_RETRY_MS + 1000);
      });
      expect(mockIssueTicket).toHaveBeenCalledTimes(1);
      expect(streamCalls.length).toBe(1);
    });
  });

  describe('轮询兜底', () => {
    it('游客态不建连：GET /current 是 @Public，游客轮询仍能拿到广播公告', async () => {
      authState.token = null;
      renderHook(() => useNoticeStream(true));
      await flush();

      expect(mockIssueTicket).not.toHaveBeenCalled();
      expect(streamCalls.length).toBe(0);
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

  it('卸载后不再建连、不再写状态', async () => {
    const { unmount } = renderHook(() => useNoticeStream(true));
    await flush();
    expect(streamCalls.length).toBe(1);

    unmount();
    // 卸载后收到晚到的 error 帧也不重建
    act(() => {
      streamCalls[0].onClose('error');
    });
    await act(async () => {
      vi.advanceTimersByTime(SSE_RETRY_MS * 3);
    });
    expect(mockIssueTicket).toHaveBeenCalledTimes(1);
    expect(streamCalls.length).toBe(1);
  });
});
