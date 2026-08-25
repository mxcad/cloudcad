import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useAlertHistory } from './useAlertHistory';

vi.mock('@/api-sdk', () => ({
  alertControllerList: vi.fn(),
}));

vi.mock('@/languages', () => ({
  t: (m: string, vars?: Record<string, string>) =>
    vars
      ? m.replace(/\{(\w+)\}/g, (_match: string, key: string) =>
          vars[key] !== undefined ? vars[key] : ''
        )
      : m,
}));

import { alertControllerList } from '@/api-sdk';

const mockedList = vi.mocked(alertControllerList);

function createTestWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return {
    queryClient,
    wrapper: ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children),
  };
}

const mockAlert = {
  id: 'alert-1',
  source: 'disk-monitor',
  messageKey: 'disk.usage.high',
  level: 'P1',
  message: '磁盘使用率超过 85%',
  status: 'OPEN',
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
};

function mockListResponse(
  data: unknown[],
  pagination: Record<string, unknown> = { page: 1, limit: 20, total: 0, totalPages: 0 }
) {
  mockedList.mockResolvedValue({
    data: { data, pagination } as never,
  });
}

/** fake timers 下 flush 微任务 + setTimeout(0)（react-query notifyManager 批量通知） */
async function flushAsync() {
  await act(async () => {
    for (let i = 0; i < 30; i++) {
      await vi.advanceTimersByTimeAsync(0);
    }
  });
}

describe('useAlertHistory', () => {
  beforeEach(() => {
    mockedList.mockReset();
  });

  it('active=false 时不对告警接口发起请求', () => {
    const { wrapper } = createTestWrapper();
    renderHook(() => useAlertHistory(false, 1), { wrapper });

    expect(mockedList).not.toHaveBeenCalled();
  });

  it('active=true 时请求告警列表并解析分页信息', async () => {
    const { wrapper } = createTestWrapper();
    mockListResponse(
      [mockAlert],
      { page: 1, limit: 20, total: 23, totalPages: 2 }
    );

    const { result } = renderHook(() => useAlertHistory(true, 1), {
      wrapper,
    });

    await waitFor(() => expect(result.current.data).not.toBeNull());

    expect(mockedList).toHaveBeenCalledWith({
      query: { page: 1, limit: 20 },
    });
    expect(result.current.data?.items).toHaveLength(1);
    expect(result.current.data?.items[0].level).toBe('P1');
    expect(result.current.data?.pagination).toEqual({
      page: 1,
      limit: 20,
      total: 23,
      totalPages: 2,
    });
  });

  it('防御性解析：pagination 缺失时使用默认值，data 非数组时返回空列表', async () => {
    const { wrapper } = createTestWrapper();
    mockListResponse('not-an-array' as unknown as never[], {});

    const { result } = renderHook(() => useAlertHistory(true, 1), {
      wrapper,
    });

    await waitFor(() => expect(result.current.data).not.toBeNull());

    expect(result.current.data?.items).toEqual([]);
    expect(result.current.data?.pagination).toEqual({
      page: 1,
      limit: 20,
      total: 0,
      totalPages: 0,
    });
  });

  it('30s 轮询：倒计时归零后重新请求', async () => {
    vi.useFakeTimers();
    try {
      const { wrapper } = createTestWrapper();
      mockListResponse([mockAlert], { page: 1, limit: 20, total: 1, totalPages: 1 });

      const { result } = renderHook(() => useAlertHistory(true, 1), {
        wrapper,
      });

      await flushAsync();
      expect(mockedList).toHaveBeenCalledTimes(1);
      expect(result.current.data?.items).toHaveLength(1);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(30000);
      });
      await flushAsync();

      expect(mockedList).toHaveBeenCalledTimes(2);
      expect(result.current.refreshCountdown).toBe(30);
    } finally {
      vi.useRealTimers();
    }
  });

  it('手动刷新：立即重新请求并重置倒计时', async () => {
    vi.useFakeTimers();
    try {
      const { wrapper } = createTestWrapper();
      mockListResponse([mockAlert], { page: 1, limit: 20, total: 1, totalPages: 1 });

      const { result } = renderHook(() => useAlertHistory(true, 1), {
        wrapper,
      });

      await flushAsync();
      expect(mockedList).toHaveBeenCalledTimes(1);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(10000);
      });
      expect(result.current.refreshCountdown).toBe(20);

      await act(async () => {
        result.current.refresh();
      });
      await flushAsync();

      expect(mockedList).toHaveBeenCalledTimes(2);
      expect(result.current.refreshCountdown).toBe(30);
    } finally {
      vi.useRealTimers();
    }
  });

  it('请求失败时返回错误文案', async () => {
    const { wrapper } = createTestWrapper();
    mockedList.mockRejectedValue(new Error('network error'));

    const { result } = renderHook(() => useAlertHistory(true, 1), {
      wrapper,
    });

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error).toBe('network error');
  });
});
