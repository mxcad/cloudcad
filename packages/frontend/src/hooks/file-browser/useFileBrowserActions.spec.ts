///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { useFileBrowserActions } from './useFileBrowserActions';
import type { UseFileBrowserActionsOptions } from './useFileBrowserActions';
import type { UseFileBrowserDataReturn } from './useFileBrowserData';
import type { UseFileBrowserSelectionReturn } from './useFileBrowserSelection';
import { useFileSystemClipboardStore } from '@/stores/fileSystemClipboardStore';
import { useFileSystemUndoRedoStore } from '@/stores/fileSystemUndoRedoStore';
import type { FileSystemNode } from '@/types/filesystem';

vi.mock('@/api-sdk', () => ({
  nodeControllerMoveNode: vi.fn(),
  nodeControllerCopyNode: vi.fn(),
  nodeControllerBatchMoveNodes: vi.fn(),
  nodeControllerBatchCopyNodes: vi.fn(),
  nodeControllerLookupNodes: vi.fn(),
  nodeControllerCreateFolder: vi.fn(),
  nodeControllerCreateDrawing: vi.fn(),
  nodeControllerUpdateNode: vi.fn(),
  nodeControllerDeleteNode: vi.fn(),
  nodeControllerBatchDeleteNodes: vi.fn(),
  nodeControllerRestoreNode: vi.fn(),
  trashControllerRestoreTrashItems: vi.fn(),
  memberControllerGetUserProjectPermissions: vi.fn(),
  projectControllerCreateProject: vi.fn(),
  // 跨项目转移门控：查询项目 6 域 transfer 设置
  projectControllerGetProject: vi.fn(),
}));

vi.mock('@/languages', () => ({
  t: (msg: string) => msg,
}));

vi.mock('@/utils/errorHandler', () => ({
  handleError: (error: unknown) => ({
    message: error instanceof Error ? error.message : String(error),
    severity: 'medium' as const,
    details: error,
  }),
}));

import {
  nodeControllerBatchMoveNodes,
  nodeControllerBatchCopyNodes,
} from '@/api-sdk';

const moveMock = nodeControllerBatchMoveNodes as unknown as ReturnType<
  typeof vi.fn
>;
const copyMock = nodeControllerBatchCopyNodes as unknown as ReturnType<
  typeof vi.fn
>;

const nodeA = { id: 'a', name: 'a.dwg', isFolder: false, parentId: 'p1' };
const nodeB = { id: 'b', name: 'b.dwg', isFolder: false, parentId: 'p1' };

function buildData(overrides: Record<string, unknown> = {}) {
  return {
    nodes: [nodeA, nodeB],
    currentNode: null,
    urlProjectId: 'proj-1',
    refresh: vi.fn(),
    removeLocalNode: vi.fn(),
    updateLocalNode: vi.fn(),
    breadcrumbs: [],
    ...overrides,
  } as unknown as UseFileBrowserDataReturn;
}

function buildSelection(overrides: Record<string, unknown> = {}) {
  return {
    selectedNodes: new Set<string>(),
    handleNodeSelect: vi.fn(),
    handleSelectAll: vi.fn(),
    clearSelection: vi.fn(),
    selectMany: vi.fn(),
    isBatchMode: false,
    setBatchMode: vi.fn(),
    canBatch: true,
    selectionVisible: true,
    selectedNodesArray: [],
    ...overrides,
  } as UseFileBrowserSelectionReturn;
}

function renderActions(overrides: Partial<UseFileBrowserActionsOptions> = {}) {
  const options: UseFileBrowserActionsOptions = {
    data: buildData(),
    selection: buildSelection(),
    permissions: { canMove: true, canCopy: true, canDelete: true },
    mode: 'project',
    showToast: vi.fn(),
    showConfirm: vi.fn(),
    projectId: 'proj-1',
    targetParentId: 'proj-1',
    undoProjectId: 'proj-1',
    refresh: vi.fn(),
    ...overrides,
  };
  const rendered = renderHook(() => useFileBrowserActions(options), {
    wrapper: ({ children }: { children: ReactNode }) =>
      createElement(
        QueryClientProvider,
        { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) },
        createElement(MemoryRouter, null, children)
      ),
  });
  return { ...rendered, options };
}

function setupClipboardStore(
  items: string[],
  mode: 'copy' | 'cut',
  sourceProjectId = '',
  sourceParentIds: Record<string, string> = {}
) {
  // act 包裹：避免已挂载组件（同测试内多次 renderActions）收到 store 更新时无 act 告警
  act(() => {
    useFileSystemClipboardStore.setState({
      items,
      mode,
      sourceProjectId,
      sourceParentIds,
    });
  });
}

describe('useFileBrowserActions — 剪贴板 cut/copy/paste 权限矩阵 + CRUD 契约', () => {
  let pushSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    moveMock.mockResolvedValue({
      data: { successIds: [], failedIds: [], failedCount: 0 },
    });
    copyMock.mockResolvedValue({
      data: { successIds: [], failedIds: [], failedCount: 0 },
    });
    pushSpy = vi
      .spyOn(useFileSystemUndoRedoStore.getState(), 'pushAction')
      .mockImplementation(() => {});
  });

  // 卸载组件 + 重置剪贴板 store：避免跨测试的 store 更新触发已挂载组件
  // re-render（Zustand setState 无 act 包裹时产生 React act 警告）
  afterEach(() => {
    cleanup();
    useFileSystemClipboardStore.setState({
      items: [],
      mode: null,
      sourceProjectId: '',
      sourceRootKind: 'project',
      sourceTransferSettings: null,
      sourceParentIds: {},
    });
  });

  describe('clipboard.copy / clipboard.cut（写入剪贴板）', () => {
    it('copy 选中项：setClipboard + 成功提示（无权限时报错不写）', async () => {
      const showToast = vi.fn();
      const { result } = renderActions({
        selection: buildSelection({
          selectedNodes: new Set(['a', 'b']),
        }),
        showToast,
      });
      // await act 以 flush 跨项目策略快照的异步 setState
      await act(async () => {
        result.current.clipboard.copy();
      });
      expect(
        useFileSystemClipboardStore.getState().items
      ).toEqual(['a', 'b']);
      expect(useFileSystemClipboardStore.getState().mode).toBe('copy');
      expect(showToast).toHaveBeenCalledWith(
        expect.stringContaining('已复制'),
        'info'
      );

      const noPerm = renderActions({
        permissions: { canMove: true, canCopy: false },
        selection: buildSelection({ selectedNodes: new Set(['a']) }),
        showToast,
      });
      await act(async () => {
        noPerm.result.current.clipboard.copy();
      });
      expect(showToast).toHaveBeenCalledWith('没有复制权限', 'error');
    });

    it('cut 选中项：setClipboard(cut) + sourceParentIds 记录', async () => {
      const { result } = renderActions({
        selection: buildSelection({ selectedNodes: new Set(['a']) }),
      });
      await act(async () => {
        result.current.clipboard.cut();
      });
      const state = useFileSystemClipboardStore.getState();
      expect(state.items).toEqual(['a']);
      expect(state.mode).toBe('cut');
      expect(state.sourceParentIds).toEqual({ a: 'p1' });
    });

    it('未选中时 copy/cut 提示不执行', () => {
      const showToast = vi.fn();
      const { result } = renderActions({ showToast });
      act(() => result.current.clipboard.copy());
      act(() => result.current.clipboard.cut());
      expect(showToast).toHaveBeenCalledWith('请先选择要复制的文件', 'info');
      expect(showToast).toHaveBeenCalledWith('请先选择要剪切的文件', 'info');
    });
  });

  describe('clipboard.paste（粘贴收敛契约，对齐 useProjectDrawingsClipboard）', () => {
    it('cut 粘贴：单次批量移动 + pushAction move 动作 + 清空剪贴板 + 刷新', async () => {
      setupClipboardStore(['a', 'b'], 'cut', 'proj-1', { a: 'p1', b: 'p1' });
      moveMock.mockResolvedValue({
        data: { successIds: ['a', 'b'], failedIds: [], failedCount: 0 },
      });
      const data = buildData();
      const selection = buildSelection();
      const { result, options } = renderActions({ data, selection });

      await act(async () => {
        await result.current.clipboard.paste();
      });

      expect(moveMock).toHaveBeenCalledTimes(1);
      expect(moveMock).toHaveBeenCalledWith({
        body: { nodeIds: ['a', 'b'], targetParentId: 'proj-1' },
        throwOnError: true,
      });
      expect(pushSpy).toHaveBeenCalledTimes(1);
      const action = pushSpy.mock.calls[0][0];
      expect(action.type).toBe('move');
      expect(action.description).toBe('移动 2 个项目');
      expect(action.projectId).toBe('proj-1');
      expect(useFileSystemClipboardStore.getState().items).toEqual([]);
      expect(options.refresh).toHaveBeenCalledTimes(1);
    });

    it('copy 粘贴：单次批量复制 + paste-copy 动作', async () => {
      setupClipboardStore(['a', 'b'], 'copy', 'proj-1');
      copyMock.mockResolvedValue({
        data: { successIds: ['new-a', 'new-b'], failedIds: [], failedCount: 0 },
      });
      const { result, options } = renderActions();

      await act(async () => {
        await result.current.clipboard.paste();
      });

      expect(copyMock).toHaveBeenCalledTimes(1);
      expect(pushSpy).toHaveBeenCalledTimes(1);
      expect(pushSpy.mock.calls[0][0].type).toBe('paste-copy');
      // copy 粘贴不清空剪贴板，但刷新数据
      expect(useFileSystemClipboardStore.getState().items).toEqual(['a', 'b']);
      expect(options.refresh).toHaveBeenCalledTimes(1);
    });

    it('无移动权限：不调 API + 提示（对齐主页面文案）', async () => {
      setupClipboardStore(['a'], 'cut', 'proj-1');
      const showToast = vi.fn();
      const { result } = renderActions({
        permissions: { canMove: false, canCopy: true },
        showToast,
      });

      await act(async () => {
        await result.current.clipboard.paste();
      });

      expect(moveMock).toHaveBeenCalledTimes(0);
      expect(pushSpy).toHaveBeenCalledTimes(0);
      expect(showToast).toHaveBeenCalledWith('没有移动权限', 'error');
    });

    it('无复制权限：不调 API + 提示', async () => {
      setupClipboardStore(['a'], 'copy', 'proj-1');
      const showToast = vi.fn();
      const { result } = renderActions({
        permissions: { canMove: true, canCopy: false },
        showToast,
      });

      await act(async () => {
        await result.current.clipboard.paste();
      });

      expect(copyMock).toHaveBeenCalledTimes(0);
      expect(pushSpy).toHaveBeenCalledTimes(0);
      expect(showToast).toHaveBeenCalledWith('没有复制权限', 'error');
    });

    it('跨项目 cut 粘贴：先弹确认框，确认后执行移动', async () => {
      setupClipboardStore(['a'], 'cut', 'other-proj', { a: 'p1' });
      moveMock.mockResolvedValue({
        data: { successIds: ['a'], failedIds: [], failedCount: 0 },
      });
      const showConfirm = vi.fn();
      const { result } = renderActions({ showConfirm });

      await act(async () => {
        await result.current.clipboard.paste();
      });

      // 确认前不调 API
      expect(moveMock).toHaveBeenCalledTimes(0);
      expect(showConfirm).toHaveBeenCalledTimes(1);

      // 确认后执行移动并清空剪贴板
      const onConfirm = showConfirm.mock.calls[0][2];
      await act(async () => {
        await onConfirm();
      });
      expect(moveMock).toHaveBeenCalledTimes(1);
      expect(useFileSystemClipboardStore.getState().items).toEqual([]);
    });

    it('跨项目 copy 粘贴：不再拦截，直接复制（后端策略兜底）', async () => {
      setupClipboardStore(['a'], 'copy', 'other-proj');
      const showToast = vi.fn();
      const { result } = renderActions({ showToast });

      await act(async () => {
        await result.current.clipboard.paste();
      });

      expect(copyMock).toHaveBeenCalledTimes(1);
      expect(copyMock).toHaveBeenCalledWith({
        body: { nodeIds: ['a'], targetParentId: 'proj-1' },
        throwOnError: true,
      });
    });

    it('部分失败：成功项注册 undo，失败计数提示', async () => {
      setupClipboardStore(['a', 'b'], 'cut', 'proj-1', { a: 'p1', b: 'p1' });
      moveMock.mockResolvedValue({
        data: {
          successIds: ['a'],
          failedIds: ['b'],
          failedCount: 1,
          errors: ['节点 b: quota exceeded'],
        },
      });
      const showToast = vi.fn();
      const { result } = renderActions({ showToast });

      await act(async () => {
        await result.current.clipboard.paste();
      });

      expect(pushSpy).toHaveBeenCalledTimes(1);
      expect(pushSpy.mock.calls[0][0].description).toBe('移动 1 个项目');
      expect(showToast).toHaveBeenCalledWith(
        expect.stringContaining('{failedCount} 项失败'),
        'warning'
      );
    });

    it('全部失败：error toast、不注册 undo、剪贴板保留', async () => {
      setupClipboardStore(['a'], 'cut', 'proj-1', { a: 'p1' });
      moveMock.mockRejectedValue(new Error('boom'));
      const showToast = vi.fn();
      const { result } = renderActions({ showToast });

      await act(async () => {
        await result.current.clipboard.paste();
      });

      expect(pushSpy).toHaveBeenCalledTimes(0);
      expect(useFileSystemClipboardStore.getState().items).toEqual(['a']);
      expect(showToast).toHaveBeenCalledWith('boom', 'error');
    });

    it('剪贴板含父目录与子节点时去重（只保留父目录）', async () => {
      // nodes: a.parentId='p1'，b.parentId='p1'；剪贴板含 a（子）与 p1（父）→ 去重保留 p1
      setupClipboardStore(['a', 'p1'], 'cut', 'proj-1', {
        a: 'p1',
        p1: '',
      });
      const { result } = renderActions();

      await act(async () => {
        await result.current.clipboard.paste();
      });

      expect(moveMock).toHaveBeenCalledTimes(1);
      expect(moveMock).toHaveBeenCalledWith({
        body: { nodeIds: ['p1'], targetParentId: 'proj-1' },
        throwOnError: true,
      });
    });

    it('环防护：剪贴板项是当前目录祖先（面包屑命中）时不粘贴该项', async () => {
      // 剪贴板含 a（普通项）与 anc（当前目录 cur 的祖先）→ 仅粘贴 a
      setupClipboardStore(['a', 'anc'], 'cut', 'proj-1', { a: 'p1' });
      moveMock.mockResolvedValue({
        data: { successIds: ['a'], failedIds: [], failedCount: 0 },
      });
      const data = buildData({
        currentNode: { id: 'cur', name: 'cur', isFolder: true },
      });
      const { result } = renderActions({
        data,
        breadcrumbs: [
          { id: 'proj-1', name: 'P' } as never,
          { id: 'anc', name: 'ANC' } as never,
        ],
      });

      await act(async () => {
        await result.current.clipboard.paste();
      });

      expect(moveMock).toHaveBeenCalledTimes(1);
      expect(moveMock).toHaveBeenCalledWith({
        body: { nodeIds: ['a'], targetParentId: 'proj-1' },
        throwOnError: true,
      });
    });
  });

  describe('canPaste 派生（权限矩阵）', () => {
    it('粘贴=在目标创建节点：canCreate 门控（跨项目后源权限位不可用）', () => {
      setupClipboardStore(['a'], 'cut');
      const noCreate = renderActions({
        permissions: { canCreate: false, canMove: true, canCopy: true },
      });
      expect(noCreate.result.current.clipboard.canPaste).toBe(false);

      setupClipboardStore(['a'], 'copy');
      const withCreate = renderActions({
        permissions: { canCreate: true, canMove: false, canCopy: false },
      });
      expect(withCreate.result.current.clipboard.canPaste).toBe(true);
    });
  });

  describe('enableTrash 子域开关 + onOpen 注入', () => {
    it('enableTrash=false（默认）：restore/batchRestore/clearTrash 为 undefined', () => {
      const { result } = renderActions();
      expect(result.current.restore).toBeUndefined();
      expect(result.current.batchRestore).toBeUndefined();
      expect(result.current.clearTrash).toBeUndefined();
    });

    it('enableTrash=true：透传注入的 trash 委托', () => {
      const restore = vi.fn();
      const batchRestore = vi.fn();
      const clearTrash = vi.fn();
      const { result } = renderActions({
        enableTrash: true,
        trash: { restore, batchRestore, clearTrash },
      });
      expect(result.current.restore).toBe(restore);
      expect(result.current.batchRestore).toBe(batchRestore);
      expect(result.current.clearTrash).toBe(clearTrash);
    });

    it('onOpen 注入：handleOpen 委托', () => {
      const onOpen = vi.fn();
      const { result } = renderActions({ onOpen });
      act(() => result.current.handleOpen(nodeA as FileSystemNode));
      expect(onOpen).toHaveBeenCalledWith(nodeA);
    });
  });

  describe('拖拽回调（useMoveCopyOrchestrator 委托）', () => {
    it('dragDrop 四件套存在且 move/copy 输出可用', () => {
      const { result } = renderActions();
      expect(result.current.dragDrop.handleDragStart).toBeTypeOf('function');
      expect(result.current.dragDrop.handleDragOver).toBeTypeOf('function');
      expect(result.current.dragDrop.handleDragLeave).toBeTypeOf('function');
      expect(result.current.dragDrop.handleDrop).toBeTypeOf('function');
      expect(result.current.move).toBeTypeOf('function');
      expect(result.current.copy).toBeTypeOf('function');
    });
  });

  describe('CRUD 委托（useFileSystemCRUD 契约）', () => {
    it('CRUD 状态与动作暴露', () => {
      const { result } = renderActions();
      expect(result.current.showCreateFolderModal).toBe(false);
      expect(result.current.handleCreateFolder).toBeTypeOf('function');
      expect(result.current.handleCreateDrawing).toBeTypeOf('function');
      expect(result.current.handleRename).toBeTypeOf('function');
      expect(result.current.handleDelete).toBeTypeOf('function');
      expect(result.current.handleBatchDelete).toBeTypeOf('function');
      expect(result.current.handleOpenRename).toBeTypeOf('function');
      expect(result.current.handleCreateProject).toBeTypeOf('function');
    });
  });
});
