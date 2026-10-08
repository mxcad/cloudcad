///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

/**
 * useProjectDrawingsBatch — 批量复制 undo 的数据丢失回归
 *
 * 历史事故：复制分支的 rollback 曾删源节点 id（handleBatchDelete(nodeIds) +
 * permanently: true）→ 撤销一次批量复制 = 永久删除原始资源库文件。
 * 修复后 rollback 恒删副本 id（handleBatchCopy 透出的 createdIds）。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('@/languages', () => ({
  t: (msg: string, vars?: Record<string, string>) => {
    if (!vars) return msg;
    return msg.replace(/\{(\w+)\}/g, (_, key: string) => vars[key] ?? `{${key}}`);
  },
}));

vi.mock('@/stores/useBatchDownloadStore', () => ({
  useBatchDownloadStore: { getState: () => ({ openDialog: vi.fn() }) },
}));

import { useProjectDrawingsBatch } from './useProjectDrawingsBatch';

interface FakeLibraryOperations {
  copyNode: ReturnType<typeof vi.fn>;
  deleteNode: ReturnType<typeof vi.fn>;
  handleBatchCopy: ReturnType<typeof vi.fn>;
  handleBatchDelete: ReturnType<typeof vi.fn>;
  handleBatchMove: ReturnType<typeof vi.fn>;
  handleMove: ReturnType<typeof vi.fn>;
}

function renderBatch() {
  const copyNode = vi.fn().mockResolvedValue({ data: { id: 'redo-x' } });
  const deleteNode = vi.fn().mockResolvedValue(undefined);
  const handleBatchCopy = vi.fn().mockResolvedValue({
    successIds: ['a', 'b'],
    createdIds: ['copy-a', 'copy-b'],
    failedCount: 0,
  });
  const handleBatchDelete = vi.fn().mockResolvedValue(undefined);
  const handleBatchMove = vi.fn().mockResolvedValue(undefined);
  const handleMove = vi.fn().mockResolvedValue(undefined);
  const libraryOperations = {
    copyNode,
    deleteNode,
    handleBatchCopy,
    handleBatchDelete,
    handleBatchMove,
    handleMove,
  } as never;

  const pushAction = vi.fn();
  const clearMultiSelection = vi.fn();
  const data = {
    multiSelectedNodes: new Set(['a', 'b']),
    selectedNodesArray: ['a', 'b'],
    clearMultiSelection,
    pushAction,
    undoProjectId: 'proj-1',
    nodes: [
      { id: 'a', name: 'a.dwg', isFolder: false, parentId: 'p1' },
      { id: 'b', name: 'b.dwg', isFolder: false, parentId: 'p1' },
    ],
  } as never;
  const showConfirm = vi.fn();

  const result = renderHook(() =>
    useProjectDrawingsBatch({ data, showConfirm, libraryOperations })
  );

  const ops: FakeLibraryOperations = {
    copyNode,
    deleteNode,
    handleBatchCopy,
    handleBatchDelete,
    handleBatchMove,
    handleMove,
  };
  return { ...result, pushAction, showConfirm, ...ops };
}

describe('useProjectDrawingsBatch — 批量复制 undo（数据丢失回归）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('复制后 rollback 只删副本 id，绝不删源节点 id，也不走批量删除', async () => {
    const { result, pushAction, deleteNode, handleBatchDelete, handleBatchCopy } =
      renderBatch();

    await act(async () => {
      result.current.handleBatchCopyClick();
    });
    await act(async () => {
      await result.current.handleConfirmBatchMoveOrCopy('target-1');
    });

    expect(handleBatchCopy).toHaveBeenCalledWith(['a', 'b'], 'target-1');
    expect(pushAction).toHaveBeenCalledTimes(1);
    const action = pushAction.mock.calls[0][0] as {
      type: string;
      nodeIds?: string[];
      rollback: () => Promise<void>;
    };
    expect(action.type).toBe('paste-copy');
    expect(action.nodeIds).toEqual(['copy-a', 'copy-b']);

    await act(async () => {
      await action.rollback();
    });

    expect(deleteNode).toHaveBeenCalledTimes(2);
    expect(deleteNode).toHaveBeenCalledWith('copy-a');
    expect(deleteNode).toHaveBeenCalledWith('copy-b');
    // 源节点 id 绝不能进入删除路径
    expect(deleteNode).not.toHaveBeenCalledWith('a');
    expect(deleteNode).not.toHaveBeenCalledWith('b');
    expect(handleBatchDelete).not.toHaveBeenCalled();
  });

  it('全部复制失败（createdIds 为空）：不注册 undo 动作', async () => {
    const { result, pushAction, handleBatchCopy } = renderBatch();
    handleBatchCopy.mockResolvedValue({
      successIds: [],
      createdIds: [],
      failedCount: 2,
    });

    await act(async () => {
      result.current.handleBatchCopyClick();
    });
    await act(async () => {
      await result.current.handleConfirmBatchMoveOrCopy('target-1');
    });

    expect(pushAction).not.toHaveBeenCalled();
  });

  it('部分失败：undo 只删成功产出的副本', async () => {
    const { result, pushAction, deleteNode, handleBatchCopy } = renderBatch();
    handleBatchCopy.mockResolvedValue({
      successIds: ['a'],
      createdIds: ['copy-a'],
      failedCount: 1,
    });

    await act(async () => {
      result.current.handleBatchCopyClick();
    });
    await act(async () => {
      await result.current.handleConfirmBatchMoveOrCopy('target-1');
    });

    const action = pushAction.mock.calls[0][0] as {
      nodeIds?: string[];
      rollback: () => Promise<void>;
    };
    expect(action.nodeIds).toEqual(['copy-a']);

    await act(async () => {
      await action.rollback();
    });

    expect(deleteNode).toHaveBeenCalledTimes(1);
    expect(deleteNode).toHaveBeenCalledWith('copy-a');
    expect(deleteNode).not.toHaveBeenCalledWith('copy-b');
  });

  it('redo（execute）重复制后 rollback 删最新副本集合（nodeIds 原地同步）', async () => {
    const { result, pushAction, copyNode, deleteNode } = renderBatch();
    copyNode
      .mockResolvedValueOnce({ data: { id: 'redo-a' } })
      .mockResolvedValueOnce({ data: { id: 'redo-b' } });

    await act(async () => {
      result.current.handleBatchCopyClick();
    });
    await act(async () => {
      await result.current.handleConfirmBatchMoveOrCopy('target-1');
    });

    const action = pushAction.mock.calls[0][0] as {
      nodeIds?: string[];
      execute: () => Promise<void>;
      rollback: () => Promise<void>;
    };
    const nodeIdsBefore = action.nodeIds;

    await act(async () => {
      await action.execute();
    });
    expect(copyNode).toHaveBeenCalledTimes(2);
    expect(action.nodeIds).toBe(nodeIdsBefore);
    expect(action.nodeIds).toEqual(['redo-a', 'redo-b']);

    await act(async () => {
      await action.rollback();
    });
    expect(deleteNode).toHaveBeenCalledWith('redo-a');
    expect(deleteNode).toHaveBeenCalledWith('redo-b');
    expect(deleteNode).not.toHaveBeenCalledWith('copy-a');
  });

  it('移动分支不受影响：rollback 按源父目录逐个移回', async () => {
    const { result, pushAction, handleMove } = renderBatch();

    await act(async () => {
      result.current.handleBatchMoveClick();
    });
    await act(async () => {
      await result.current.handleConfirmBatchMoveOrCopy('target-1');
    });

    const action = pushAction.mock.calls[0][0] as {
      type: string;
      rollback: () => Promise<void>;
    };
    expect(action.type).toBe('move');

    await act(async () => {
      await action.rollback();
    });
    expect(handleMove).toHaveBeenCalledWith('a', 'p1');
    expect(handleMove).toHaveBeenCalledWith('b', 'p1');
  });
});
