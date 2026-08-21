///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('@/api-sdk', () => ({
  nodeControllerMoveNode: vi.fn(),
  nodeControllerCopyNode: vi.fn(),
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

import { useMoveCopyOrchestrator } from './useMoveCopyOrchestrator';
import { useFileSystemUndoRedoStore } from '@/stores/fileSystemUndoRedoStore';
import {
  nodeControllerMoveNode,
  nodeControllerCopyNode,
} from '@/api-sdk';

const moveMock = nodeControllerMoveNode as unknown as ReturnType<typeof vi.fn>;
const copyMock = nodeControllerCopyNode as unknown as ReturnType<typeof vi.fn>;

let pushSpy: ReturnType<typeof vi.spyOn>;

function renderOrchestrator(overrides: Record<string, unknown> = {}) {
  const props = {
    urlProjectId: 'proj-1',
    handleRefresh: vi.fn(),
    showToast: vi.fn(),
    canMove: true,
    canCopy: true,
    draggedNodes: [],
    setDraggedNodes: vi.fn(),
    setDropTargetId: vi.fn(),
    ...overrides,
  };
  const render = renderHook(() =>
    useMoveCopyOrchestrator(
      props as Parameters<typeof useMoveCopyOrchestrator>[0]
    )
  );
  return { ...render, props };
}

function dragEvent(ctrl = false): React.DragEvent {
  return {
    preventDefault: vi.fn(),
    ctrlKey: ctrl,
    metaKey: false,
    dataTransfer: {
      setData: vi.fn(),
      effectAllowed: '',
      dropEffect: '',
    },
  } as unknown as React.DragEvent;
}

const folderNode = {
  id: 'f1',
  name: 'a.dwg',
  isFolder: false,
  parentId: 'p1',
};
const targetFolder = {
  id: 'folder-2',
  name: 'dir2',
  isFolder: true,
  parentId: 'p1',
};

describe('useMoveCopyOrchestrator — move 编排', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    moveMock.mockResolvedValue(undefined);
    copyMock.mockResolvedValue({ data: { id: 'created-1' } });
    pushSpy = vi
      .spyOn(useFileSystemUndoRedoStore.getState(), 'pushAction')
      .mockImplementation(() => {});
  });

  it('clipboard 模式：逐项移动 + 粘贴成功 toast + 注册 move undo', async () => {
    const { result, props } = renderOrchestrator();

    await act(async () => {
      await result.current.move(['a', 'b'], 'target-1', 'clipboard', {
        sourceParentIds: new Map([
          ['a', 'p1'],
          ['b', 'p1'],
        ]),
      });
    });

    expect(moveMock).toHaveBeenCalledTimes(2);
    expect(moveMock).toHaveBeenCalledWith({
      path: { nodeId: 'a' },
      body: { targetParentId: 'target-1' },
      throwOnError: true,
    });
    expect(props.showToast).toHaveBeenCalledWith('粘贴成功', 'success');
    expect(pushSpy).toHaveBeenCalledTimes(1);
    const action = pushSpy.mock.calls[0][0];
    expect(action.type).toBe('move');
    expect(action.description).toBe('移动 2 个项目');
    expect(action.projectId).toBe('proj-1');
    expect(props.handleRefresh).toHaveBeenCalledTimes(1);
  });

  it('modal 模式：移动成功 toast + 自定义描述 + onSuccess 回调', async () => {
    const onSuccess = vi.fn();
    const { result, props } = renderOrchestrator();

    await act(async () => {
      await result.current.move(['a'], 'target-1', 'modal', {
        description: '移动 "a.dwg"',
        onSuccess,
      });
    });

    expect(props.showToast).toHaveBeenCalledWith('移动成功', 'success');
    const action = pushSpy.mock.calls[0][0];
    expect(action.description).toBe('移动 "a.dwg"');
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it('drag 模式：无成功 toast + 默认描述拖拽移动', async () => {
    const { result, props } = renderOrchestrator();

    await act(async () => {
      await result.current.move(['a'], 'target-1', 'drag');
    });

    expect(props.showToast).not.toHaveBeenCalled();
    const action = pushSpy.mock.calls[0][0];
    expect(action.type).toBe('move');
    expect(action.description).toBe('拖拽移动');
  });

  it('部分失败：汇总 warning toast + undo 只含成功节点', async () => {
    moveMock.mockRejectedValueOnce(new Error('quota exceeded'));
    moveMock.mockResolvedValueOnce(undefined);
    const { result, props } = renderOrchestrator();

    await act(async () => {
      const moved = await result.current.move(['a', 'b'], 'target-1', 'clipboard', {
        sourceParentIds: new Map([
          ['a', 'p1'],
          ['b', 'p1'],
        ]),
      });
      expect(moved).toEqual(['b']);
    });

    expect(props.showToast).toHaveBeenCalledWith(
      expect.stringContaining('{failedCount} 项失败'),
      'warning'
    );
    expect(pushSpy).toHaveBeenCalledTimes(1);
    const action = pushSpy.mock.calls[0][0];
    expect(action.type).toBe('move');
    expect(action.description).toBe('移动 1 个项目');
    expect(action.rollback).toBeTypeOf('function');
  });

  it('modal 批量部分失败：默认描述按实际成功数生成（不虚高为尝试数）', async () => {
    moveMock.mockRejectedValueOnce(new Error('quota exceeded'));
    moveMock.mockResolvedValueOnce(undefined);
    const { result, props } = renderOrchestrator();

    await act(async () => {
      const moved = await result.current.move(['a', 'b'], 'target-1', 'modal');
      expect(moved).toEqual(['b']);
    });

    expect(props.showToast).toHaveBeenCalledWith(
      expect.stringContaining('{failedCount} 项失败'),
      'warning'
    );
    expect(pushSpy).toHaveBeenCalledTimes(1);
    const action = pushSpy.mock.calls[0][0];
    expect(action.type).toBe('move');
    expect(action.description).toBe('移动 1 个项目');
  });

  it('全部失败：error toast + 不注册 undo + 不刷新', async () => {
    moveMock.mockRejectedValue(new Error('boom'));
    const { result, props } = renderOrchestrator();

    await act(async () => {
      await result.current.move(['a'], 'target-1', 'clipboard');
    });

    expect(props.showToast).toHaveBeenCalledWith('boom', 'error');
    expect(pushSpy).not.toHaveBeenCalled();
    expect(props.handleRefresh).not.toHaveBeenCalled();
  });

  it('无移动权限：提示错误、不调 API、不注册 undo', async () => {
    const { result, props } = renderOrchestrator({ canMove: false });

    await act(async () => {
      await result.current.move(['a'], 'target-1', 'clipboard');
    });

    expect(props.showToast).toHaveBeenCalledWith('没有移动权限', 'error');
    expect(moveMock).not.toHaveBeenCalled();
    expect(pushSpy).not.toHaveBeenCalled();
  });
});

describe('useMoveCopyOrchestrator — copy 编排', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    moveMock.mockResolvedValue(undefined);
    copyMock.mockResolvedValue({ data: { id: 'created-1' } });
    pushSpy = vi
      .spyOn(useFileSystemUndoRedoStore.getState(), 'pushAction')
      .mockImplementation(() => {});
  });

  it('clipboard 模式：逐项复制 + 粘贴成功 toast + 注册 paste-copy undo（含 initialCreatedIds）', async () => {
    copyMock.mockResolvedValueOnce({ data: { id: 'new-a' } });
    copyMock.mockResolvedValueOnce({ data: { id: 'new-b' } });
    const { result, props } = renderOrchestrator();

    await act(async () => {
      await result.current.copy(['a', 'b'], 'target-1', 'clipboard');
    });

    expect(copyMock).toHaveBeenCalledTimes(2);
    expect(copyMock).toHaveBeenCalledWith({
      path: { nodeId: 'a' },
      body: { targetParentId: 'target-1' },
      throwOnError: true,
    });
    expect(props.showToast).toHaveBeenCalledWith('粘贴成功', 'success');
    expect(pushSpy).toHaveBeenCalledTimes(1);
    const action = pushSpy.mock.calls[0][0];
    expect(action.type).toBe('paste-copy');
    expect(action.description).toBe('复制 2 个项目');
    expect(action.rollback).toBeTypeOf('function');
    expect(props.handleRefresh).toHaveBeenCalledTimes(1);
  });

  it('modal 模式：复制成功 toast + onSuccess 回调', async () => {
    copyMock.mockResolvedValueOnce({ data: { id: 'new-a' } });
    const onSuccess = vi.fn();
    const { result, props } = renderOrchestrator();

    await act(async () => {
      await result.current.copy(['a'], 'target-1', 'modal', {
        description: '复制 "a.dwg"',
        onSuccess,
      });
    });

    expect(props.showToast).toHaveBeenCalledWith('复制成功', 'success');
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it('drag 模式：无成功 toast + 默认描述拖拽复制', async () => {
    copyMock.mockResolvedValueOnce({ data: { id: 'new-a' } });
    const { result, props } = renderOrchestrator();

    await act(async () => {
      await result.current.copy(['a'], 'target-1', 'drag');
    });

    expect(props.showToast).not.toHaveBeenCalled();
    const action = pushSpy.mock.calls[0][0];
    expect(action.type).toBe('paste-copy');
    expect(action.description).toBe('拖拽复制');
  });

  it('部分失败：成功粘贴汇总 warning toast + undo 只含成功产物', async () => {
    copyMock.mockRejectedValueOnce(new Error('quota exceeded'));
    copyMock.mockResolvedValueOnce({ data: { id: 'new-b' } });
    const { result, props } = renderOrchestrator();

    await act(async () => {
      const created = await result.current.copy(['a', 'b'], 'target-1', 'clipboard');
      expect(created).toEqual(['new-b']);
    });

    expect(props.showToast).toHaveBeenCalledWith(
      expect.stringContaining('成功粘贴 {successCount} 项，{failedCount} 项失败'),
      'warning'
    );
    expect(pushSpy).toHaveBeenCalledTimes(1);
    const action = pushSpy.mock.calls[0][0];
    expect(action.type).toBe('paste-copy');
    expect(action.description).toBe('复制 1 个项目');
    expect(action.rollback).toBeTypeOf('function');
  });

  it('全部失败：error toast + 不注册 undo', async () => {
    copyMock.mockRejectedValue(new Error('boom'));
    const { result, props } = renderOrchestrator();

    await act(async () => {
      await result.current.copy(['a'], 'target-1', 'clipboard');
    });

    expect(props.showToast).toHaveBeenCalledWith('boom', 'error');
    expect(pushSpy).not.toHaveBeenCalled();
  });

  it('无复制权限：提示错误、不调 API、不注册 undo', async () => {
    const { result, props } = renderOrchestrator({ canCopy: false });

    await act(async () => {
      await result.current.copy(['a'], 'target-1', 'clipboard');
    });

    expect(props.showToast).toHaveBeenCalledWith('没有复制权限', 'error');
    expect(copyMock).not.toHaveBeenCalled();
    expect(pushSpy).not.toHaveBeenCalled();
  });
});

describe('useMoveCopyOrchestrator — 拖拽手势', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    moveMock.mockResolvedValue(undefined);
    copyMock.mockResolvedValue({ data: { id: 'created-1' } });
    pushSpy = vi
      .spyOn(useFileSystemUndoRedoStore.getState(), 'pushAction')
      .mockImplementation(() => {});
  });

  it('handleDragStart：正常节点设置拖拽数据，effectAllowed 按权限', async () => {
    const { result, props } = renderOrchestrator();
    const e = dragEvent(false);

    await act(async () => {
      result.current.handleDragStart(e, folderNode);
    });

    expect(e.preventDefault).not.toHaveBeenCalled();
    expect(e.dataTransfer.setData).toHaveBeenCalledWith('text/plain', 'f1');
    expect(e.dataTransfer.effectAllowed).toBe('copyMove');
    expect(props.setDraggedNodes).toHaveBeenCalledWith([folderNode]);
  });

  it('handleDragStart：根节点或无权限时阻止拖拽', async () => {
    const { result } = renderOrchestrator();
    const rootEvent = dragEvent(false);
    const noPermEvent = dragEvent(false);

    await act(async () => {
      result.current.handleDragStart(rootEvent, { ...folderNode, isRoot: true });
    });
    expect(rootEvent.preventDefault).toHaveBeenCalled();

    const { result: noPermResult, props: noPermProps } = renderOrchestrator({
      canMove: false,
      canCopy: false,
    });
    await act(async () => {
      noPermResult.current.handleDragStart(noPermEvent, folderNode);
    });
    expect(noPermEvent.preventDefault).toHaveBeenCalled();
    expect(noPermProps.setDraggedNodes).not.toHaveBeenCalled();
  });

  it('handleDragOver：文件夹目标设置 dropEffect（Ctrl 判定 copy/move）', async () => {
    const { result, props } = renderOrchestrator({
      draggedNodes: [folderNode],
    });
    const moveOver = dragEvent(false);
    const copyOver = dragEvent(true);

    await act(async () => {
      result.current.handleDragOver(moveOver, targetFolder);
      result.current.handleDragOver(copyOver, targetFolder);
    });

    expect(moveOver.dataTransfer.dropEffect).toBe('move');
    expect(copyOver.dataTransfer.dropEffect).toBe('copy');
    expect(props.setDropTargetId).toHaveBeenCalledWith('folder-2');
  });

  it('handleDragLeave：清空 dropTargetId', async () => {
    const { result, props } = renderOrchestrator();

    await act(async () => {
      result.current.handleDragLeave();
    });

    expect(props.setDropTargetId).toHaveBeenCalledWith(null);
  });

  it('move 拖拽：放下执行移动 + 注册 move undo + 清空拖拽状态', async () => {
    const { result, props } = renderOrchestrator({
      draggedNodes: [folderNode],
    });

    await act(async () => {
      await result.current.handleDrop(dragEvent(false), targetFolder);
    });

    expect(moveMock).toHaveBeenCalledTimes(1);
    expect(moveMock).toHaveBeenCalledWith({
      path: { nodeId: 'f1' },
      body: { targetParentId: 'folder-2' },
      throwOnError: true,
    });
    expect(pushSpy).toHaveBeenCalledTimes(1);
    const action = pushSpy.mock.calls[0][0];
    expect(action.type).toBe('move');
    expect(action.description).toBe('拖拽移动');
    expect(props.setDraggedNodes).toHaveBeenCalledWith([]);
    expect(props.handleRefresh).toHaveBeenCalledTimes(1);
  });

  it('copy 拖拽（ctrlKey）：放下执行复制 + 注册 paste-copy undo', async () => {
    copyMock.mockResolvedValueOnce({ data: { id: 'new-f1' } });
    const { result, props } = renderOrchestrator({
      draggedNodes: [folderNode],
    });

    await act(async () => {
      await result.current.handleDrop(dragEvent(true), targetFolder);
    });

    expect(copyMock).toHaveBeenCalledTimes(1);
    const action = pushSpy.mock.calls[0][0];
    expect(action.type).toBe('paste-copy');
    expect(action.description).toBe('拖拽复制');
    expect(props.setDraggedNodes).toHaveBeenCalledWith([]);
  });

  it('拖拽无权限：提示对应权限错误、不调 API、清空拖拽状态', async () => {
    const { result, props } = renderOrchestrator({
      canMove: false,
      canCopy: false,
      draggedNodes: [folderNode],
    });

    await act(async () => {
      await result.current.handleDrop(dragEvent(false), targetFolder);
    });

    expect(moveMock).not.toHaveBeenCalled();
    expect(pushSpy).not.toHaveBeenCalled();
    expect(props.showToast).toHaveBeenCalledWith('没有移动权限', 'error');
    expect(props.setDraggedNodes).toHaveBeenCalledWith([]);
  });

  it('拖拽到非文件夹目标：直接返回', async () => {
    const { result, props } = renderOrchestrator({
      draggedNodes: [folderNode],
    });

    await act(async () => {
      await result.current.handleDrop(
        dragEvent(false),
        { id: 'file-x', isFolder: false } as never
      );
    });

    expect(moveMock).not.toHaveBeenCalled();
    expect(pushSpy).not.toHaveBeenCalled();
  });

  it('拖拽自身到目标文件夹：跳过自身节点', async () => {
    const { result, props } = renderOrchestrator({
      draggedNodes: [folderNode, { ...folderNode, id: 'f2' }],
    });

    await act(async () => {
      await result.current.handleDrop(dragEvent(false), {
        id: 'f1',
        isFolder: true,
      } as never);
    });

    expect(moveMock).toHaveBeenCalledTimes(1);
    expect(moveMock).toHaveBeenCalledWith({
      path: { nodeId: 'f2' },
      body: { targetParentId: 'f1' },
      throwOnError: true,
    });
  });
});
