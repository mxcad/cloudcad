///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('@/api-sdk', () => ({
  libraryControllerDownloadDrawingNode: vi.fn(),
  libraryControllerDownloadBlockNode: vi.fn(),
  libraryControllerDeleteDrawingNode: vi.fn(),
  libraryControllerDeleteBlockNode: vi.fn(),
  libraryControllerRenameDrawingNode: vi.fn(),
  libraryControllerRenameBlockNode: vi.fn(),
  libraryControllerMoveDrawingNode: vi.fn(),
  libraryControllerMoveBlockNode: vi.fn(),
  libraryControllerCopyDrawingNode: vi.fn(),
  libraryControllerCopyBlockNode: vi.fn(),
  libraryControllerCreateDrawingFolder: vi.fn(),
  libraryControllerCreateBlockFolder: vi.fn(),
  libraryControllerBatchDeleteDrawingNodes: vi.fn(),
  libraryControllerBatchDeleteBlockNodes: vi.fn(),
  libraryControllerBatchMoveDrawingNodes: vi.fn(),
  libraryControllerBatchMoveBlockNodes: vi.fn(),
  libraryControllerBatchCopyDrawingNodes: vi.fn(),
  libraryControllerBatchCopyBlockNodes: vi.fn(),
  downloadControllerDownloadNodeWithFormat: vi.fn(),
}));

vi.mock('@/languages', () => ({
  t: (msg: string, vars?: Record<string, string>) => {
    if (!vars) return msg;
    return msg.replace(/\{(\w+)\}/g, (_, key: string) => vars[key] ?? `{${key}}`);
  },
}));

vi.mock('@/utils/errorHandler', () => ({
  getErrorMessage: (e: unknown) => (e instanceof Error ? e.message : String(e)),
}));

vi.mock('@/utils/download', () => ({
  triggerBlobDownload: vi.fn(),
}));

// 会员门控预检相关 mock：默认 VIP 且开关开放（现有下载测试走真实调用链），
// 预检拦截场景在测试内通过 mock 返回值切换
const {
  useMembershipMock,
  useRuntimeConfigMock,
  handleVipFeatureRequiredErrorMock,
} = vi.hoisted(() => ({
  useMembershipMock: vi.fn(() => ({ isVip: true, tierLevel: 1 })),
  useRuntimeConfigMock: vi.fn(() => ({
    config: { freeExportDownloadEnabled: true },
    loading: false,
  })),
  handleVipFeatureRequiredErrorMock: vi.fn().mockResolvedValue(false),
}));

vi.mock('@/hooks/useMembership', () => ({
  useMembership: () => useMembershipMock(),
}));

vi.mock('@/contexts/RuntimeConfigContext', () => ({
  useRuntimeConfig: () => useRuntimeConfigMock(),
}));

vi.mock('@/utils/vipFeatureGuide', () => ({
  canExportDownload: vi.fn(
    (isVip: boolean, freeEnabled: boolean) => isVip || freeEnabled
  ),
  handleVipFeatureRequiredError: handleVipFeatureRequiredErrorMock,
}));

import {
  libraryControllerDownloadDrawingNode,
  libraryControllerDownloadBlockNode,
  libraryControllerDeleteDrawingNode,
  libraryControllerBatchDeleteDrawingNodes,
  libraryControllerBatchDeleteBlockNodes,
  downloadControllerDownloadNodeWithFormat,
} from '@/api-sdk';
import { triggerBlobDownload } from '@/utils/download';
import { useFileSystemUndoRedoStore } from '@/stores/fileSystemUndoRedoStore';
import { useLibraryOperations } from './useLibraryOperations';

const downloadWithFormatMock = downloadControllerDownloadNodeWithFormat as unknown as ReturnType<typeof vi.fn>;
const downloadDrawingMock = libraryControllerDownloadDrawingNode as unknown as ReturnType<typeof vi.fn>;
const downloadBlockMock = libraryControllerDownloadBlockNode as unknown as ReturnType<typeof vi.fn>;
const deleteDrawingMock = libraryControllerDeleteDrawingNode as unknown as ReturnType<typeof vi.fn>;
const batchDeleteDrawingMock = libraryControllerBatchDeleteDrawingNodes as unknown as ReturnType<typeof vi.fn>;
const batchDeleteBlockMock = libraryControllerBatchDeleteBlockNodes as unknown as ReturnType<typeof vi.fn>;
const triggerDownloadMock = triggerBlobDownload as unknown as ReturnType<typeof vi.fn>;

function pushMoveAction(nodeId: string) {
  useFileSystemUndoRedoStore.getState().pushAction({
    type: 'move',
    description: '移动 1 个项目',
    projectId: 'lib-1',
    nodeIds: [nodeId],
    execute: async () => {},
    rollback: async () => {},
  });
}

function renderOps(overrides: Record<string, unknown> = {}) {
  const showToast = vi.fn();
  const refreshNodes = vi.fn();
  const showConfirm = vi.fn();
  const result = renderHook(() =>
    useLibraryOperations({
      libraryType: 'drawing',
      showToast,
      refreshNodes,
      showConfirm,
      ...overrides,
    } as Parameters<typeof useLibraryOperations>[0])
  );
  return { ...result, showToast, refreshNodes, showConfirm };
}

describe('useLibraryOperations — handleDownloadWithFormat（mxweb 公开端点 / 其余格式真实转换）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    downloadWithFormatMock.mockResolvedValue({ data: new Blob(['real-pdf']) });
    downloadDrawingMock.mockResolvedValue({ data: new Blob(['real-mxweb']) });
    downloadBlockMock.mockResolvedValue({ data: new Blob(['real-mxweb']) });
  });

  it('pdf：调用 downloadControllerDownloadNodeWithFormat 并携带 format/PDF 参数', async () => {
    const { result, showToast } = renderOps();

    await act(async () => {
      await result.current.handleDownloadWithFormat('node-1', 'drawing.dwg', 'pdf', {
        width: '3000',
        height: '2000',
        colorPolicy: 'color',
      });
    });

    expect(downloadWithFormatMock).toHaveBeenCalledWith({
      path: { nodeId: 'node-1' },
      query: { format: 'pdf', width: '3000', height: '2000', colorPolicy: 'color' },
      parseAs: 'blob',
    });
    expect(downloadDrawingMock).not.toHaveBeenCalled();
    expect(downloadBlockMock).not.toHaveBeenCalled();
    expect(triggerDownloadMock).toHaveBeenCalledWith(expect.any(Blob), 'drawing.pdf');
    expect(showToast).toHaveBeenCalledWith('已下载：drawing.pdf', 'success');
  });

  it('非 VIP 且开关未开放：导出格式弹购买引导且不发请求', async () => {
    useMembershipMock.mockReturnValue({ isVip: false, tierLevel: 0 });
    useRuntimeConfigMock.mockReturnValue({
      config: { freeExportDownloadEnabled: false },
      loading: false,
    });
    const { result } = renderOps();

    await act(async () => {
      await result.current.handleDownloadWithFormat('node-1', 'drawing.dwg', 'pdf');
    });

    expect(handleVipFeatureRequiredErrorMock).toHaveBeenCalled();
    expect(downloadWithFormatMock).not.toHaveBeenCalled();
    expect(downloadDrawingMock).not.toHaveBeenCalled();

    useMembershipMock.mockReturnValue({ isVip: true, tierLevel: 1 });
    useRuntimeConfigMock.mockReturnValue({
      config: { freeExportDownloadEnabled: true },
      loading: false,
    });
  });

  it('mxweb 原格式下载不受会员门控影响（非 VIP 也可下载）', async () => {
    useMembershipMock.mockReturnValue({ isVip: false, tierLevel: 0 });
    useRuntimeConfigMock.mockReturnValue({
      config: { freeExportDownloadEnabled: false },
      loading: false,
    });
    const { result, showToast } = renderOps();

    await act(async () => {
      await result.current.handleDownloadWithFormat('node-1', 'drawing.dwg', 'mxweb');
    });

    expect(downloadDrawingMock).toHaveBeenCalled();
    expect(handleVipFeatureRequiredErrorMock).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith('已下载：drawing.mxweb', 'success');

    useMembershipMock.mockReturnValue({ isVip: true, tierLevel: 1 });
    useRuntimeConfigMock.mockReturnValue({
      config: { freeExportDownloadEnabled: true },
      loading: false,
    });
  });

  it('dwg/dxf：走 download-with-format（仅 format，无 pdfOptions）', async () => {
    const { result } = renderOps();

    await act(async () => {
      await result.current.handleDownloadWithFormat('node-1', 'drawing.mxweb', 'dwg');
      await result.current.handleDownloadWithFormat('node-1', 'drawing.mxweb', 'dxf');
    });

    expect(downloadWithFormatMock).toHaveBeenCalledWith({
      path: { nodeId: 'node-1' },
      query: { format: 'dwg' },
      parseAs: 'blob',
    });
    expect(downloadWithFormatMock).toHaveBeenCalledWith({
      path: { nodeId: 'node-1' },
      query: { format: 'dxf' },
      parseAs: 'blob',
    });
    expect(downloadDrawingMock).not.toHaveBeenCalled();
    expect(downloadBlockMock).not.toHaveBeenCalled();
    expect(triggerDownloadMock).toHaveBeenCalledWith(expect.any(Blob), 'drawing.dwg');
    expect(triggerDownloadMock).toHaveBeenCalledWith(expect.any(Blob), 'drawing.dxf');
  });

  it('dwg/dxf：携带 dwgOptions（dwgVersion）透传到 query（与编辑器侧对齐）', async () => {
    const { result } = renderOps();

    await act(async () => {
      await result.current.handleDownloadWithFormat('node-1', 'drawing.mxweb', 'dwg', undefined, {
        dwgVersion: 27,
      });
      await result.current.handleDownloadWithFormat('node-1', 'drawing.mxweb', 'dxf', undefined, {
        dwgVersion: 23,
      });
    });

    expect(downloadWithFormatMock).toHaveBeenCalledWith({
      path: { nodeId: 'node-1' },
      query: { format: 'dwg', dwgVersion: 27 },
      parseAs: 'blob',
    });
    expect(downloadWithFormatMock).toHaveBeenCalledWith({
      path: { nodeId: 'node-1' },
      query: { format: 'dxf', dwgVersion: 23 },
      parseAs: 'blob',
    });
    expect(downloadDrawingMock).not.toHaveBeenCalled();
    expect(downloadBlockMock).not.toHaveBeenCalled();
  });

  it('mxweb（图纸库）：走公开端点 libraryControllerDownloadDrawingNode，免登录语义', async () => {
    const { result, showToast } = renderOps();

    await act(async () => {
      await result.current.handleDownloadWithFormat('node-1', 'drawing.dwg', 'mxweb');
    });

    expect(downloadDrawingMock).toHaveBeenCalledWith({
      path: { nodeId: 'node-1' },
      parseAs: 'blob',
    });
    expect(downloadWithFormatMock).not.toHaveBeenCalled();
    expect(triggerDownloadMock).toHaveBeenCalledWith(expect.any(Blob), 'drawing.mxweb');
    expect(showToast).toHaveBeenCalledWith('已下载：drawing.mxweb', 'success');
  });

  it('mxweb（图块库）：走公开端点 libraryControllerDownloadBlockNode', async () => {
    const { result } = renderOps({ libraryType: 'block' });

    await act(async () => {
      await result.current.handleDownloadWithFormat('node-1', 'block.dwg', 'mxweb');
    });

    expect(downloadBlockMock).toHaveBeenCalledWith({
      path: { nodeId: 'node-1' },
      parseAs: 'blob',
    });
    expect(downloadDrawingMock).not.toHaveBeenCalled();
    expect(downloadWithFormatMock).not.toHaveBeenCalled();
    expect(triggerDownloadMock).toHaveBeenCalledWith(expect.any(Blob), 'block.mxweb');
  });

  it('后端报错（如转换限频）时提示错误且不触发下载', async () => {
    downloadWithFormatMock.mockResolvedValue({
      data: undefined,
      error: new Error('转换过于频繁'),
    });
    const { result, showToast } = renderOps();

    await act(async () => {
      await result.current.handleDownloadWithFormat('node-1', 'drawing.dwg', 'pdf');
    });

    expect(triggerDownloadMock).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith('转换过于频繁', 'error');
  });
});

describe('useLibraryOperations — handleBatchDelete（收编后的唯一入口）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('全部成功：成功 toast + 刷新列表', async () => {
    batchDeleteDrawingMock.mockResolvedValue({ data: { successCount: 2, failedCount: 0 } });
    const { result, showToast, refreshNodes } = renderOps();

    await act(async () => {
      await result.current.handleBatchDelete(['n1', 'n2']);
    });

    expect(batchDeleteDrawingMock).toHaveBeenCalledWith({
      body: { nodeIds: ['n1', 'n2'], permanently: true },
      throwOnError: false,
    });
    expect(showToast).toHaveBeenCalledWith('成功删除 2 个项目', 'success');
    expect(refreshNodes).toHaveBeenCalled();
  });

  it('部分失败：warning toast 带 successCount/failedCount，且仍刷新', async () => {
    batchDeleteDrawingMock.mockResolvedValue({ data: { successCount: 1, failedCount: 1 } });
    const { result, showToast, refreshNodes } = renderOps();

    await act(async () => {
      await result.current.handleBatchDelete(['n1', 'n2']);
    });

    expect(showToast).toHaveBeenCalledWith('成功删除 1 项，1 项失败', 'warning');
    expect(refreshNodes).toHaveBeenCalled();
  });

  it('图块库走 BatchDeleteBlockNodes', async () => {
    batchDeleteBlockMock.mockResolvedValue({ data: { successCount: 1, failedCount: 0 } });
    const { result } = renderOps({ libraryType: 'block' });

    await act(async () => {
      await result.current.handleBatchDelete(['n1']);
    });

    expect(batchDeleteBlockMock).toHaveBeenCalled();
    expect(batchDeleteDrawingMock).not.toHaveBeenCalled();
  });

  it('接口错误：error toast + 向上抛出（调用方不再重复提示）', async () => {
    batchDeleteDrawingMock.mockResolvedValue({ data: undefined, error: new Error('批量删除失败') });
    const { result, showToast } = renderOps();

    let caught: unknown;
    await act(async () => {
      try {
        await result.current.handleBatchDelete(['n1']);
      } catch (e) {
        caught = e;
      }
    });

    expect(caught).toBeInstanceOf(Error);
    expect(showToast).toHaveBeenCalledWith('批量删除失败', 'error');
  });
});

describe('useLibraryOperations — 删除后清理 undo/redo 栈（公共库永久删除不可撤销）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useFileSystemUndoRedoStore.setState({ undoStack: [], redoStack: [] });
  });

  it('handleBatchDelete 永久删除后：移除 undo 栈中引用被删节点的动作，无关动作保留', async () => {
    batchDeleteDrawingMock.mockResolvedValue({ data: { successCount: 1, failedCount: 0 } });
    pushMoveAction('n1');
    pushMoveAction('n99');
    expect(useFileSystemUndoRedoStore.getState().undoStack).toHaveLength(2);

    const { result } = renderOps();

    await act(async () => {
      await result.current.handleBatchDelete(['n1']);
    });

    const { undoStack } = useFileSystemUndoRedoStore.getState();
    expect(undoStack).toHaveLength(1);
    expect(undoStack[0]?.nodeIds).toEqual(['n99']);
  });

  it('handleDelete 永久删除后：同样清理 undo/redo 栈中引用该节点的动作', async () => {
    deleteDrawingMock.mockResolvedValue({ data: { id: 'n1' } });
    pushMoveAction('n1');
    const { result, showConfirm } = renderOps();
    showConfirm.mockImplementation((_title: unknown, _message: unknown, onConfirm: () => void) => {
      onConfirm();
    });

    await act(async () => {
      result.current.handleDelete({ id: 'n1', name: 'a.dwg' } as never);
    });

    expect(deleteDrawingMock).toHaveBeenCalledWith({
      path: { nodeId: 'n1' },
      query: { permanently: true },
      throwOnError: true,
    });
    expect(useFileSystemUndoRedoStore.getState().undoStack).toHaveLength(0);
  });
});
