import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useBackgroundTasks } from './useBackgroundTasks';

const permissionMock = vi.hoisted(() => ({
  hasPermission: vi.fn((p: string) => p === 'SYSTEM_MONITOR'),
}));

const notificationMock = vi.hoisted(() => ({
  showToast: vi.fn(),
  showConfirm: vi.fn().mockResolvedValue(true),
}));

vi.mock('@/hooks/usePermission', () => ({
  usePermission: () => permissionMock,
}));

vi.mock('@/contexts/NotificationContext', () => ({
  useNotification: () => notificationMock,
}));

vi.mock('@/languages', () => ({
  t: (m: string, vars?: Record<string, string>) =>
    vars
      ? m.replace(/\{(\w+)\}/g, (_match: string, key: string) =>
          vars[key] !== undefined ? vars[key] : ''
        )
      : m,
}));

vi.mock('@/api-sdk', () => ({
  taskRunControllerListRuns: vi.fn(),
  taskRunControllerListTasks: vi.fn(),
  taskRunControllerRunTask: vi.fn(),
  runtimeConfigControllerGetAllConfigs: vi.fn(),
  runtimeConfigControllerUpdateConfig: vi.fn(),
}));

import {
  taskRunControllerListRuns,
  taskRunControllerListTasks,
  taskRunControllerRunTask,
  runtimeConfigControllerGetAllConfigs,
  runtimeConfigControllerUpdateConfig,
} from '@/api-sdk';

const mockedListRuns = vi.mocked(taskRunControllerListRuns);
const mockedListTasks = vi.mocked(taskRunControllerListTasks);
const mockedRunTask = vi.mocked(taskRunControllerRunTask);
const mockedGetAllConfigs = vi.mocked(runtimeConfigControllerGetAllConfigs);
const mockedUpdateConfig = vi.mocked(runtimeConfigControllerUpdateConfig);

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

const mockRecord = {
  id: 'run-1',
  taskName: 'storage-cleanup:expired-storage',
  status: 'SUCCESS',
  startedAt: '2026-08-01T00:00:00.000Z',
  finishedAt: '2026-08-01T00:00:02.000Z',
  durationMs: 2000,
  errorSummary: null,
  trigger: 'SCHEDULED',
  triggeredBy: null,
  createdAt: '2026-08-01T00:00:00.000Z',
};

function mockListResponse(data: unknown[] = []) {
  mockedListRuns.mockResolvedValue({
    data: { data, pagination: { page: 1, limit: 50, total: data.length, totalPages: 1 } } as never,
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

describe('useBackgroundTasks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    permissionMock.hasPermission.mockImplementation(
      (p: string) => p === 'SYSTEM_MONITOR'
    );
    notificationMock.showConfirm.mockResolvedValue(true);
    mockListResponse();
    mockedListTasks.mockResolvedValue({ data: { data: [] } } as never);
  });

  it('active=false 时不对任何接口发起请求', () => {
    const { wrapper } = createTestWrapper();
    renderHook(() => useBackgroundTasks(false), { wrapper });

    expect(mockedListRuns).not.toHaveBeenCalled();
    expect(mockedListTasks).not.toHaveBeenCalled();
    expect(mockedGetAllConfigs).not.toHaveBeenCalled();
  });

  it('active=true 时请求任务清单并解析（含 schedule/scheduleLabel，null 表示无独立定时）', async () => {
    const { wrapper } = createTestWrapper();
    mockedListTasks.mockResolvedValue({
      data: {
        data: [
          { taskName: 'cache-cleanup:warning-check', description: '缓存监控告警检查', schedule: '0 */10 * * * *', scheduleLabel: '每 10 分钟' },
          { taskName: 'backup:database', description: '数据库备份', schedule: null, scheduleLabel: null },
        ],
      } as never,
    });

    const { result } = renderHook(() => useBackgroundTasks(true), {
      wrapper,
    });

    await waitFor(() => expect(result.current.taskList).toHaveLength(2));
    expect(mockedListTasks).toHaveBeenCalledTimes(1);
    expect(result.current.taskList).toEqual([
      { taskName: 'cache-cleanup:warning-check', description: '缓存监控告警检查', schedule: '0 */10 * * * *', scheduleLabel: '每 10 分钟' },
      { taskName: 'backup:database', description: '数据库备份', schedule: null, scheduleLabel: null },
    ]);
  });

  it('任务清单防御性解析：data 非数组返回空列表', async () => {
    const { wrapper } = createTestWrapper();
    mockedListTasks.mockResolvedValue({ data: { data: 'not-array' } as never });

    const { result } = renderHook(() => useBackgroundTasks(true), {
      wrapper,
    });

    await waitFor(() => expect(result.current.taskList).toEqual([]));
  });

  it('active=true 时请求执行记录列表并解析', async () => {
    const { wrapper } = createTestWrapper();
    mockListResponse([mockRecord]);

    const { result } = renderHook(() => useBackgroundTasks(true), {
      wrapper,
    });

    await waitFor(() => expect(result.current.records).toHaveLength(1));

    expect(mockedListRuns).toHaveBeenCalledWith({
      query: { page: 1, limit: 50 },
    });
    expect(result.current.records[0]).toMatchObject({
      id: 'run-1',
      taskName: 'storage-cleanup:expired-storage',
      status: 'SUCCESS',
      durationMs: 2000,
      trigger: 'SCHEDULED',
    });
    expect(result.current.error).toBeNull();
  });

  it('防御性解析：data 非数组返回空列表，宽松字段容错', async () => {
    const { wrapper } = createTestWrapper();
    mockListResponse();
    mockedListRuns.mockResolvedValue({
      data: {
        data: [
          { ...mockRecord, durationMs: 'abc', status: 'FAILED' },
          { id: 'run-2', taskName: 'cache-cleanup:health-check' },
        ],
      } as never,
    });

    const { result } = renderHook(() => useBackgroundTasks(true), {
      wrapper,
    });

    await waitFor(() => expect(result.current.records.length).toBeGreaterThan(0));
    expect(result.current.records[0].durationMs).toBeNull();
    expect(result.current.records[0].status).toBe('FAILED');
    expect(result.current.records[1].trigger).toBe('SCHEDULED');
    expect(result.current.records[1].status).toBe('SUCCESS');

    mockedListRuns.mockResolvedValue({ data: { data: 'not-array' } as never });
    await act(async () => {
      result.current.refresh();
    });
    await waitFor(() => expect(result.current.records).toEqual([]));
  });

  it('30s 轮询：倒计时归零后重新请求', async () => {
    vi.useFakeTimers();
    try {
      const { wrapper } = createTestWrapper();
      mockListResponse([mockRecord]);

      const { result } = renderHook(() => useBackgroundTasks(true), {
        wrapper,
      });

      await flushAsync();
      expect(mockedListRuns).toHaveBeenCalledTimes(1);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(30000);
      });
      await flushAsync();

      expect(mockedListRuns).toHaveBeenCalledTimes(2);
      expect(result.current.refreshCountdown).toBe(30);
    } finally {
      vi.useRealTimers();
    }
  });

  it('手动刷新：立即重新请求并重置倒计时', async () => {
    vi.useFakeTimers();
    try {
      const { wrapper } = createTestWrapper();
      mockListResponse([mockRecord]);

      const { result } = renderHook(() => useBackgroundTasks(true), {
        wrapper,
      });

      await flushAsync();
      expect(mockedListRuns).toHaveBeenCalledTimes(1);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(10000);
      });
      expect(result.current.refreshCountdown).toBe(20);

      await act(async () => {
        result.current.refresh();
      });
      await flushAsync();

      expect(mockedListRuns).toHaveBeenCalledTimes(2);
      expect(result.current.refreshCountdown).toBe(30);
    } finally {
      vi.useRealTimers();
    }
  });

  it('请求失败时返回错误文案', async () => {
    const { wrapper } = createTestWrapper();
    mockedListRuns.mockRejectedValue(new Error('network error'));

    const { result } = renderHook(() => useBackgroundTasks(true), {
      wrapper,
    });

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error).toBe('network error');
  });

  it('无 SYSTEM_CONFIG_WRITE 权限时不读取 runtime-config，开关状态为 null', async () => {
    const { wrapper } = createTestWrapper();
    mockListResponse([mockRecord]);

    const { result } = renderHook(() => useBackgroundTasks(true), {
      wrapper,
    });

    await waitFor(() => expect(result.current.records).toHaveLength(1));
    expect(mockedGetAllConfigs).not.toHaveBeenCalled();
    expect(result.current.enabledByName).toBeNull();
    expect(result.current.canToggle).toBe(false);
  });

  it('具备 SYSTEM_CONFIG_WRITE 时读取开关状态并构建 taskName 映射', async () => {
    permissionMock.hasPermission.mockImplementation((p: string) =>
      ['SYSTEM_MONITOR', 'SYSTEM_CONFIG_WRITE'].includes(p)
    );
    const { wrapper } = createTestWrapper();
    mockListResponse([mockRecord]);
    mockedGetAllConfigs.mockResolvedValue({
      data: [
        { key: 'storageCleanupEnabled', value: true, type: 'boolean', category: 'storage', isPublic: false, updatedAt: '2026-01-01T00:00:00.000Z' },
        { key: 'cacheCleanupEnabled', value: false, type: 'boolean', category: 'cache', isPublic: false, updatedAt: '2026-01-01T00:00:00.000Z' },
        { key: 'maxFileSize', value: 100, type: 'number', category: 'file', isPublic: true, updatedAt: '2026-01-01T00:00:00.000Z' },
      ] as never,
    });

    const { result } = renderHook(() => useBackgroundTasks(true), {
      wrapper,
    });

    await waitFor(() => expect(result.current.enabledByName).not.toBeNull());
    expect(mockedGetAllConfigs).toHaveBeenCalledTimes(1);
    expect(result.current.enabledByName).toEqual({
      storageCleanupEnabled: true,
      cacheCleanupEnabled: false,
    });
    expect(result.current.canToggle).toBe(true);
  });

  it('手动触发：确认后调用 runTask 并刷新列表，结果 toast', async () => {
    const { wrapper } = createTestWrapper();
    mockListResponse([mockRecord]);
    mockedRunTask.mockResolvedValue({
      data: {
        success: true,
        taskName: 'storage-cleanup:expired-storage',
        triggeredAt: '2026-08-01T00:00:00.000Z',
      },
    });

    const { result } = renderHook(() => useBackgroundTasks(true), {
      wrapper,
    });
    await waitFor(() => expect(result.current.records).toHaveLength(1));
    expect(mockedListRuns).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.triggerTask('storage-cleanup:expired-storage');
    });

    expect(notificationMock.showConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '手动触发任务',
        message: '确定要手动触发任务 storage-cleanup:expired-storage 吗？',
      })
    );
    expect(mockedRunTask).toHaveBeenCalledWith({
      body: { taskName: 'storage-cleanup:expired-storage' },
    });
    expect(notificationMock.showToast).toHaveBeenCalledWith('任务已触发', 'success');
    expect(mockedListRuns).toHaveBeenCalledTimes(2);
  });

  it('手动触发：取消确认时不调用 runTask', async () => {
    notificationMock.showConfirm.mockResolvedValue(false);
    const { wrapper } = createTestWrapper();
    mockListResponse([mockRecord]);

    const { result } = renderHook(() => useBackgroundTasks(true), {
      wrapper,
    });
    await waitFor(() => expect(result.current.records).toHaveLength(1));

    await act(async () => {
      await result.current.triggerTask('storage-cleanup:expired-storage');
    });

    expect(mockedRunTask).not.toHaveBeenCalled();
  });

  it('手动触发失败时 toast 错误', async () => {
    const { wrapper } = createTestWrapper();
    mockListResponse([mockRecord]);
    mockedRunTask.mockRejectedValue(new Error('boom'));

    const { result } = renderHook(() => useBackgroundTasks(true), {
      wrapper,
    });
    await waitFor(() => expect(result.current.records).toHaveLength(1));

    await act(async () => {
      await result.current.triggerTask('storage-cleanup:expired-storage');
    });

    expect(notificationMock.showToast).toHaveBeenCalledWith('boom', 'error');
  });

  it('切换开关：调用 updateConfig 写入 runtime-config 并刷新配置', async () => {
    permissionMock.hasPermission.mockImplementation((p: string) =>
      ['SYSTEM_MONITOR', 'SYSTEM_CONFIG_WRITE'].includes(p)
    );
    const { wrapper } = createTestWrapper();
    mockListResponse([mockRecord]);
    mockedGetAllConfigs.mockResolvedValue({
      data: [
        { key: 'storageCleanupEnabled', value: true, type: 'boolean', category: 'storage', isPublic: false, updatedAt: '2026-01-01T00:00:00.000Z' },
      ] as never,
    });
    mockedUpdateConfig.mockResolvedValue({ data: { success: true } });

    const { result } = renderHook(() => useBackgroundTasks(true), {
      wrapper,
    });
    await waitFor(() => expect(result.current.enabledByName).not.toBeNull());
    expect(mockedGetAllConfigs).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.toggleTask('storage-cleanup:expired-storage', false);
    });

    expect(mockedUpdateConfig).toHaveBeenCalledWith({
      path: { key: 'storageCleanupEnabled' },
      body: { val: false as never },
    });
    expect(notificationMock.showToast).toHaveBeenCalledWith('任务已禁用', 'success');
    expect(mockedGetAllConfigs).toHaveBeenCalledTimes(2);
  });

  it('切换开关：无映射 key 的任务直接忽略', async () => {
    permissionMock.hasPermission.mockImplementation((p: string) =>
      ['SYSTEM_MONITOR', 'SYSTEM_CONFIG_WRITE'].includes(p)
    );
    const { wrapper } = createTestWrapper();
    mockListResponse([mockRecord]);
    mockedGetAllConfigs.mockResolvedValue({ data: [] as never });

    const { result } = renderHook(() => useBackgroundTasks(true), {
      wrapper,
    });
    await waitFor(() => expect(result.current.enabledByName).not.toBeNull());

    await act(async () => {
      await result.current.toggleTask('unknown:task', false);
    });

    expect(mockedUpdateConfig).not.toHaveBeenCalled();
  });
});
