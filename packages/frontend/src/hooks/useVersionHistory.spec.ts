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
      resolveWarmup({ data: new ArrayBuffer(0), error: undefined });
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
      resolveWarmup({ data: new ArrayBuffer(0), error: undefined });
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
