import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// ── mock SDK / 下载工具 / 配置 / 文案，避免真实请求与模块级副作用 ──
vi.mock('@/api-sdk', () => ({
  batchDownloadControllerCreateTask: vi.fn(),
  batchDownloadControllerCreateSingleFileTask: vi.fn(),
  batchDownloadControllerCancelTask: vi.fn(),
  batchDownloadControllerGetProgress: vi.fn(),
  batchDownloadControllerDownloadZip: vi.fn(),
  batchDownloadControllerDownloadItem: vi.fn(),
  batchDownloadControllerRetryTask: vi.fn(),
  batchDownloadControllerRetryFailedItems: vi.fn(),
  batchDownloadControllerGetUserTasks: vi.fn(),
}));

vi.mock('@/config/apiConfig', () => ({
  getApiBaseUrl: () => 'http://localhost:3001/api/v1',
}));

vi.mock('@/utils/tokenUtils', () => ({
  getValidToken: () => 'test-token',
}));

vi.mock('@/utils/download', () => ({
  getBatchTaskProgress: vi.fn(),
  downloadBatchItem: vi.fn(),
  downloadBatchZip: vi.fn(),
  triggerBlobDownload: vi.fn(),
}));

vi.mock('@/languages', () => ({
  t: (key: string) => key,
}));

vi.mock('@/utils/errorHandler', () => ({
  // 与真实实现同语义：SDK error 是带 message 的普通对象（非 Error 实例）
  getErrorMessage: (err: unknown) => {
    if (err instanceof Error) return err.message;
    if (typeof err === 'object' && err !== null && 'message' in err) {
      return String((err as { message: unknown }).message);
    }
    return String(err);
  },
}));

import {
  batchDownloadControllerCreateTask,
  batchDownloadControllerCreateSingleFileTask,
  batchDownloadControllerCancelTask,
  batchDownloadControllerRetryTask,
  batchDownloadControllerGetUserTasks,
} from '@/api-sdk';
import { getBatchTaskProgress } from '@/utils/download';
import { useBatchDownload } from './useBatchDownload';
import { useBatchDownloadStore } from '@/stores/useBatchDownloadStore';

const fileItem = { nodeId: 'node-1', fileName: 'a.mxweb', formats: ['mxweb'] };

const mockCreate = batchDownloadControllerCreateTask as ReturnType<
  typeof vi.fn
>;
const mockCreateSingleFile = batchDownloadControllerCreateSingleFileTask as ReturnType<
  typeof vi.fn
>;
const mockCancel = batchDownloadControllerCancelTask as ReturnType<
  typeof vi.fn
>;
const mockProgress = getBatchTaskProgress as ReturnType<typeof vi.fn>;
const mockGetUserTasks = batchDownloadControllerGetUserTasks as ReturnType<
  typeof vi.fn
>;

// happy-dom 无 EventSource：subscribeToProgressSSE 抛 ReferenceError 落进 catch → 返回 null
class FakeEventSource {
  close = vi.fn();
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('EventSource', FakeEventSource);
  useBatchDownloadStore.setState({ tasks: [] });
  mockCreate.mockResolvedValue({ data: { taskId: 'task-1' }, error: undefined });
  mockCreateSingleFile.mockResolvedValue({ data: { taskId: 'task-1' }, error: undefined });
  mockCancel.mockResolvedValue({ data: { message: 'Task cancelled' }, error: undefined });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function findTask(taskId: string) {
  return useBatchDownloadStore
    .getState()
    .tasks.find((t) => t.taskId === taskId);
}

describe('useBatchDownload — individual 任务状态回写（回归：曾因不回写而永远 PENDING）', () => {
  it('createIndividualTask 后 store 任务为 PENDING（基线）', async () => {
    const { result } = renderHook(() => useBatchDownload());
    const created = await result.current.createIndividualTask([fileItem]);
    expect(created?.taskId).toBe('task-1');
    expect(findTask('task-1')?.status).toBe('PENDING');
  });

  it('轮询到 COMPLETED 后 store 状态推进为 COMPLETED（核心回归）', async () => {
    const { result } = renderHook(() => useBatchDownload());
    await result.current.createIndividualTask([fileItem]);
    mockProgress.mockResolvedValue({
      ok: true,
      status: 'COMPLETED',
      completedCount: 1,
      totalCount: 1,
      errorCount: 0,
    });

    const done = await result.current.pollTaskUntilDone('task-1');

    expect(done).toEqual({ status: 'COMPLETED' });
    expect(findTask('task-1')?.status).toBe('COMPLETED');
    expect(findTask('task-1')?.completedCount).toBe(1);
  });

  it('轮询到 CANCELLED 后 store 状态推进为 CANCELLED', async () => {
    const { result } = renderHook(() => useBatchDownload());
    await result.current.createIndividualTask([fileItem]);
    mockProgress.mockResolvedValue({
      ok: true,
      status: 'CANCELLED',
      completedCount: 0,
      totalCount: 1,
      errorCount: 0,
    });

    const done = await result.current.pollTaskUntilDone('task-1');

    expect(done).toEqual({ status: 'CANCELLED' });
    expect(findTask('task-1')?.status).toBe('CANCELLED');
  });

  it('非终态轮询回写 completedCount，终态后推进为 COMPLETED（fake timers）', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useBatchDownload());
    await result.current.createIndividualTask([fileItem]);
    const onProgress = vi.fn();
    // 第 1 次：PROCESSING 2/5；第 2 次：COMPLETED 5/5
    mockProgress
      .mockResolvedValueOnce({
        ok: true,
        status: 'PROCESSING',
        completedCount: 2,
        totalCount: 5,
        errorCount: 0,
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 'COMPLETED',
        completedCount: 5,
        totalCount: 5,
        errorCount: 0,
      });

    const promise = result.current.pollTaskUntilDone(
      'task-1',
      onProgress
    );
    // advanceTimersByTimeAsync 自动交错 timer 与微任务，让紧 for 循环穿过 2000ms 等待
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    const done = await act(async () => promise);
    // 非终态轮询发生了进度回写（onProgress 收到 2/5）
    expect(onProgress).toHaveBeenCalledWith(2, 5);
    expect(done).toEqual({ status: 'COMPLETED' });
    expect(findTask('task-1')?.status).toBe('COMPLETED');
    expect(findTask('task-1')?.completedCount).toBe(5);
  });

  it('removeOnTerminal=true 时终态后从 store 移除任务（#1 不残留）', async () => {
    const { result } = renderHook(() => useBatchDownload());
    await result.current.createIndividualTask([fileItem]);
    mockProgress.mockResolvedValue({
      ok: true,
      status: 'COMPLETED',
      completedCount: 1,
      totalCount: 1,
      errorCount: 0,
    });

    const done = await result.current.pollTaskUntilDone(
      'task-1',
      undefined,
      undefined,
      true
    );

    expect(done).toEqual({ status: 'COMPLETED' });
    expect(findTask('task-1')).toBeUndefined();
  });

  it('syncIndividualTerminal：中途关闭后查一次，已终态则回写并移除（#5 防残留）', async () => {
    const { result } = renderHook(() => useBatchDownload());
    await result.current.createIndividualTask([fileItem]);
    // 模拟：用户中途关闭 dialog，任务仍 PENDING；随后后端已转 COMPLETED
    mockProgress.mockResolvedValue({
      ok: true,
      status: 'COMPLETED',
      completedCount: 1,
      totalCount: 1,
      errorCount: 0,
    });

    await result.current.syncIndividualTerminal('task-1');

    // 终态 → 回写后移除，列表不再残留"等待中"
    expect(findTask('task-1')).toBeUndefined();
  });

  it('syncIndividualTerminal：未终态时保留任务（不提前移除）', async () => {
    const { result } = renderHook(() => useBatchDownload());
    await result.current.createIndividualTask([fileItem]);
    mockProgress.mockResolvedValue({
      ok: true,
      status: 'PROCESSING',
      completedCount: 1,
      totalCount: 5,
      errorCount: 0,
    });

    await result.current.syncIndividualTerminal('task-1');

    // 未终态 → 保留任务，状态不变
    expect(findTask('task-1')?.status).toBe('PENDING');
  });

  it('cancelTask 成功后 store 状态推进为 CANCELLED', async () => {
    const { result } = renderHook(() => useBatchDownload());
    await result.current.createIndividualTask([fileItem]);

    await result.current.cancelTask('task-1');

    expect(mockCancel).toHaveBeenCalledWith({ path: { taskId: 'task-1' } });
    expect(findTask('task-1')?.status).toBe('CANCELLED');
  });
});

describe('useBatchDownload — VIP 门控错误处理（回归：购买弹窗 owner 是全局 error 拦截器，catch 不得重复 toast）', () => {
  const vipError = {
    code: 'VIP_FEATURE_REQUIRED',
    message: '导出下载为会员专属功能，开通 VIP 后即可使用',
  };

  it('createZipTask 遇 VIP_FEATURE_REQUIRED → 返回 null 且不 toast', async () => {
    const showToast = vi.fn();
    mockCreate.mockResolvedValue({ error: vipError });
    const { result } = renderHook(() => useBatchDownload(showToast));

    const taskId = await result.current.createZipTask([fileItem]);

    expect(taskId).toBeNull();
    expect(showToast).not.toHaveBeenCalled();
  });

  it('createZipTask 遇非 VIP 错误 → toast 后端消息（既有行为不变）', async () => {
    const showToast = vi.fn();
    mockCreate.mockResolvedValue({
      error: { code: 'INTERNAL_SERVER_ERROR', message: '服务器内部错误' },
    });
    const { result } = renderHook(() => useBatchDownload(showToast));

    await result.current.createZipTask([fileItem]);

    expect(showToast).toHaveBeenCalledWith('服务器内部错误', 'error');
  });

  it('retryTask 遇 VIP_FEATURE_REQUIRED → 不 toast', async () => {
    const showToast = vi.fn();
    const mockRetry = batchDownloadControllerRetryTask as ReturnType<
      typeof vi.fn
    >;
    mockRetry.mockResolvedValue({ error: vipError });
    const { result } = renderHook(() => useBatchDownload(showToast));

    await result.current.retryTask('task-1');

    expect(showToast).not.toHaveBeenCalled();
  });
});

describe('useBatchDownload — syncTasksFromServer 顺序（最新在前）', () => {
  it('服务端倒序返回的多条任务同步后仍保持最新在前', async () => {
    // 后端 getUserTasks 按 createdAt desc 返回（srv-new 比 srv-old 新）
    mockGetUserTasks.mockResolvedValue({
      error: undefined,
      data: {
        hasMore: false,
        tasks: [
          {
            taskId: 'srv-new',
            status: 'COMPLETED',
            mode: 'zip',
            totalCount: 1,
            completedCount: 1,
            errorCount: 0,
            itemNames: ['new.dwg'],
          },
          {
            taskId: 'srv-old',
            status: 'COMPLETED',
            mode: 'zip',
            totalCount: 1,
            completedCount: 1,
            errorCount: 0,
            itemNames: ['old.dwg'],
          },
        ],
      },
    } as never);

    const { result } = renderHook(() => useBatchDownload());
    await act(async () => {
      await result.current.syncTasksFromServer();
    });

    // addTask 是前置插入，须反序插入才能保持服务端顺序（否则最旧排到最前）
    expect(
      useBatchDownloadStore.getState().tasks.map((t) => t.taskId)
    ).toEqual(['srv-new', 'srv-old']);
  });
});

describe('useBatchDownload — 单文件格式下载走独立路由（回归：曾被批量下载开关误拦）', () => {
  it('createSingleFormatTask 调 single-file 路由，不触碰批量任务路由', async () => {
    const { result } = renderHook(() => useBatchDownload());

    const taskId = await result.current.createSingleFormatTask(
      'node-9',
      'a.mxweb',
      'dwg',
      { projectId: 'proj-1', dwgVersion: 23 }
    );

    expect(taskId).toBe('task-1');
    expect(mockCreateSingleFile).toHaveBeenCalledTimes(1);
    // 平铺 DTO：单文件 + 单格式，不经过 fileList/mode
    expect(mockCreateSingleFile).toHaveBeenCalledWith({
      body: {
        nodeId: 'node-9',
        fileName: 'a.mxweb',
        format: 'dwg',
        projectId: 'proj-1',
        libraryType: undefined,
        dwgVersion: 23,
        width: undefined,
        height: undefined,
        colorPolicy: undefined,
      },
    });
    // 批量下载路由必须未被调用——否则批量开关关闭时单文件格式下载会被 403 拦掉
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('createSingleFormatTask 创建 individual 任务并注册自动下载', async () => {
    const { result } = renderHook(() => useBatchDownload());

    await result.current.createSingleFormatTask('node-9', 'a.mxweb', 'pdf');

    expect(findTask('task-1')?.mode).toBe('individual');
    expect(findTask('task-1')?.totalCount).toBe(1);
    expect(findTask('task-1')?.autoDownload).toBe(true);
  });

  it('createFileHashTask 调 single-file 路由并传 fileHash（不传 nodeId），不触碰批量任务路由', async () => {
    const { result } = renderHook(() => useBatchDownload());

    const taskId = await result.current.createFileHashTask(
      'hash-abc',
      'drawing.mxweb',
      'dwg',
      { dwgVersion: 23 }
    );

    expect(taskId).toBe('task-1');
    expect(mockCreateSingleFile).toHaveBeenCalledTimes(1);
    // fileHash-only（CAD 编辑器内存导出上传的临时文件）：body 传 fileHash，nodeId 缺省
    expect(mockCreateSingleFile).toHaveBeenCalledWith({
      body: {
        fileHash: 'hash-abc',
        fileName: 'drawing.mxweb',
        format: 'dwg',
        dwgVersion: 23,
        width: undefined,
        height: undefined,
        colorPolicy: undefined,
        projectId: undefined,
        libraryType: undefined,
      },
    });
    // 批量下载路由必须未被调用——否则批量开关关闭时内存导出会被 403 拦掉
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
