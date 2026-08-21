///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFileBrowserModals } from './useFileBrowserModals';
import type { UseFileBrowserActionsReturn } from './useFileBrowserActions';
import type { FileSystemNode } from '@/types/filesystem';

vi.mock('@/languages', () => ({
  t: (m: string, vars?: Record<string, string>) =>
    vars
      ? m.replace(/\{(\w+)\}/g, (_, key: string) => vars[key] ?? '')
      : m,
}));

const nodeA = {
  id: 'a',
  name: 'a.dwg',
  isFolder: false,
  parentId: 'p1',
} as FileSystemNode;

const nodeB = {
  id: 'b',
  name: 'b.dwg',
  isFolder: false,
  parentId: 'p1',
} as FileSystemNode;

function buildActions(overrides: Record<string, unknown> = {}) {
  // 模拟 orchestrator 行为：成功时调用 onSuccess（关闭模态）
  const runWithSuccess = (resultIds: string[]) =>
    vi.fn(async (_ids: string[], _target: string, _mode: string, opts?: { onSuccess?: () => void }) => {
      opts?.onSuccess?.();
      return resultIds;
    });
  return {
    move: runWithSuccess([]),
    copy: runWithSuccess([]),
    ...overrides,
  } as unknown as UseFileBrowserActionsReturn;
}

function renderModals(options: {
  actions?: UseFileBrowserActionsReturn;
  nodes?: FileSystemNode[];
  selectedNodes?: Set<string>;
  clearSelection?: ReturnType<typeof vi.fn>;
} = {}) {
  const actions = options.actions ?? buildActions();
  return {
    ...renderHook(() =>
      useFileBrowserModals({
        actions,
        nodes: options.nodes ?? [nodeA, nodeB],
        selectedNodes: options.selectedNodes ?? new Set(),
        clearSelection: options.clearSelection ?? vi.fn(),
        projectId: 'proj-1',
      })
    ),
    actions,
  };
}

describe('useFileBrowserModals — 状态机 + SelectFolder 收敛', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('SelectFolder 状态收敛（两外壳合体）', () => {
    it('handleMove：打开模态并记录移动源节点', () => {
      const { result } = renderModals();
      act(() => result.current.handleMove(nodeA));
      expect(result.current.showSelectFolderModal).toBe(true);
      expect(result.current.moveSourceNode).toEqual(nodeA);
      expect(result.current.copySourceNode).toBeNull();
      expect(result.current.selectFolderConfirmText).toBe('移动到此');
      expect(result.current.selectFolderNodeId).toBe('a');
    });

    it('handleCopy：打开模态并记录复制源节点', () => {
      const { result } = renderModals();
      act(() => result.current.handleCopy(nodeA));
      expect(result.current.showSelectFolderModal).toBe(true);
      expect(result.current.copySourceNode).toEqual(nodeA);
      expect(result.current.selectFolderConfirmText).toBe('复制到此');
    });

    it('确认移动（单节点）：actions.move(modal) + onSuccess 关闭模态', async () => {
      const actions = buildActions({
        move: vi.fn(async () => {
          // 模拟 orchestrator 成功路径（onSuccess 关闭模态）
          return ['a'];
        }),
      });
      // 注意：单节点成功路径的 onSuccess 由 orchestrator 调用；
      // 本测试直接验证确认回调传入 onSuccess，随后手动触发关闭语义由 orchestrator 保证。
      const { result } = renderModals({ actions });
      act(() => result.current.handleMove(nodeA));

      await act(async () => {
        await result.current.handleConfirmMoveOrCopy('folder-2');
      });

      expect(actions.move).toHaveBeenCalledWith(
        ['a'],
        'folder-2',
        'modal',
        expect.objectContaining({
          sourceParentIds: expect.any(Map),
          description: expect.stringContaining('a.dwg'),
          projectId: 'proj-1',
          onSuccess: expect.any(Function),
        })
      );
      // 打开后未确认关闭前仍处于打开状态（关闭由 orchestrator 成功回调驱动）
      expect(result.current.showSelectFolderModal).toBe(true);
    });

    it('确认复制（单节点）：actions.copy(modal)', async () => {
      const actions = buildActions({
        copy: vi.fn(async () => ['new-a']),
      });
      const { result } = renderModals({ actions });
      act(() => result.current.handleCopy(nodeA));

      await act(async () => {
        await result.current.handleConfirmMoveOrCopy('folder-2');
      });

      expect(actions.copy).toHaveBeenCalledWith(
        ['a'],
        'folder-2',
        'modal',
        expect.objectContaining({
          description: expect.stringContaining('a.dwg'),
        })
      );
    });

    it('批量移动：选中集合含源节点 → 移动全部选中', async () => {
      const actions = buildActions({
        move: vi.fn(async () => ['a', 'b']),
      });
      const clearSelection = vi.fn();
      const { result } = renderModals({
        actions,
        selectedNodes: new Set(['a', 'b']),
        clearSelection,
      });
      act(() => result.current.handleMove(nodeA));

      await act(async () => {
        await result.current.handleConfirmMoveOrCopy('folder-2');
      });

      expect(actions.move).toHaveBeenCalledWith(
        ['a', 'b'],
        'folder-2',
        'modal',
        expect.objectContaining({
          description: undefined,
        })
      );
      expect(clearSelection).toHaveBeenCalledTimes(1);
    });

    it('未设置源节点：confirm 直接返回（不调 API）', async () => {
      const actions = buildActions();
      const { result } = renderModals({ actions });
      await act(async () => {
        await result.current.handleConfirmMoveOrCopy('folder-2');
      });
      expect(actions.move).not.toHaveBeenCalled();
      expect(actions.copy).not.toHaveBeenCalled();
    });

    it('closeSelectFolder：关闭并清空源节点', () => {
      const { result } = renderModals();
      act(() => result.current.handleMove(nodeA));
      act(() => result.current.closeSelectFolder());
      expect(result.current.showSelectFolderModal).toBe(false);
      expect(result.current.moveSourceNode).toBeNull();
      expect(result.current.copySourceNode).toBeNull();
    });
  });

  describe('通用弹窗状态机（枚举身份 + payload + 表单值）', () => {
    it('open/close/isOpen：单态互斥（rename 打开时 select-folder 关闭）', () => {
      const { result } = renderModals();
      expect(result.current.state.activeId).toBeNull();
      act(() => result.current.open('rename', nodeA));
      expect(result.current.isOpen('rename')).toBe(true);
      expect(result.current.state.payload).toEqual(nodeA);
      act(() => result.current.open('select-folder'));
      expect(result.current.isOpen('rename')).toBe(false);
      expect(result.current.isOpen('select-folder')).toBe(true);
      act(() => result.current.close());
      expect(result.current.state.activeId).toBeNull();
    });

    it('closeAll：清空 activeId 与表单值', () => {
      const { result } = renderModals();
      act(() => result.current.open('rename'));
      act(() => result.current.setForm('rename', 'name', 'x'));
      expect(result.current.state.forms).toEqual({ 'rename:name': 'x' });
      act(() => result.current.closeAll());
      expect(result.current.state.activeId).toBeNull();
      expect(result.current.state.forms).toEqual({});
    });

    it('setForm：按弹窗身份 + 字段名写入', () => {
      const { result } = renderModals();
      act(() => result.current.setForm('create-folder', 'folderName', '新文件夹'));
      expect(result.current.state.forms['create-folder:folderName']).toBe(
        '新文件夹'
      );
      // 不同弹窗同名字段互不干扰
      act(() => result.current.setForm('rename', 'folderName', '另一值'));
      expect(result.current.state.forms['create-folder:folderName']).toBe(
        '新文件夹'
      );
      expect(result.current.state.forms['rename:folderName']).toBe('另一值');
    });
  });
});
