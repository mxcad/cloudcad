///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
///////////////////////////////////////////////////////////////////////////////

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('@/api-sdk', () => ({
  nodeControllerBatchMoveNodes: vi.fn(),
  nodeControllerBatchCopyNodes: vi.fn(),
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

// useProjectDrawingsDragDrop 已收敛进 useMoveCopyOrchestrator（拖拽手势统一编排），
// 本 spec 直接验证编排器的拖拽行为（对齐主页面 useDragAndDrop 行为契约）。
import { useMoveCopyOrchestrator } from '@/hooks/file-system';
import { useFileSystemUndoRedoStore } from '@/stores/fileSystemUndoRedoStore';
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

/** 默认批量成功响应：successIds 回显请求的 nodeIds */
const batchOk = (nodeIds: string[]) => ({
  data: { successIds: [...nodeIds], failedIds: [], failedCount: 0 },
});

/** 批量复制成功响应：createdIds 为新副本 id（后端契约，≠ successIds 的源 id） */
const batchCopyOk = (nodeIds: string[]) => ({
  data: {
    successIds: [...nodeIds],
    failedIds: [],
    failedCount: 0,
    createdIds: nodeIds.map((id) => `copy-${id}`),
  },
});

const draggedNode = { id: 'f1', name: 'a.dwg', isFolder: false, parentId: 'p1' };
const targetFolder = { id: 'folder-2', name: 'dir2', isFolder: true, parentId: 'p1' };

function renderOrchestrator(overrides: Record<string, unknown> = {}) {
  const props = {
    urlProjectId: 'proj-1',
    handleRefresh: vi.fn(),
    showToast: vi.fn(),
    canMove: true,
    canCopy: true,
    draggedNodes: [draggedNode],
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

describe('useMoveCopyOrchestrator 拖拽 — 对齐行为契约', () => {
  let pushSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    moveMock.mockImplementation(({ body }: any) =>
      Promise.resolve(batchOk(body?.nodeIds ?? []))
    );
    copyMock.mockImplementation(({ body }: any) =>
      Promise.resolve(batchCopyOk(body?.nodeIds ?? []))
    );
    pushSpy = vi
      .spyOn(useFileSystemUndoRedoStore.getState(), 'pushAction')
      .mockImplementation(() => {});
  });

  it('move 拖拽：移动节点 + pushAction 收到 buildMoveAction 构造的 move 动作', async () => {
    const { result, props } = renderOrchestrator();

    await act(async () => {
      await result.current.handleDrop(dragEvent(false), targetFolder);
    });

    expect(moveMock).toHaveBeenCalledTimes(1);
    expect(moveMock).toHaveBeenCalledWith({
      body: { nodeIds: ['f1'], targetParentId: 'folder-2' },
      throwOnError: true,
    });
    expect(pushSpy).toHaveBeenCalledTimes(1);
    const action = pushSpy.mock.calls[0][0];
    expect(action.type).toBe('move');
    expect(action.description).toBe('拖拽移动');
    expect(action.projectId).toBe('proj-1');
    expect(props.handleRefresh).toHaveBeenCalledTimes(1);
    expect(props.setDraggedNodes).toHaveBeenCalledWith([]);
  });

  it('copy 拖拽（ctrlKey）：复制节点 + pushAction 收到 buildCopyAction 构造的 paste-copy 动作', async () => {
    const { result, props } = renderOrchestrator();

    await act(async () => {
      await result.current.handleDrop(dragEvent(true), targetFolder);
    });

    expect(copyMock).toHaveBeenCalledTimes(1);
    expect(copyMock).toHaveBeenCalledWith({
      body: { nodeIds: ['f1'], targetParentId: 'folder-2' },
      throwOnError: true,
    });
    expect(pushSpy).toHaveBeenCalledTimes(1);
    const action = pushSpy.mock.calls[0][0];
    expect(action.type).toBe('paste-copy');
    expect(action.description).toBe('拖拽复制');
    expect(props.handleRefresh).toHaveBeenCalledTimes(1);
  });

  it('无移动权限：不调 API、提示对齐文案（没有移动权限）、清空拖拽状态', async () => {
    const { result, props } = renderOrchestrator({
      canMove: false,
      canCopy: false,
    });

    await act(async () => {
      await result.current.handleDrop(dragEvent(false), targetFolder);
    });

    expect(moveMock).toHaveBeenCalledTimes(0);
    expect(copyMock).toHaveBeenCalledTimes(0);
    expect(pushSpy).toHaveBeenCalledTimes(0);
    expect(props.showToast).toHaveBeenCalledWith('没有移动权限', 'error');
    expect(props.setDraggedNodes).toHaveBeenCalledWith([]);
  });

  it('copy 拖拽无复制权限：提示没有复制权限', async () => {
    const { result, props } = renderOrchestrator({
      canMove: true,
      canCopy: false,
    });

    await act(async () => {
      await result.current.handleDrop(dragEvent(true), targetFolder);
    });

    expect(copyMock).toHaveBeenCalledTimes(0);
    expect(props.showToast).toHaveBeenCalledWith('没有复制权限', 'error');
    expect(props.setDraggedNodes).toHaveBeenCalledWith([]);
  });

  it('拖拽到非文件夹目标：直接返回', async () => {
    const { result } = renderOrchestrator();

    await act(async () => {
      await result.current.handleDrop(
        dragEvent(false),
        { id: 'file-x', isFolder: false } as never
      );
    });

    expect(moveMock).toHaveBeenCalledTimes(0);
    expect(pushSpy).toHaveBeenCalledTimes(0);
  });
});
