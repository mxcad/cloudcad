///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAccumulatedPagination } from './useAccumulatedPagination';
import type { FileSystemNode } from '@/types/filesystem';

function makeNode(id: string, name = id): FileSystemNode {
  return { id, name, isFolder: false } as FileSystemNode;
}

function makePage(prefix: string, count = 30): FileSystemNode[] {
  return Array.from({ length: count }, (_, i) => makeNode(`${prefix}-${i + 1}`));
}

const PAGE_1 = makePage('p1');
const PAGE_2 = makePage('p2');
const PAGE_3 = makePage('p3');
const PAGE_0 = makePage('p0');

interface HarnessOptions {
  displayNodes: FileSystemNode[];
  currentPage?: number;
  resetKey?: string;
  handlePageChange?: (page: number) => void;
}

function setup(initial: HarnessOptions) {
  const handlePageChange = vi.fn(initial.handlePageChange ?? (() => {}));
  const { result, rerender } = renderHook(
    ({
      displayNodes,
      currentPage = 1,
      resetKey,
    }: {
      displayNodes: FileSystemNode[];
      currentPage?: number;
      resetKey?: string;
    }) =>
      useAccumulatedPagination({
        displayNodes,
        currentPage,
        handlePageChange,
        resetKey,
      }),
    {
      initialProps: {
        displayNodes: initial.displayNodes,
        currentPage: initial.currentPage ?? 1,
        resetKey: initial.resetKey,
      },
    }
  );
  return { result, rerender, handlePageChange };
}

describe('useAccumulatedPagination 滚动分页合并', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('向下滚动（next）：追加到现有数据之后', () => {
    const { result, rerender } = setup({ displayNodes: PAGE_1 });

    act(() => {
      result.current.handleScrollPageChange(2, 'next');
    });
    // 数据到位：displayNodes 换为第 2 页，currentPage 同步为 2
    rerender({ displayNodes: PAGE_2, currentPage: 2 });

    expect(result.current.viewNodes).toHaveLength(60);
    expect(result.current.viewNodes.slice(0, 30).map((n) => n.id)).toEqual(
      PAGE_1.map((n) => n.id)
    );
    expect(result.current.viewNodes.slice(30).map((n) => n.id)).toEqual(
      PAGE_2.map((n) => n.id)
    );
  });

  it('向上滚动（prev）：前插到现有数据之前', () => {
    const { result, rerender } = setup({
      displayNodes: PAGE_2,
      currentPage: 2,
    });

    act(() => {
      result.current.handleScrollPageChange(1, 'prev');
    });
    rerender({ displayNodes: PAGE_1, currentPage: 1 });

    expect(result.current.viewNodes).toHaveLength(60);
    expect(result.current.viewNodes.slice(0, 30).map((n) => n.id)).toEqual(
      PAGE_1.map((n) => n.id)
    );
    expect(result.current.viewNodes.slice(30).map((n) => n.id)).toEqual(
      PAGE_2.map((n) => n.id)
    );
  });

  it('minLoadedPage：next 追加不变、prev 前插回退到当前页、整体替换跟随当前页', () => {
    // 初始：第 1 页（列表从第 1 页开始）
    const { result, rerender } = setup({ displayNodes: PAGE_1 });
    expect(result.current.minLoadedPage).toBe(1);

    // next 追加到第 3 页：列表第一项不变
    act(() => {
      result.current.handleScrollPageChange(2, 'next');
    });
    rerender({ displayNodes: PAGE_2, currentPage: 2 });
    expect(result.current.minLoadedPage).toBe(1);

    act(() => {
      result.current.handleScrollPageChange(3, 'next');
    });
    rerender({ displayNodes: PAGE_3, currentPage: 3 });
    expect(result.current.minLoadedPage).toBe(1);

    // prev 前插第 2 页：列表第一项 = 当前请求页
    act(() => {
      result.current.handleScrollPageChange(2, 'prev');
    });
    rerender({ displayNodes: PAGE_2, currentPage: 2 });
    expect(result.current.minLoadedPage).toBe(2);

    // 整体替换（页码跳转/搜索）：列表从当前页开始
    rerender({ displayNodes: makePage('jump5'), currentPage: 5 });
    expect(result.current.minLoadedPage).toBe(5);
    expect(result.current.viewNodes).toHaveLength(30);
  });

  it('minLoadedPage：resetKey 变化（查询身份切换）跟随当前页', () => {
    const { result, rerender } = setup({
      displayNodes: PAGE_1,
      resetKey: 'folder-a',
    });
    act(() => {
      result.current.handleScrollPageChange(2, 'next');
    });
    rerender({
      displayNodes: PAGE_2,
      currentPage: 2,
      resetKey: 'folder-a',
    });
    expect(result.current.minLoadedPage).toBe(1);

    // 搜索词变化：新查询从第 1 页开始
    const searchResult = makePage('search');
    rerender({
      displayNodes: searchResult,
      currentPage: 1,
      resetKey: 'search-x',
    });
    expect(result.current.minLoadedPage).toBe(1);
  });

  it('追加按 id 去重（同页数据再次返回不重复）', () => {
    const { result, rerender } = setup({ displayNodes: PAGE_1 });

    act(() => {
      result.current.handleScrollPageChange(2, 'next');
    });
    // 第 2 页数据中混入第 1 页已有的 id（如并发保存后重排）
    const overlapped = [...PAGE_2.slice(0, 5), ...PAGE_1.slice(0, 3)];
    rerender({
      displayNodes: [...overlapped, ...PAGE_2.slice(5)],
      currentPage: 2,
    });

    const ids = result.current.viewNodes.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(result.current.viewNodes).toHaveLength(60);
  });

  it('无滚动方向（导航/搜索/刷新/页码跳转）：整体替换', () => {
    const { result, rerender } = setup({ displayNodes: PAGE_1 });

    // 不触发 handleScrollPageChange，直接换数据（如刷新后第 1 页新数据）
    const refreshed = makePage('p1-refreshed');
    rerender({ displayNodes: refreshed, currentPage: 1 });

    expect(result.current.viewNodes.map((n) => n.id)).toEqual(
      refreshed.map((n) => n.id)
    );
    expect(result.current.viewNodes).toHaveLength(30);
  });

  it('方向校验：挂起方向的目标页码与数据实际所属页不一致时不合并（竞态兜底）', () => {
    const { result, rerender } = setup({ displayNodes: PAGE_1 });

    // 向下滚动挂起 next → 目标第 2 页；搜索把页码重置为 1，第 1 页搜索结果先到
    act(() => {
      result.current.handleScrollPageChange(2, 'next');
    });
    const searchResult = makePage('search');
    rerender({ displayNodes: searchResult, currentPage: 1 });

    // 不合并：直接整体替换
    expect(result.current.viewNodes.map((n) => n.id)).toEqual(
      searchResult.map((n) => n.id)
    );
    expect(result.current.viewNodes).toHaveLength(30);
  });

  it('resetKey 变化：清除挂起方向并整体替换（防跨查询身份误合并）', () => {
    const { result, rerender } = setup({
      displayNodes: PAGE_2,
      currentPage: 2,
      resetKey: 'drawing|node-a|',
    });

    // 向上滚动挂起 prev → 目标第 1 页（页码与导航后的第 1 页相同，方向校验无法区分），
    // 此时进入另一个目录导致 resetKey 变化
    act(() => {
      result.current.handleScrollPageChange(1, 'prev');
    });
    const otherFolder = makePage('folder-b');
    rerender({
      displayNodes: otherFolder,
      currentPage: 1,
      resetKey: 'drawing|node-b|',
    });

    // 不前插：整体替换为新的第 1 页
    expect(result.current.viewNodes.map((n) => n.id)).toEqual(
      otherFolder.map((n) => n.id)
    );
    expect(result.current.viewNodes).toHaveLength(30);
  });

  it('resetKey 变化但新数据未到位：不替换（防搜索输入瞬时塌缩），新数据到位后替换', () => {
    const { result, rerender } = setup({
      displayNodes: PAGE_1,
      resetKey: 'drawing|node-a|',
    });

    // 向下滚动追加到第 2 页（累计 60 项）
    act(() => {
      result.current.handleScrollPageChange(2, 'next');
    });
    rerender({
      displayNodes: PAGE_2,
      currentPage: 2,
      resetKey: 'drawing|node-a|',
    });
    expect(result.current.viewNodes).toHaveLength(60);

    // 输入搜索词：resetKey 变化但防抖查询未返回（displayNodes 仍是第 2 页数据，同一引用）
    const searchTermChanged = 'drawing|node-a|keyword';
    rerender({ displayNodes: PAGE_2, currentPage: 2, resetKey: searchTermChanged });
    // 已累计列表不被瞬时塌缩
    expect(result.current.viewNodes).toHaveLength(60);

    // 搜索结果到位 → 整体替换
    const searchResult = makePage('search');
    rerender({
      displayNodes: searchResult,
      currentPage: 1,
      resetKey: searchTermChanged,
    });
    expect(result.current.viewNodes.map((n) => n.id)).toEqual(
      searchResult.map((n) => n.id)
    );
    expect(result.current.viewNodes).toHaveLength(30);
  });

  it('displayNodes 引用未变（keepPreviousData 占位期）：保留挂起方向，数据到位后才合并', () => {
    const { result, rerender } = setup({ displayNodes: PAGE_1 });

    act(() => {
      result.current.handleScrollPageChange(2, 'next');
    });
    // 占位期：currentPage 已变 2，但 displayNodes 仍是第 1 页（同一引用）
    rerender({ displayNodes: PAGE_1, currentPage: 2 });

    // 尚未合并：仍只有第 1 页
    expect(result.current.viewNodes).toHaveLength(30);

    // 数据到位
    rerender({ displayNodes: PAGE_2, currentPage: 2 });
    expect(result.current.viewNodes).toHaveLength(60);
  });

  it('挂起方向只消费一次：后续无关数据变化整体替换', () => {
    const { result, rerender } = setup({ displayNodes: PAGE_1 });

    act(() => {
      result.current.handleScrollPageChange(2, 'next');
    });
    rerender({ displayNodes: PAGE_2, currentPage: 2 });
    expect(result.current.viewNodes).toHaveLength(60);

    // 同一页刷新返回新数据（无新方向）
    const refreshed2 = makePage('p2-refreshed');
    rerender({ displayNodes: refreshed2, currentPage: 2 });
    expect(result.current.viewNodes.map((n) => n.id)).toEqual(
      refreshed2.map((n) => n.id)
    );
    expect(result.current.viewNodes).toHaveLength(30);
  });

  it('handleScrollPageChange 转发页码给 handlePageChange', () => {
    const { result, handlePageChange } = setup({ displayNodes: PAGE_1 });

    act(() => {
      result.current.handleScrollPageChange(3, 'next');
    });
    expect(handlePageChange).toHaveBeenCalledWith(3);
  });

  it('prev 方向前插也按 id 去重', () => {
    const { result, rerender } = setup({
      displayNodes: PAGE_2,
      currentPage: 2,
    });

    act(() => {
      result.current.handleScrollPageChange(1, 'prev');
    });
    // 第 1 页数据尾部与第 2 页头部 id 重叠（p2-29/p2-30 与现有数据重复）
    const overlapped = [...PAGE_1.slice(0, 28), ...PAGE_2.slice(28)];
    rerender({ displayNodes: overlapped, currentPage: 1 });

    const ids = result.current.viewNodes.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
    // 30（p1×28 + p2-29/30）+ 28（p2-1..p2-28 不重复）= 58
    expect(result.current.viewNodes).toHaveLength(58);
    expect(result.current.viewNodes.slice(0, 28).map((n) => n.id)).toEqual(
      PAGE_1.slice(0, 28).map((n) => n.id)
    );
  });
});

describe('useAccumulatedPagination 泛型支持（ADR-0052：任意 {id} 数据形态）', () => {
  /** 用户管理页形态的数据（非 FileSystemNode，验证泛型化） */
  interface UserRow {
    id: string;
    username: string;
    roleId?: string;
  }

  function makeUsers(prefix: string, count = 20): UserRow[] {
    return Array.from({ length: count }, (_, i) => ({
      id: `${prefix}-u${i + 1}`,
      username: `${prefix}-user-${i + 1}`,
    }));
  }

  const USERS_1 = makeUsers('pg1');
  const USERS_2 = makeUsers('pg2');

  function setupUsers(initial: { users: UserRow[]; currentPage?: number }) {
    const handlePageChange = vi.fn(() => {});
    const { result, rerender } = renderHook(
      ({
        users,
        currentPage = 1,
      }: {
        users: UserRow[];
        currentPage?: number;
      }) =>
        useAccumulatedPagination({
          displayNodes: users,
          currentPage,
          handlePageChange,
        }),
      {
        initialProps: {
          users: initial.users,
          currentPage: initial.currentPage ?? 1,
        },
      }
    );
    return { result, rerender, handlePageChange };
  }

  it('非 FileSystemNode 数据（用户行）next 追加合并', () => {
    const { result, rerender } = setupUsers({ users: USERS_1 });

    act(() => {
      result.current.handleScrollPageChange(2, 'next');
    });
    rerender({ users: USERS_2, currentPage: 2 });

    expect(result.current.viewNodes).toHaveLength(40);
    expect(result.current.viewNodes[0]).toEqual(USERS_1[0]);
    expect(result.current.viewNodes[39]).toEqual(USERS_2[19]);
  });

  it('用户行数据 prev 前插 + 按 id 去重', () => {
    const { result, rerender } = setupUsers({
      users: USERS_2,
      currentPage: 2,
    });

    act(() => {
      result.current.handleScrollPageChange(1, 'prev');
    });
    rerender({ users: USERS_1, currentPage: 1 });

    expect(result.current.viewNodes).toHaveLength(40);
    expect(result.current.viewNodes.slice(0, 20).map((u) => u.id)).toEqual(
      USERS_1.map((u) => u.id)
    );
    expect(result.current.viewNodes.slice(20).map((u) => u.id)).toEqual(
      USERS_2.map((u) => u.id)
    );
  });

  it('用户行数据无方向变化整体替换', () => {
    const { result, rerender } = setupUsers({ users: USERS_1 });

    const refreshed = makeUsers('pg1-refreshed');
    rerender({ users: refreshed, currentPage: 1 });

    expect(result.current.viewNodes.map((u) => u.id)).toEqual(
      refreshed.map((u) => u.id)
    );
    expect(result.current.viewNodes).toHaveLength(20);
  });

  it('查询未就绪时空数组每次新建引用不触发 setState 循环（空→空视为未变化）', () => {
    // 模拟 react-query 未就绪：hook 返回 `data?.users ?? []`，每次渲染产生新空数组
    const handlePageChange = vi.fn(() => {});
    const { result, rerender } = renderHook(
      ({ nodes }: { nodes: UserRow[] }) =>
        useAccumulatedPagination({
          displayNodes: nodes,
          currentPage: 1,
          handlePageChange,
        }),
      { initialProps: { nodes: [] } }
    );
    // 连续传入新空数组（引用变化、内容相同）——修复前每次 setState 无限循环
    for (let i = 0; i < 5; i++) {
      rerender({ nodes: [] });
    }
    expect(result.current.viewNodes).toEqual([]);
    expect(handlePageChange).not.toHaveBeenCalled();
  });

  it('空数组 → 非空数据（查询完成）正常整体替换', () => {
    const handlePageChange = vi.fn(() => {});
    const { result, rerender } = renderHook(
      ({ nodes }: { nodes: UserRow[] }) =>
        useAccumulatedPagination({
          displayNodes: nodes,
          currentPage: 1,
          handlePageChange,
        }),
      { initialProps: { nodes: [] } }
    );
    rerender({ nodes: USERS_1 });
    expect(result.current.viewNodes).toHaveLength(20);
    expect(result.current.viewNodes[0]).toEqual(USERS_1[0]);
  });
});
