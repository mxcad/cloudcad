///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, act, screen } from '@testing-library/react';
import { FileListGrid } from './FileListGrid';
import type { FileSystemNode } from '@/types/filesystem';

const ITEM_HEIGHT = 40;
const CLIENT_HEIGHT = 400;
/** 触发阈值 = max(300, clientHeight * 0.6)；视口 400 → 300 */
const TRIGGER_EDGE = 300;

function makeNode(id: string): FileSystemNode {
  return { id, name: id, isFolder: false } as FileSystemNode;
}

function makeNodes(prefix: string, count = 30): FileSystemNode[] {
  return Array.from({ length: count }, (_, i) => makeNode(`${prefix}-${i + 1}`));
}

interface HarnessProps {
  nodes: FileSystemNode[];
  page?: number;
  totalPages?: number;
  loading?: boolean;
  onScrollPageChange?: (page: number, direction: 'prev' | 'next') => void;
  onPageChange?: (page: number) => void;
  loadError?: string | null;
  onRetryLoadMore?: () => void;
  /** 列表第一项所属页码（默认 = page，模拟 replace 单页模型） */
  minLoadedPage?: number;
}

function Harness({
  nodes,
  page = 1,
  totalPages = 3,
  loading = false,
  onScrollPageChange,
  onPageChange = () => {},
  loadError,
  onRetryLoadMore,
  minLoadedPage,
}: HarnessProps) {
  return (
    <FileListGrid
      nodes={nodes}
      viewMode="grid"
      selectedNodes={new Set()}
      paginationMeta={{
        total: totalPages * 30,
        page,
        limit: 30,
        totalPages,
      }}
      onNodeSelect={() => {}}
      onPageChange={onPageChange}
      onPageSizeChange={() => {}}
      onScrollPageChange={onScrollPageChange}
      loadError={loadError}
      onRetryLoadMore={onRetryLoadMore}
      minLoadedPage={minLoadedPage ?? page}
      loading={loading}
      renderItem={(node) => (
        <div
          data-testid={`item-${node.id}`}
          style={{ height: ITEM_HEIGHT }}
        >
          {node.name}
        </div>
      )}
    />
  );
}

/**
 * happy-dom 无布局：桩化与真实浏览器一致的滚动几何（同 useScrollPagination.spec）。
 */
function stubLayout(
  container: HTMLElement,
  itemsLength: number,
  scrollTop: number
) {
  Object.defineProperty(container, 'scrollTop', {
    value: scrollTop,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(container, 'scrollHeight', {
    value: itemsLength * ITEM_HEIGHT,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(container, 'clientHeight', {
    value: CLIENT_HEIGHT,
    configurable: true,
    writable: true,
  });
  container.getBoundingClientRect = () =>
    ({
      top: 0,
      height: CLIENT_HEIGHT,
      bottom: CLIENT_HEIGHT,
      left: 0,
      right: 0,
      width: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;
  const itemsEl = container.querySelector('[data-view-mode="grid"]');
  if (itemsEl) {
    Array.from(itemsEl.children).forEach((child, i) => {
      (child as HTMLElement).getBoundingClientRect = () => {
        const top = i * ITEM_HEIGHT - scrollTop;
        return {
          top,
          height: ITEM_HEIGHT,
          bottom: top + ITEM_HEIGHT,
          left: 0,
          right: 0,
          width: 0,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        } as DOMRect;
      };
    });
  }
}

function renderHarness(props: HarnessProps) {
  const onScrollPageChange = vi.fn();
  const onPageChange = vi.fn();
  const utils = render(
    <Harness
      {...props}
      onScrollPageChange={onScrollPageChange}
      onPageChange={onPageChange}
    />
  );
  const itemsWrapper = utils.container.querySelector(
    '[data-view-mode="grid"]'
  ) as HTMLElement;
  // data-view-mode 的父级是 relative 包裹层，再上一层才是滚动容器
  const scrollContainer = (itemsWrapper.parentElement as HTMLElement)
    .parentElement as HTMLElement;
  stubLayout(scrollContainer, props.nodes.length, 0);
  return { ...utils, scrollContainer, onScrollPageChange, onPageChange };
}

function scrollTo(
  container: HTMLElement,
  scrollTop: number,
  itemsLength: number
) {
  stubLayout(container, itemsLength, scrollTop);
  act(() => {
    fireEvent.scroll(container);
    // 测量已 rAF 节流：flush 一帧让指示器更新
    vi.advanceTimersByTime(16);
  });
}

/** 越过内容替换屏蔽窗口（SETTLE_BLOCK_MS = 100） */
function advanceSettleBlock() {
  act(() => {
    vi.advanceTimersByTime(150);
  });
}

describe('FileListGrid 滚动分页', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Pagination 响应式布局依赖 clientWidth（happy-dom 恒为 0 → compact 布局无页码按钮），
    // 桩化为全宽让页码按钮渲染出来
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      get() {
        return 800;
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('滚动到底触发 next、滚动到顶触发 prev（方向透传给 onScrollPageChange）', () => {
    const { scrollContainer, onScrollPageChange } = renderHarness({
      nodes: makeNodes('p1'),
      page: 2,
      totalPages: 3,
    });
    advanceSettleBlock();

    scrollTo(scrollContainer, 400, 30); // 中间：建立方向基线（400 > 300 不触发 prev）
    expect(onScrollPageChange).not.toHaveBeenCalled();
    scrollTo(scrollContainer, 0, 30); // 顶部 → prev
    expect(onScrollPageChange).toHaveBeenCalledWith(1, 'prev');
    onScrollPageChange.mockClear();

    scrollTo(scrollContainer, 400, 30); // 重新建立基线（向下）
    scrollTo(scrollContainer, 1000, 30); // 距底 200 内（30*40-1000=200）→ next
    expect(onScrollPageChange).toHaveBeenCalledWith(3, 'next');
  });

  it('页脚页码点击：透传 onPageChange（jump 定位由 useScrollPagination 处理）', () => {
    const { onPageChange } = renderHarness({
      nodes: makeNodes('p1'),
      page: 1,
      totalPages: 3,
    });
    act(() => {
      fireEvent.click(screen.getByText('2', { selector: 'button' }));
    });
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it('向下滚动加载进行中：底部显示骨架占位', () => {
    const { container, rerender, onScrollPageChange } = renderHarness({
      nodes: makeNodes('p1'),
      page: 1,
      totalPages: 3,
    });
    expect(
      container.querySelector('[data-testid="list-skeleton"]')
    ).toBeNull();

    rerender(
      <Harness
        nodes={makeNodes('p1')}
        page={2}
        totalPages={3}
        loading={true}
        onScrollPageChange={onScrollPageChange}
      />
    );
    const skeleton = container.querySelector('[data-testid="list-skeleton"]');
    expect(skeleton).not.toBeNull();
  });

  it('翻页失败：显示底部失败条与重试按钮，点击触发重试回调', () => {
    const { container, rerender, onScrollPageChange } = renderHarness({
      nodes: makeNodes('p1'),
      page: 1,
      totalPages: 3,
    });
    expect(
      container.querySelector('[data-testid="load-more-error"]')
    ).toBeNull();

    const onRetryLoadMore = vi.fn();
    rerender(
      <Harness
        nodes={makeNodes('p1')}
        page={2}
        totalPages={3}
        loading={false}
        onScrollPageChange={onScrollPageChange}
        loadError="加载分享列表失败"
        onRetryLoadMore={onRetryLoadMore}
      />
    );
    const failBar = container.querySelector('[data-testid="load-more-error"]');
    expect(failBar).not.toBeNull();
    expect(failBar?.textContent).toContain('加载分享列表失败');
    // 已加载内容保留（列表项仍渲染）
    expect(
      container.querySelector('[data-testid="item-p1-1"]')
    ).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    expect(onRetryLoadMore).toHaveBeenCalled();
  });

  it('翻页失败优先于「已经是最后一页」显示', () => {
    const { container, onScrollPageChange } = renderHarness({
      nodes: makeNodes('p1'),
      page: 3,
      totalPages: 3,
      loadError: '加载失败',
    });
    void onScrollPageChange;
    expect(
      container.querySelector('[data-testid="load-more-error"]')
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="last-page"]')
    ).toBeNull();
  });

  it('向上滚动加载进行中：顶部显示「加载中...」指示', () => {
    const { scrollContainer, container, rerender, onScrollPageChange } =
      renderHarness({
        nodes: makeNodes('p2'),
        page: 2,
        totalPages: 3,
      });
    expect(container.querySelector('[data-testid="top-loader"]')).toBeNull();

    advanceSettleBlock();
    scrollTo(scrollContainer, 400, 30);
    scrollTo(scrollContainer, 0, 30); // 触发 prev → 最近方向 = prev
    expect(onScrollPageChange).toHaveBeenCalledWith(1, 'prev');

    rerender(
      <Harness
        nodes={makeNodes('p2')}
        page={1}
        totalPages={3}
        loading={true}
        onScrollPageChange={onScrollPageChange}
      />
    );
    const loader = container.querySelector('[data-testid="top-loader"]');
    expect(loader).not.toBeNull();
    expect(loader?.textContent).toContain('加载中');
  });

  it('已加载到最后一页：底部显示「已经是最后一页」', () => {
    const { container } = renderHarness({
      nodes: makeNodes('p3'),
      page: 3,
      totalPages: 3,
    });
    const loader = container.querySelector('[data-testid="last-page"]');
    expect(loader).not.toBeNull();
    expect(loader?.textContent).toContain('已经是最后一页');
  });

  it('未到最后一页：不显示「已经是最后一页」', () => {
    const { container } = renderHarness({
      nodes: makeNodes('p2'),
      page: 2,
      totalPages: 3,
    });
    expect(container.querySelector('[data-testid="last-page"]')).toBeNull();
  });

  it('页脚指示器展示视口所在页（累计多页模型）', () => {
    renderHarness({
      nodes: [...makeNodes('p1'), ...makeNodes('p2'), ...makeNodes('p3')],
      page: 3,
      totalPages: 3,
    });
    // 视口在顶部：指示器应为第 1 页（而非请求页 3）
    expect(screen.getByText('1', { selector: 'button' })).toBeTruthy();
  });

  it('非滚动触发（刷新/导航）不调用 onScrollPageChange', () => {
    const { scrollContainer, onScrollPageChange, rerender } = renderHarness({
      nodes: makeNodes('p1'),
      page: 1,
      totalPages: 3,
    });
    advanceSettleBlock();
    scrollTo(scrollContainer, 300, 30);
    expect(onScrollPageChange).not.toHaveBeenCalled();

    rerender(
      <Harness
        nodes={makeNodes('p1')}
        page={1}
        totalPages={3}
        loading={true}
        onScrollPageChange={onScrollPageChange}
      />
    );
    rerender(
      <Harness
        nodes={makeNodes('p1-refreshed')}
        page={1}
        totalPages={3}
        loading={false}
        onScrollPageChange={onScrollPageChange}
      />
    );
    expect(onScrollPageChange).not.toHaveBeenCalled();
  });
});
