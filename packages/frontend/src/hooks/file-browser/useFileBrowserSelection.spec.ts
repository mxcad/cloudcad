///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFileBrowserSelection } from './useFileBrowserSelection';
import type { FileSystemNode } from '@/types/filesystem';

const nodes: FileSystemNode[] = [
  { id: 'a', name: 'a.dwg', nodeType: 'FILE', isFolder: false, isRoot: false } as FileSystemNode,
  { id: 'b', name: 'b.dwg', nodeType: 'FILE', isFolder: false, isRoot: false } as FileSystemNode,
  { id: 'c', name: 'c.dwg', nodeType: 'FILE', isFolder: false, isRoot: false } as FileSystemNode,
];

function renderSelection(multiple: 'always' | 'batch-only' | false, batchEnabled = false) {
  return renderHook(() =>
    useFileBrowserSelection({ nodes, multiple, batchEnabled })
  );
}

describe('useFileBrowserSelection', () => {
  beforeEach(() => {
    // 每个用例独立 store 无依赖，无需清理
  });

  describe('multiple=always（全屏页常驻多选）', () => {
    it('单选：清空旧选择并选中目标', () => {
      const { result } = renderSelection('always');
      act(() => result.current.handleNodeSelect('a'));
      expect(result.current.selectedNodes).toEqual(new Set(['a']));
      act(() => result.current.handleNodeSelect('b'));
      expect(result.current.selectedNodes).toEqual(new Set(['b']));
    });

    it('Ctrl 多选：追加/取消而不清空', () => {
      const { result } = renderSelection('always');
      act(() => result.current.handleNodeSelect('a'));
      act(() => result.current.handleNodeSelect('b', true));
      expect(result.current.selectedNodes).toEqual(new Set(['a', 'b']));
      act(() => result.current.handleNodeSelect('a', true));
      expect(result.current.selectedNodes).toEqual(new Set(['b']));
    });

    it('Shift 区间选择：选中连续范围', () => {
      const { result } = renderSelection('always');
      act(() => result.current.handleNodeSelect('a'));
      act(() => result.current.handleNodeSelect('c', false, true));
      expect(result.current.selectedNodes).toEqual(new Set(['a', 'b', 'c']));
    });

    it('全选/再全选清空', () => {
      const { result } = renderSelection('always');
      act(() => result.current.handleSelectAll());
      expect(result.current.selectedNodes).toEqual(new Set(['a', 'b', 'c']));
      act(() => result.current.handleSelectAll());
      expect(result.current.selectedNodes.size).toBe(0);
    });

    it('selectMany 批量注入 + clearSelection 清空', () => {
      const { result } = renderSelection('always');
      act(() => result.current.selectMany(['a', 'c']));
      expect(result.current.selectedNodes).toEqual(new Set(['a', 'c']));
      act(() => result.current.clearSelection());
      expect(result.current.selectedNodes.size).toBe(0);
    });

    it('deselectNode 移除单个选中项，保留其余', () => {
      const { result } = renderSelection('always');
      act(() => result.current.selectMany(['a', 'b', 'c']));
      act(() => result.current.deselectNode('b'));
      expect(result.current.selectedNodes).toEqual(new Set(['a', 'c']));
      // 未选中项无副作用
      act(() => result.current.deselectNode('a'));
      act(() => result.current.deselectNode('a'));
      expect(result.current.selectedNodes).toEqual(new Set(['c']));
    });

    it('deselectNode 移除锚点后，Shift 区间从新锚点起算（不残留旧锚点）', () => {
      const { result } = renderSelection('always');
      act(() => result.current.handleNodeSelect('a'));
      // 锚点为 a；移除 a 后锚点清空
      act(() => result.current.deselectNode('a'));
      act(() => result.current.handleNodeSelect('c', false, true));
      // 无锚点 → Shift 退化为单选 c（而非区间 a-c）
      expect(result.current.selectedNodes).toEqual(new Set(['c']));
    });

    it('批量模式恒开启（isBatchMode=true、selectionVisible=true）', () => {
      const { result } = renderSelection('always');
      expect(result.current.isBatchMode).toBe(true);
      expect(result.current.selectionVisible).toBe(true);
      expect(result.current.canBatch).toBe(true);
    });
  });

  describe('multiple=batch-only（侧边栏库管理员批量模式）', () => {
    it('batchEnabled=false：多选 UI 不可见（selectionVisible=false）', () => {
      const { result } = renderSelection('batch-only', false);
      expect(result.current.selectionVisible).toBe(false);
      expect(result.current.canBatch).toBe(false);
      expect(result.current.isBatchMode).toBe(false);
    });

    it('batchEnabled=true：setBatchMode(true) 开启批量，选择可见', () => {
      const { result } = renderSelection('batch-only', true);
      expect(result.current.isBatchMode).toBe(false);
      act(() => result.current.setBatchMode(true));
      expect(result.current.isBatchMode).toBe(true);
      expect(result.current.selectionVisible).toBe(true);
      expect(result.current.canBatch).toBe(true);
    });

    it('关闭批量模式时清空选择', () => {
      const { result } = renderSelection('batch-only', true);
      act(() => result.current.setBatchMode(true));
      act(() => result.current.handleNodeSelect('a'));
      expect(result.current.selectedNodes.size).toBe(1);
      act(() => result.current.setBatchMode(false));
      expect(result.current.isBatchMode).toBe(false);
      expect(result.current.selectedNodes.size).toBe(0);
    });

    it('选择状态始终维护（与现状 useMultiSelectSelection 一致）', () => {
      const { result } = renderSelection('batch-only', false);
      act(() => result.current.handleNodeSelect('a'));
      expect(result.current.selectedNodes).toEqual(new Set(['a']));
    });
  });

  describe('multiple=false（禁选）', () => {
    it('handleNodeSelect / handleSelectAll 均为 no-op', () => {
      const { result } = renderSelection(false);
      act(() => result.current.handleNodeSelect('a'));
      expect(result.current.selectedNodes.size).toBe(0);
      act(() => result.current.handleSelectAll());
      expect(result.current.selectedNodes.size).toBe(0);
      expect(result.current.selectionVisible).toBe(false);
      expect(result.current.canBatch).toBe(false);
    });
  });
});
