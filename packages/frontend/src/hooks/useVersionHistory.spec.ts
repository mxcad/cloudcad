import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useVersionHistory } from './useVersionHistory';
import type { FileSystemNode } from '../types/filesystem';

vi.mock('@/api-sdk', () => ({
  versionControlControllerGetFileHistory: vi.fn(),
  mxcadFileAccessControllerGetFilesDataFile: vi.fn(),
}));

import {
  versionControlControllerGetFileHistory,
  mxcadFileAccessControllerGetFilesDataFile,
} from '@/api-sdk';

const mockedGetFileHistory = vi.mocked(versionControlControllerGetFileHistory);
const mockedGetFilesDataFile = vi.mocked(
  mxcadFileAccessControllerGetFilesDataFile
);

function makeNode(overrides: Partial<FileSystemNode> = {}): FileSystemNode {
  return {
    id: 'node-1',
    name: 'drawing.dwg',
    nodeType: 'FILE',
    isFolder: false,
    isRoot: false,
    parentId: 'project-1',
    path: '202608/node-1/abc123.dwg.mxweb',
    ...overrides,
  } as FileSystemNode;
}

describe('useVersionHistory — 历史版本打开预热（warmup）', () => {
  let openSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockedGetFileHistory.mockReset();
    mockedGetFilesDataFile.mockReset();
    // handleShowVersionHistory 的默认成功返回（避免读取 undefined 的 stderr 噪音）
    mockedGetFileHistory.mockResolvedValue({
      data: { success: true, entries: [], totalCount: 0, message: 'ok' },
      error: undefined,
    } as never);
    openSpy = vi
      .spyOn(window, 'open')
      .mockImplementation(() => null as unknown as Window);
  });

  afterEach(() => {
    openSpy.mockRestore();
  });

  it('预热成功：调用 SDK（v + warmup=1）后打开编辑器 URL', async () => {
    mockedGetFilesDataFile.mockResolvedValue({
      data: new ArrayBuffer(0),
      error: undefined,
      response: { status: 204 },
    } as never);

    const { result } = renderHook(() =>
      useVersionHistory({ projectId: 'project-1' })
    );
    act(() => {
      result.current.setShowVersionHistoryModal(true);
    });
    // 通过内部状态注入节点：直接调用 handleShowVersionHistory 后再打开版本
    await act(async () => {
      await result.current.handleShowVersionHistory(makeNode());
    });
    await act(async () => {
      await result.current.handleOpenHistoricalVersion(3);
    });

    expect(mockedGetFilesDataFile).toHaveBeenCalledTimes(1);
    expect(mockedGetFilesDataFile).toHaveBeenCalledWith(
      expect.objectContaining({
        path: { path: '202608/node-1/abc123.dwg.mxweb' },
        query: { v: '3', warmup: '1' },
      })
    );
    expect(openSpy).toHaveBeenCalledTimes(1);
    expect(openSpy.mock.calls[0][0]).toContain('node-1');
    expect(openSpy.mock.calls[0][0]).toContain('v=3');
    expect(result.current.openingRevision).toBeNull();
    expect(result.current.openingVersionError).toBeNull();
  });

  it('预热期间 openingRevision 置位（按钮 loading / 等待提示），完成后清空', async () => {
    let resolveWarmup!: (v: {
      data?: ArrayBuffer;
      error?: { status?: number };
      response?: { status: number };
    }) => void;
    mockedGetFilesDataFile.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveWarmup = resolve;
        })
    );

    const { result } = renderHook(() =>
      useVersionHistory({ projectId: 'project-1' })
    );
    await act(async () => {
      await result.current.handleShowVersionHistory(makeNode());
    });

    let pending!: Promise<void>;
    act(() => {
      pending = result.current.handleOpenHistoricalVersion(3);
    });
    // 预热进行中：openingRevision 置位，window.open 未触发
    expect(result.current.openingRevision).toBe(3);
    expect(openSpy).not.toHaveBeenCalled();

    await act(async () => {
      resolveWarmup({ data: new ArrayBuffer(0), error: undefined, response: { status: 204 } });
      await pending;
    });
    expect(result.current.openingRevision).toBeNull();
    expect(openSpy).toHaveBeenCalledTimes(1);
  });

  it('预热失败（401）：提示登录过期，不打开编辑器', async () => {
    mockedGetFilesDataFile.mockResolvedValue({
      data: undefined,
      error: { code: 'UNAUTHORIZED', message: '未授权' },
    } as never);

    const { result } = renderHook(() =>
      useVersionHistory({ projectId: 'project-1' })
    );
    await act(async () => {
      await result.current.handleShowVersionHistory(makeNode());
    });
    await act(async () => {
      await result.current.handleOpenHistoricalVersion(3);
    });

    expect(openSpy).not.toHaveBeenCalled();
    expect(result.current.openingVersionError).toBe('请登录后访问此文件');
    expect(result.current.openingRevision).toBeNull();
  });

  it('预热失败（其他错误）：透传后端 message，不打开编辑器', async () => {
    mockedGetFilesDataFile.mockResolvedValue({
      data: undefined,
      error: { code: 'INTERNAL_SERVER_ERROR', message: '服务器内部错误' },
    } as never);

    const { result } = renderHook(() =>
      useVersionHistory({ projectId: 'project-1' })
    );
    await act(async () => {
      await result.current.handleShowVersionHistory(makeNode());
    });
    await act(async () => {
      await result.current.handleOpenHistoricalVersion(3);
    });

    expect(openSpy).not.toHaveBeenCalled();
    expect(result.current.openingVersionError).toBe('服务器内部错误');
  });

  it('预热异常抛出：透传真实错误，不打开编辑器', async () => {
    mockedGetFilesDataFile.mockRejectedValue(new Error('network down'));

    const { result } = renderHook(() =>
      useVersionHistory({ projectId: 'project-1' })
    );
    await act(async () => {
      await result.current.handleShowVersionHistory(makeNode());
    });
    await act(async () => {
      await result.current.handleOpenHistoricalVersion(3);
    });

    expect(openSpy).not.toHaveBeenCalled();
    expect(result.current.openingVersionError).toBe('network down');
  });

  it('防重入：预热进行中重复点击被忽略（SDK 仅调用一次）', async () => {
    let resolveWarmup!: (v: {
      data?: ArrayBuffer;
      error?: { status?: number };
      response?: { status: number };
    }) => void;
    mockedGetFilesDataFile.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveWarmup = resolve;
        })
    );

    const { result } = renderHook(() =>
      useVersionHistory({ projectId: 'project-1' })
    );
    await act(async () => {
      await result.current.handleShowVersionHistory(makeNode());
    });

    let first!: Promise<void>;
    act(() => {
      first = result.current.handleOpenHistoricalVersion(3);
    });
    act(() => {
      void result.current.handleOpenHistoricalVersion(4); // 预热中，应被忽略
    });
    expect(mockedGetFilesDataFile).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveWarmup({ data: new ArrayBuffer(0), error: undefined, response: { status: 204 } });
      await first;
    });
    // 仅第一个版本被打开
    expect(openSpy).toHaveBeenCalledTimes(1);
    expect(openSpy.mock.calls[0][0]).toContain('v=3');
  });

  it('closeVersionHistory 清理预热状态', async () => {
    const { result } = renderHook(() =>
      useVersionHistory({ projectId: 'project-1' })
    );
    act(() => {
      result.current.setShowVersionHistoryModal(true);
    });
    await act(async () => {
      await result.current.handleShowVersionHistory(makeNode());
    });

    act(() => {
      result.current.closeVersionHistory();
    });
    expect(result.current.showVersionHistoryModal).toBe(false);
    expect(result.current.openingRevision).toBeNull();
    expect(result.current.openingVersionError).toBeNull();
  });
});

describe('useVersionHistory — 预热 202/204 轮询（后端异步转换）', () => {
  let openSpy: ReturnType<typeof vi.spyOn>;

  async function openAndWait() {
    const { result } = renderHook(() =>
      useVersionHistory({ projectId: 'project-1' })
    );
    await act(async () => {
      await result.current.handleShowVersionHistory(makeNode());
    });
    return result;
  }

  beforeEach(() => {
    mockedGetFileHistory.mockReset();
    mockedGetFilesDataFile.mockReset();
    mockedGetFileHistory.mockResolvedValue({
      data: { success: true, entries: [], totalCount: 0, message: 'ok' },
      error: undefined,
    } as never);
    openSpy = vi
      .spyOn(window, 'open')
      .mockImplementation(() => null as unknown as Window);
  });

  afterEach(() => {
    vi.useRealTimers();
    openSpy.mockRestore();
  });

  it('首次返回 202（转换进行中）：不提前打开编辑器，轮询到 204 后才打开', async () => {
    vi.useFakeTimers();
    let resolveReady!: (value: {
      data?: ArrayBuffer;
      error?: unknown;
      response?: { status: number };
    }) => void;
    mockedGetFilesDataFile
      .mockResolvedValueOnce({
        data: new ArrayBuffer(0),
        error: undefined,
        response: { status: 202 },
      } as never)
      .mockImplementationOnce(() => {
        return new Promise((resolve) => {
          resolveReady = resolve;
        });
      });

    const result = await openAndWait();
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.handleOpenHistoricalVersion(3);
    });

    // 首次响应 202：只等下一次轮询，绝不提前打开编辑器
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(mockedGetFilesDataFile).toHaveBeenCalledTimes(1);
    expect(openSpy).not.toHaveBeenCalled();
    expect(result.current.openingRevision).toBe(3);

    // 轮询间隔过后进入第二次请求，仍未打开
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(mockedGetFilesDataFile).toHaveBeenCalledTimes(2);
    expect(openSpy).not.toHaveBeenCalled();

    // 转换彻底完成（204）后才打开编辑器
    await act(async () => {
      resolveReady({
        data: new ArrayBuffer(0),
        error: undefined,
        response: { status: 204 },
      });
      await pending;
    });
    expect(openSpy).toHaveBeenCalledTimes(1);
    expect(openSpy.mock.calls[0][0]).toContain('v=3');
    expect(result.current.openingRevision).toBeNull();
  });

  it('持续 202 超过等待上限：提示超时，不打开编辑器', async () => {
    vi.useFakeTimers();
    // 直接推进系统时钟越过等待上限：不真实推进 6 分钟（约 180 次轮询）
    const clockAtStart = Date.now();
    mockedGetFilesDataFile.mockImplementation(() => {
      vi.setSystemTime(clockAtStart + 360_001);
      return {
        data: new ArrayBuffer(0),
        error: undefined,
        response: { status: 202 },
      } as never;
    });

    const result = await openAndWait();
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.handleOpenHistoricalVersion(3);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
      await pending;
    });

    expect(mockedGetFilesDataFile).toHaveBeenCalledTimes(1);
    expect(openSpy).not.toHaveBeenCalled();
    expect(result.current.openingVersionError).toBe(
      '历史版本文件准备超时，请稍后重试'
    );
    expect(result.current.openingRevision).toBeNull();
  });

  it('轮询中后端返回错误：立即停止轮询（不重试），提示具体原因', async () => {
    mockedGetFilesDataFile.mockResolvedValueOnce({
      data: undefined,
      error: { code: 'INTERNAL_SERVER_ERROR', message: '历史版本转换失败' },
    } as never);

    const result = await openAndWait();
    await act(async () => {
      await result.current.handleOpenHistoricalVersion(3);
    });

    expect(mockedGetFilesDataFile).toHaveBeenCalledTimes(1);
    expect(openSpy).not.toHaveBeenCalled();
    expect(result.current.openingVersionError).toBe('历史版本转换失败');
  });

  it('轮询中关闭弹窗：中止轮询、不打开编辑器，且不影响后续打开', async () => {
    vi.useFakeTimers();
    mockedGetFilesDataFile.mockResolvedValue({
      data: new ArrayBuffer(0),
      error: undefined,
      response: { status: 202 },
    } as never);

    const result = await openAndWait();
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.handleOpenHistoricalVersion(3);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(mockedGetFilesDataFile).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.closeVersionHistory();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
      await pending;
    });
    // 关闭后不再轮询、不打开编辑器
    expect(mockedGetFilesDataFile).toHaveBeenCalledTimes(1);
    expect(openSpy).not.toHaveBeenCalled();

    // 在途标志未泄漏：随后打开另一版本仍正常
    mockedGetFilesDataFile.mockResolvedValue({
      data: new ArrayBuffer(0),
      error: undefined,
      response: { status: 204 },
    } as never);
    await act(async () => {
      await result.current.handleShowVersionHistory(makeNode());
    });
    await act(async () => {
      await result.current.handleOpenHistoricalVersion(5);
    });
    expect(openSpy).toHaveBeenCalledTimes(1);
    expect(openSpy.mock.calls[0][0]).toContain('v=5');
  });
});

describe('useVersionHistory — 打开 URL 的 back 记录', () => {
  let openSpy: ReturnType<typeof vi.spyOn>;

  async function openVersion() {
    mockedGetFilesDataFile.mockResolvedValue({
      data: new ArrayBuffer(0),
      error: undefined,
      response: { status: 204 },
    } as never);
    const { result } = renderHook(() =>
      useVersionHistory({ projectId: 'project-1' })
    );
    await act(async () => {
      await result.current.handleShowVersionHistory(makeNode());
    });
    await act(async () => {
      await result.current.handleOpenHistoricalVersion(3);
    });
    expect(openSpy).toHaveBeenCalledTimes(1);
    return openSpy.mock.calls[0][0] as string;
  }

  beforeEach(() => {
    // 上游轮询用例使用 fake timers，若其超时中断会泄漏到本组导致 renderHook 结果失效
    vi.useRealTimers();
    mockedGetFileHistory.mockReset();
    mockedGetFilesDataFile.mockReset();
    mockedGetFileHistory.mockResolvedValue({
      data: { success: true, entries: [], totalCount: 0, message: 'ok' },
      error: undefined,
    } as never);
    window.history.replaceState(null, '', '/projects/project-1/files');
    openSpy = vi
      .spyOn(window, 'open')
      .mockImplementation(() => null as unknown as Window);
  });

  afterEach(() => {
    openSpy.mockRestore();
    window.history.replaceState(null, '', '/');
  });

  it('管理类页面打开版本：back 记录当前页面地址', async () => {
    const url = await openVersion();

    expect(url).toContain('back=%2Fprojects%2Fproject-1%2Ffiles');
  });

  it('编辑器内打开版本：不记录 CAD 编辑器地址（避免 back 递归套娃）', async () => {
    window.history.replaceState(
      null,
      '',
      '/cad-editor/node-1?nodeId=project-1&back=%2Fcad-editor%2Fnode-1%3FnodeId%3Dproject-1'
    );

    const url = await openVersion();

    const back = new URLSearchParams(url.split('?')[1]).get('back');
    expect(back ?? '').not.toMatch(/^\/cad-editor/);
  });

  it('编辑器内打开版本且已有管理类 back：沿用该 back', async () => {
    window.history.replaceState(
      null,
      '',
      '/cad-editor/node-1?nodeId=project-1&back=%2Fprojects%2Fproject-1%2Ffiles'
    );

    const url = await openVersion();

    const back = new URLSearchParams(url.split('?')[1]).get('back');
    expect(back).toBe('/projects/project-1/files');
  });
});
