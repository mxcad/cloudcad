import { renderHook, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useCacheMonitor } from './useCacheMonitor';

const apiMocks = vi.hoisted(() => ({
  cacheMonitorControllerGetSummary: vi.fn(() =>
    Promise.resolve({
      data: {
        stats: {
          levels: {
            L1: { level: 'L1', size: 1024, hitRate: 95, totalRequests: 60 },
            L2: { level: 'L2', size: 2048, hitRate: 90, totalRequests: 40 },
          },
          summary: {
            totalHits: 95,
            totalMisses: 5,
            totalRequests: 100,
            overallHitRate: 92.5,
            totalMemoryUsage: 1048576,
          },
        },
        healthStatus: {
          L1: { level: 'L1', status: 'healthy', availability: 100 },
          L2: { level: 'L2', status: 'healthy', availability: 100 },
          overall: 'healthy',
        },
        performanceMetrics: {},
        timestamp: '2026-01-01T00:00:00.000Z',
      },
    })
  ),
  cacheMonitorControllerGetWarnings: vi.fn(() =>
    Promise.resolve({ data: { warnings: ['测试缓存警告'] } })
  ),
  cacheMonitorControllerGetSizeTrend: vi.fn(() =>
    Promise.resolve({ data: { L1: [100, 200], L2: [300, 400] } })
  ),
  cacheMonitorControllerGetPerformanceTrend: vi.fn(() =>
    Promise.resolve({
      data: {
        timestamps: [1700000000000, 1700000060000],
        avgResponseTimes: [10, 20],
        errorRates: [0, 0.5],
      },
    })
  ),
}));

vi.mock('@/api-sdk', () => apiMocks);

vi.mock('@/languages', () => ({
  t: (m: string) => m,
}));

const mockedSummary = vi.mocked(apiMocks.cacheMonitorControllerGetSummary);
const mockedWarnings = vi.mocked(apiMocks.cacheMonitorControllerGetWarnings);
const mockedSizeTrend = vi.mocked(apiMocks.cacheMonitorControllerGetSizeTrend);
const mockedPerfTrend = vi.mocked(
  apiMocks.cacheMonitorControllerGetPerformanceTrend
);

/** fake timers 下 flush 微任务 + setTimeout(0) */
async function flushAsync() {
  await act(async () => {
    for (let i = 0; i < 30; i++) {
      await vi.advanceTimersByTimeAsync(0);
    }
  });
}

describe('useCacheMonitor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('active=false 时不发起任何请求', () => {
    renderHook(() => useCacheMonitor(false));

    expect(mockedSummary).not.toHaveBeenCalled();
    expect(mockedWarnings).not.toHaveBeenCalled();
    expect(mockedSizeTrend).not.toHaveBeenCalled();
    expect(mockedPerfTrend).not.toHaveBeenCalled();
  });

  it('active=true 时请求摘要/警告/大小趋势/性能趋势，性能趋势默认 L1', async () => {
    const { result } = renderHook(() => useCacheMonitor(true));

    await waitFor(() => expect(result.current.summary).not.toBeNull());
    expect(mockedWarnings).toHaveBeenCalled();
    expect(mockedSizeTrend).toHaveBeenCalledWith({
      query: { minutes: '60' },
    });
    expect(mockedPerfTrend).toHaveBeenCalledWith({
      query: { level: 'L1', minutes: 60 },
    });
    expect(result.current.perfTrend?.avgResponseTimes).toEqual([10, 20]);
  });

  it('30s 轮询：倒计时归零后性能趋势随轮询重新请求', async () => {
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() => useCacheMonitor(true));

      await flushAsync();
      expect(mockedPerfTrend).toHaveBeenCalledTimes(1);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(30000);
      });
      await flushAsync();

      expect(mockedPerfTrend).toHaveBeenCalledTimes(2);
      expect(result.current.refreshCountdown).toBe(30);
    } finally {
      vi.useRealTimers();
    }
  });

  it('手动刷新：立即重新请求并重置倒计时，性能趋势同时刷新', async () => {
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() => useCacheMonitor(true));

      await flushAsync();
      expect(mockedPerfTrend).toHaveBeenCalledTimes(1);
      expect(result.current.refreshCountdown).toBe(30);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(10000);
      });
      expect(result.current.refreshCountdown).toBe(20);

      await act(async () => {
        await result.current.refresh();
      });
      await flushAsync();

      expect(mockedPerfTrend).toHaveBeenCalledTimes(2);
      expect(result.current.refreshCountdown).toBe(30);
    } finally {
      vi.useRealTimers();
    }
  });

  it('切换 L1/L2 时以对应级别重新请求性能趋势', async () => {
    const { result } = renderHook(() => useCacheMonitor(true));

    await waitFor(() => expect(mockedPerfTrend).toHaveBeenCalled());
    expect(mockedPerfTrend).toHaveBeenLastCalledWith({
      query: { level: 'L1', minutes: 60 },
    });

    await act(async () => {
      result.current.setPerfLevel('L2');
    });
    await waitFor(() => {
      expect(mockedPerfTrend).toHaveBeenLastCalledWith({
        query: { level: 'L2', minutes: 60 },
      });
    });
    expect(result.current.perfLevel).toBe('L2');
  });

  it('性能趋势请求失败时 perfError=true，不影响其余数据', async () => {
    mockedPerfTrend.mockRejectedValueOnce(new Error('network error'));

    const { result } = renderHook(() => useCacheMonitor(true));

    await waitFor(() => expect(result.current.perfError).toBe(true));
    expect(result.current.summary).not.toBeNull();
    expect(result.current.error).toBeNull();
  });
});
