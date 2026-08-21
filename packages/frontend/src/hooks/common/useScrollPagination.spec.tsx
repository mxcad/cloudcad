///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';
import { useRef } from 'react';
import type { RefObject } from 'react';
import { useScrollPagination } from './useScrollPagination';

const ITEM_HEIGHT = 40;
const CLIENT_HEIGHT = 400;
const PAGE_SIZE = 30;
/** 触发阈值 = max(300, clientHeight * 0.6)；视口 400 → 300 */
const TRIGGER_EDGE = 300;

interface HarnessProps {
  itemsLength: number;
  pageSize?: number;
  currentPage: number;
  totalPages: number;
  loading?: boolean;
  enabled?: boolean;
  loadError?: string | null;
  /** 列表第一项所属页码（默认 1：从第 1 页开始累计） */
  minLoadedPage?: number;
  onPageChange?: (page: number, direction: 'prev' | 'next' | 'jump') => void;
  /** 逐项高度（非均匀网格模拟，默认 ITEM_HEIGHT） */
  itemHeights?: number[];
  /** 模拟 table 容器：items 容器 children 与项数不一一对应（如 <table> 的 [thead, tbody]） */
  containerChildrenMismatch?: boolean;
}

function Harness({
  itemsLength,
  pageSize = PAGE_SIZE,
  currentPage,
  totalPages,
  loading = false,
  enabled = true,
  loadError,
  minLoadedPage,
  onPageChange,
  itemHeights,
  containerChildrenMismatch = false,
}: HarnessProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRef = useRef<HTMLDivElement>(null);
  const { visiblePage, jumpTo, showBottomLoader, showTopLoader, isLastPage } =
    useScrollPagination({
      containerRef: containerRef as RefObject<HTMLElement | null>,
      itemContainerRef: itemRef as RefObject<HTMLElement | null>,
      itemsLength,
      pageSize,
      currentPage,
      totalPages,
      loading,
      enabled,
      loadError,
      // 默认 = currentPage（模拟 replace 单页 / jump 后列表从当前页开始）；
      // 累计列表已覆盖第 1 页的场景显式传 minLoadedPage=1
      minLoadedPage: minLoadedPage ?? currentPage,
      onPageChange: onPageChange ?? (() => {}),
    });
  return (
    <div>
      <div
        data-testid="container"
        ref={containerRef}
        style={{ height: CLIENT_HEIGHT }}
      >
        <div data-testid="items" ref={itemRef}>
          {containerChildrenMismatch && <div data-testid="extra-child" />}
          {Array.from({ length: itemsLength }, (_, i) => (
            <div
              key={i}
              data-testid={`item-${i}`}
              style={{ height: itemHeights?.[i] ?? ITEM_HEIGHT }}
            />
          ))}
        </div>
      </div>
      <div data-testid="visible-page">{visiblePage}</div>
      <div data-testid="bottom-loader">{String(showBottomLoader)}</div>
      <div data-testid="top-loader">{String(showTopLoader)}</div>
      <div data-testid="last-page">{String(isLastPage)}</div>
      <button data-testid="jump-2" onClick={() => jumpTo(2)}>
        jump2
      </button>
      <button data-testid="jump-5" onClick={() => jumpTo(5)}>
        jump5
      </button>
    </div>
  );
}

/**
 * happy-dom 无布局：桩化与真实浏览器一致的滚动几何。
 * getBoundingClientRect 返回视口坐标——容器内容随 scrollTop 上移，
 * 第 i 项的视口 top = i*ITEM_HEIGHT - scrollTop（容器视口 top 恒为 0）。
 * offsetTop 桩为内容坐标（累计模型 jump 定位用）。
 */
function stubLayout(
  container: HTMLElement,
  itemsLength: number,
  scrollTop: number
) {
  const itemsEl = container.querySelector(
    '[data-testid="items"]'
  ) as HTMLElement;
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
    Object.defineProperty(child, 'offsetTop', {
      value: i * ITEM_HEIGHT,
      configurable: true,
      writable: true,
    });
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
}

/** 非均匀高度桩：滚动到底时视口顶部可能仍在前一页（真实网格场景） */
function stubLayoutVariableHeights(
  container: HTMLElement,
  heights: number[],
  scrollTop: number
) {
  const itemsEl = container.querySelector(
    '[data-testid="items"]'
  ) as HTMLElement;
  const total = heights.reduce((a, b) => a + b, 0);
  let acc = 0;
  const tops = heights.map((h) => {
    const t = acc;
    acc += h;
    return t;
  });
  Array.from(itemsEl.children).forEach((child, i) => {
    (child as HTMLElement).getBoundingClientRect = () => {
      const top = tops[i] - scrollTop;
      return {
        top,
        height: heights[i],
        bottom: top + heights[i],
        left: 0,
        right: 0,
        width: 0,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      } as DOMRect;
    };
    Object.defineProperty(child, 'offsetTop', {
      value: tops[i],
      configurable: true,
      writable: true,
    });
  });
  Object.defineProperty(container, 'scrollTop', {
    value: scrollTop,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(container, 'scrollHeight', {
    value: total,
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
}

function renderHarness(props: HarnessProps) {
  const onPageChange = vi.fn();
  const utils = render(<Harness {...props} onPageChange={onPageChange} />);
  const container = utils.getByTestId('container') as HTMLElement;
  stubLayout(container, props.itemsLength, 0);
  return { ...utils, container, onPageChange };
}

function scrollTo(
  container: HTMLElement,
  scrollTop: number,
  itemsLength: number
) {
  stubLayout(container, itemsLength, scrollTop);
  act(() => {
    fireEvent.scroll(container);
    // 测量已 rAF 节流（每帧最多一次 DOM 测量）：flush 一帧让指示器更新
    vi.advanceTimersByTime(16);
  });
}

/** 越过内容替换屏蔽窗口（SETTLE_BLOCK_MS = 100） */
function advanceSettleBlock() {
  act(() => {
    vi.advanceTimersByTime(150);
  });
}

/** 双 rAF（滚动恢复/jump 定位延迟到数据渲染完成后执行） */
function flushDoubleRaf() {
  act(() => {
    vi.advanceTimersByTime(16);
    vi.advanceTimersByTime(16);
  });
}

describe('useScrollPagination — 滚动分页控制器', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── 页码指示：累计多页模型（DOM 含多页）用 DOM 测量 ──

  it('累计多页：滚动到顶恒显示第 1 页（即使 currentPage 已到第 3 页）', () => {
    const { getByTestId } = renderHarness({
      itemsLength: 90,
      currentPage: 3,
      totalPages: 3,
      minLoadedPage: 1, // 从第 1 页滚上来的累计列表
    });
    // settle 屏蔽窗结束（100ms）后测量 scrollTop=0 → 恒为第 1 页
    advanceSettleBlock();
    expect(getByTestId('visible-page').textContent).toBe('1');
  });

  it('累计多页：视口滚动到第 2 页内容时指示器为 2', () => {
    const { container, getByTestId } = renderHarness({
      itemsLength: 90,
      currentPage: 3,
      totalPages: 3,
      minLoadedPage: 1, // 从第 1 页滚上来的累计列表
    });
    scrollTo(container, 1500, 90);
    expect(getByTestId('visible-page').textContent).toBe('2');
  });

  it('累计多页：滚动到底部显示最后一页（第 3 页）', () => {
    const { container, getByTestId } = renderHarness({
      itemsLength: 90,
      currentPage: 3,
      totalPages: 3,
      minLoadedPage: 1, // 从第 1 页滚上来的累计列表
    });
    scrollTo(container, 3200, 90);
    expect(getByTestId('visible-page').textContent).toBe('3');
  });

  it('非均匀高度：滚动到底（距底 200px 内）恒显示最后一页，即使视口顶部仍在前一页', () => {
    const { container, getByTestId } = renderHarness({
      itemsLength: 90,
      currentPage: 3,
      totalPages: 3,
      minLoadedPage: 1, // 从第 1 页滚上来的累计列表
      itemHeights: [...Array(60).fill(40), ...Array(30).fill(10)],
    });
    stubLayoutVariableHeights(
      container,
      [...Array(60).fill(40), ...Array(30).fill(10)],
      2300
    );
    act(() => {
      fireEvent.scroll(container);
      vi.advanceTimersByTime(16);
    });
    expect(getByTestId('visible-page').textContent).toBe('3');
  });

  it('单页（replace）：翻页数据到位后指示器 = 当前页', () => {
    const { rerender, getByTestId, onPageChange } = renderHarness({
      itemsLength: 30,
      currentPage: 1,
      totalPages: 3,
    });
    rerender(
      <Harness
        itemsLength={30}
        currentPage={2}
        totalPages={3}
        loading={false}
        onPageChange={onPageChange}
      />
    );
    // displayedPage 延迟到替换屏蔽窗结束更新（防 isFetching 延迟帧导致页码抢先）
    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(getByTestId('visible-page').textContent).toBe('2');
  });

  it('单页（replace）：翻页请求进行中指示器保持旧页', () => {
    const { rerender, getByTestId, onPageChange } = renderHarness({
      itemsLength: 30,
      currentPage: 1,
      totalPages: 3,
    });
    rerender(
      <Harness
        itemsLength={30}
        currentPage={2}
        totalPages={3}
        loading={true}
        onPageChange={onPageChange}
      />
    );
    expect(getByTestId('visible-page').textContent).toBe('1');
    rerender(
      <Harness
        itemsLength={30}
        currentPage={2}
        totalPages={3}
        loading={false}
        onPageChange={onPageChange}
      />
    );
    act(() => {
      vi.advanceTimersByTime(150); // displayedPage 延迟到替换屏蔽窗结束更新
    });
    expect(getByTestId('visible-page').textContent).toBe('2');
  });

  it('滚动触发翻页（isFetching 延迟一帧）时页码不抢先于数据（防「页码快速滚动」）', () => {
    const { rerender, getByTestId, onPageChange } = renderHarness({
      itemsLength: 30,
      currentPage: 1,
      totalPages: 10,
      minLoadedPage: 1,
    });
    advanceSettleBlock();
    // 帧1：滚动触发 next（currentPage 前跳 2），但 isFetching 尚未同步（loading 仍 false）
    rerender(
      <Harness
        itemsLength={30}
        currentPage={2}
        totalPages={10}
        minLoadedPage={1}
        loading={false}
        onPageChange={onPageChange}
      />
    );
    // 页码不得抢先：内容还是第 1 页，显示 1（修复前此处立即跳成 2）
    expect(getByTestId('visible-page').textContent).toBe('1');
    // 帧2：isFetching 同步（loading=true）→ 仍保持 1
    rerender(
      <Harness
        itemsLength={30}
        currentPage={2}
        totalPages={10}
        minLoadedPage={1}
        loading={true}
        onPageChange={onPageChange}
      />
    );
    expect(getByTestId('visible-page').textContent).toBe('1');
    // 数据到位（replace 单页 = 第 2 页）→ 屏蔽窗后页码更新为 2
    rerender(
      <Harness
        itemsLength={30}
        currentPage={2}
        totalPages={10}
        minLoadedPage={2}
        loading={false}
        onPageChange={onPageChange}
      />
    );
    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(getByTestId('visible-page').textContent).toBe('2');
  });

  it('无列表项时指示器回退为请求页', () => {
    const { getByTestId } = renderHarness({
      itemsLength: 0,
      currentPage: 2,
      totalPages: 2,
    });
    expect(getByTestId('visible-page').textContent).toBe('2');
  });

  it('测量不可靠（children 与项数不匹配，如 <table> 容器）：指示器回退数据实际渲染页而非请求页', () => {
    // SelectableTable 曾把 itemContainerRef 挂在 <table>（children=[thead, tbody]）上，
    // 测量恒放弃、回退请求页 → 滚动翻页时页码随请求页预跳（实例：用户管理页）
    const { container, getByTestId, rerender, onPageChange } = renderHarness({
      itemsLength: 60,
      currentPage: 2,
      totalPages: 3,
      containerChildrenMismatch: true,
    });
    // 视口已滚到中部（内容第 2 页）但容器不可测量 → 显示数据实际渲染页 2
    scrollTo(container, 500, 60);
    expect(getByTestId('visible-page').textContent).toBe('2');

    // 翻页请求进行中：请求页已预跳 3、内容未到 → 保持旧页 2（页码不预跳）
    rerender(
      <Harness
        itemsLength={60}
        currentPage={3}
        totalPages={3}
        loading={true}
        onPageChange={onPageChange}
        containerChildrenMismatch
      />
    );
    scrollTo(container, 500, 60);
    expect(getByTestId('visible-page').textContent).toBe('2');

    // 数据到位（3 页 90 项）→ 3
    rerender(
      <Harness
        itemsLength={90}
        currentPage={3}
        totalPages={3}
        loading={false}
        onPageChange={onPageChange}
        containerChildrenMismatch
      />
    );
    // displayedPage 延迟到替换屏蔽窗结束更新
    act(() => {
      vi.advanceTimersByTime(150);
    });
    scrollTo(container, 500, 90);
    expect(getByTestId('visible-page').textContent).toBe('3');
  });

  it('enabled=false 时不监听滚动、不触发翻页', () => {
    const { container, onPageChange } = renderHarness({
      itemsLength: 30,
      currentPage: 1,
      totalPages: 3,
      enabled: false,
    });
    advanceSettleBlock();
    scrollTo(container, 600, 30);
    expect(onPageChange).not.toHaveBeenCalled();
  });

  // ── 边界触发（预加载：阈值 max(300, clientHeight×0.6) = 300） ──

  it('距底 300px（预加载提前量）即触发下一页', () => {
    const { container, onPageChange } = renderHarness({
      itemsLength: 30,
      currentPage: 1,
      totalPages: 3,
    });
    advanceSettleBlock();
    // 视口 400：距底 300px = scrollTop 500（500+400 >= 1200-300）
    scrollTo(container, 500, 30);
    expect(onPageChange).toHaveBeenCalledWith(2, 'next');
  });

  it('中间位置（距底 > 300px）不触发翻页', () => {
    const { container, onPageChange } = renderHarness({
      itemsLength: 30,
      currentPage: 1,
      totalPages: 3,
    });
    advanceSettleBlock();
    scrollTo(container, 300, 30); // 300+400=700 < 900
    expect(onPageChange).not.toHaveBeenCalled();
  });

  it('滚动到顶（距顶 300px 内）触发上一页', () => {
    const { container, onPageChange } = renderHarness({
      itemsLength: 30,
      currentPage: 2,
      totalPages: 2,
    });
    advanceSettleBlock();
    scrollTo(container, 400, 30); // 中间：仅建立方向基线
    expect(onPageChange).not.toHaveBeenCalled();
    scrollTo(container, 200, 30); // 距顶 200px ≤ 300 → 触发 prev
    expect(onPageChange).toHaveBeenCalledWith(1, 'prev');
  });

  it('累计列表已覆盖第 1 页（minLoadedPage=1）时滚动到顶不触发 prev（防重复加载已存在页）', () => {
    // 用户从第 1 页连续向下滚到第 5 页（列表 [1..5]，cp=5），再向上滚到顶：
    // 目标页 cp-1=4 已在列表中，触发会 prepend 去重错乱（[4,1,2,3,5]）
    const { container, onPageChange } = renderHarness({
      itemsLength: 150, // 5 页 × 30
      currentPage: 5,
      totalPages: 10,
      minLoadedPage: 1,
    });
    advanceSettleBlock();
    scrollTo(container, 600, 150); // 中间：建立方向基线
    expect(onPageChange).not.toHaveBeenCalled();
    scrollTo(container, 200, 150); // 顶部边界 → 不触发（page4 已存在）
    expect(onPageChange).not.toHaveBeenCalled();
    scrollTo(container, 0, 150); // 滚到顶 → 仍不触发
    expect(onPageChange).not.toHaveBeenCalled();
  });

  it('jump 后（minLoadedPage=cp）滚动到顶触发 prev，可继续向上加载更早页', () => {
    // 点击页码 5（replace 单页）：列表 [5]，cp=5，minLoadedPage=5 → 滚到顶触发 prev
    const { container, onPageChange } = renderHarness({
      itemsLength: 30,
      currentPage: 5,
      totalPages: 10,
      minLoadedPage: 5,
    });
    advanceSettleBlock();
    scrollTo(container, 600, 30); // 中间：建立方向基线
    scrollTo(container, 200, 30); // 顶部边界 → 触发 prev(4)
    expect(onPageChange).toHaveBeenCalledWith(4, 'prev');
  });

  it('jump 后向下滚再向上滚（列表 [3,4]，minLoadedPage=3）：prev 目标页 = minLoadedPage-1 = 2（而非已在列表的 cp-1=3）', () => {
    const { container, onPageChange } = renderHarness({
      itemsLength: 60,
      currentPage: 4,
      totalPages: 10,
      minLoadedPage: 3,
    });
    advanceSettleBlock();
    scrollTo(container, 400, 60); // 中间：建立方向基线
    expect(onPageChange).not.toHaveBeenCalled();
    scrollTo(container, 200, 60); // 顶部边界 → 触发 prev(2)
    expect(onPageChange).toHaveBeenCalledWith(2, 'prev');
  });

  it('prev 前插后视口锚定，页脚页码指示器显示锚定后的页（而非锚定前的错误页码）', () => {
    // 用户点页码 3（replace 单页）后向上滚动：prev 前插 page2 → 60 项累计
    // 视口锚定 scrollTop = 200 + 1200 = 1400（page2 区域），指示器应为 2
    const { container, getByTestId, rerender, onPageChange } = renderHarness({
      itemsLength: 30,
      currentPage: 3,
      totalPages: 10,
      minLoadedPage: 3,
    });
    advanceSettleBlock();
    scrollTo(container, 600, 30);
    scrollTo(container, 200, 30); // 顶部触发 prev
    expect(onPageChange).toHaveBeenCalledWith(2, 'prev');
    onPageChange.mockClear();

    // 请求中
    rerender(
      <Harness
        itemsLength={30}
        currentPage={2}
        totalPages={10}
        minLoadedPage={3}
        loading={true}
        onPageChange={onPageChange}
      />
    );
    stubLayout(container, 30, 200);
    // 数据到位前插（60 项）→ 双 rAF 视口锚定
    rerender(
      <Harness
        itemsLength={60}
        currentPage={2}
        totalPages={10}
        minLoadedPage={2}
        loading={false}
        onPageChange={onPageChange}
      />
    );
    stubLayout(container, 60, 200);
    flushDoubleRaf();
    expect(container.scrollTop).toBe(1400);
    // 锚定后几何随滚动更新（真实浏览器布局行为）
    stubLayout(container, 60, 1400);
    // settle 屏蔽窗结束（100ms）后重新测量：视口顶部在 page3 区域（index 35，[2,3] 列表）
    // → 指示器 = 3（带 minLoadedPage 偏移，而非从 1 计数的错误值）
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(getByTestId('visible-page').textContent).toBe('3');
  });

  it('jump 到深层页后向上滚前插（列表 [4,5]，minLoadedPage=4）：页码指示器带偏移（第 21 项 = page5 而非 2）', () => {
    const { container, getByTestId } = renderHarness({
      itemsLength: 40,
      pageSize: 20,
      currentPage: 5,
      totalPages: 10,
      minLoadedPage: 4,
    });
    // 滚动到 page5 区域：视口顶部第 21 项（index 20 = page5 第一项）→ 显示 5
    scrollTo(container, 800, 40);
    expect(getByTestId('visible-page').textContent).toBe('5');
    // 滚动到顶部（page4 开头）：显示 4 而非 1
    scrollTo(container, 0, 40);
    expect(getByTestId('visible-page').textContent).toBe('4');
    // 滚动到底部（page5 结尾，距底 200 内）：显示 5 而非 2
    scrollTo(container, 1200, 40);
    expect(getByTestId('visible-page').textContent).toBe('5');
  });

  it('加载中整体阻塞翻页触发', () => {
    const { container, onPageChange } = renderHarness({
      itemsLength: 30,
      currentPage: 1,
      totalPages: 3,
      loading: true,
    });
    advanceSettleBlock();
    scrollTo(container, 600, 30); // 底部触发区：next 被阻塞
    expect(onPageChange).not.toHaveBeenCalled();
    scrollTo(container, 0, 30); // 顶部：prev 也被阻塞
    expect(onPageChange).not.toHaveBeenCalled();
  });

  it('内容替换窗口内不触发边界翻页，窗口过后按新内容继续触发', () => {
    const { container, onPageChange, rerender } = renderHarness({
      itemsLength: 30,
      currentPage: 1,
      totalPages: 3,
    });
    advanceSettleBlock();
    scrollTo(container, 600, 30);
    expect(onPageChange).toHaveBeenCalledWith(2, 'next');
    onPageChange.mockClear();

    rerender(
      <Harness
        itemsLength={60}
        currentPage={2}
        totalPages={3}
        loading={false}
        onPageChange={onPageChange}
      />
    );
    stubLayout(container, 60, 600);
    scrollTo(container, 1800, 60); // 替换窗口内滚动到底 → 不触发
    expect(onPageChange).not.toHaveBeenCalled();
    advanceSettleBlock();
    scrollTo(container, 2000, 60); // 窗口过后 → 触发下一页
    expect(onPageChange).toHaveBeenCalledWith(3, 'next');
  });

  // ── 滚动位置恢复 ──

  it('向上滚动加载（prepend）后视口锚定回原内容位置（oldTop + heightDiff）', () => {
    const { container, onPageChange, rerender } = renderHarness({
      itemsLength: 60,
      currentPage: 2,
      totalPages: 3,
    });
    advanceSettleBlock();
    // 滚动到顶触发 prev：触发时保存 beforeLoad（scrollTop=200, height=2400）
    scrollTo(container, 400, 60);
    scrollTo(container, 200, 60);
    expect(onPageChange).toHaveBeenCalledWith(1, 'prev');
    stubLayout(container, 60, 200);

    // 请求进行中 → 数据到位前插合并（90 项），双 rAF 后恢复
    rerender(
      <Harness
        itemsLength={60}
        currentPage={1}
        totalPages={3}
        loading={true}
        onPageChange={onPageChange}
      />
    );
    stubLayout(container, 60, 200);
    rerender(
      <Harness
        itemsLength={90}
        currentPage={1}
        totalPages={3}
        loading={false}
        onPageChange={onPageChange}
      />
    );
    stubLayout(container, 90, 200);
    flushDoubleRaf();

    expect(container.scrollTop).toBe(200 + (3600 - 2400));
  });

  it('向下滚动加载（append）不调整滚动位置', () => {
    const { container, onPageChange, rerender } = renderHarness({
      itemsLength: 30,
      currentPage: 1,
      totalPages: 3,
    });
    advanceSettleBlock();
    scrollTo(container, 500, 30);
    scrollTo(container, 600, 30);
    expect(onPageChange).toHaveBeenCalledWith(2, 'next');

    rerender(
      <Harness
        itemsLength={30}
        currentPage={2}
        totalPages={3}
        loading={true}
        onPageChange={onPageChange}
      />
    );
    stubLayout(container, 30, 600);
    rerender(
      <Harness
        itemsLength={60}
        currentPage={2}
        totalPages={3}
        loading={false}
        onPageChange={onPageChange}
      />
    );
    stubLayout(container, 60, 600);
    flushDoubleRaf();

    expect(container.scrollTop).toBe(600);
  });

  it('jumpTo（页脚跳页，replace 模型）：数据到位后滚动条居中', () => {
    const { container, getByTestId, rerender, onPageChange } = renderHarness({
      itemsLength: 30,
      currentPage: 1,
      totalPages: 3,
    });
    advanceSettleBlock();

    act(() => {
      fireEvent.click(getByTestId('jump-2'));
    });
    // 页面层翻页：replace 模型内容仍 30 项（缓存命中场景可不经 loading 翻转）
    rerender(
      <Harness
        itemsLength={30}
        currentPage={2}
        totalPages={3}
        loading={false}
        onPageChange={onPageChange}
      />
    );
    stubLayout(container, 30, 0);
    flushDoubleRaf();

    // 滚动条居中：(1200 - 400) / 2 = 400
    expect(container.scrollTop).toBe(400);
  });

  it('jumpTo（累计模型）：视口中心对准目标页第一项（offsetTop - clientHeight/2）', () => {
    const { container, getByTestId, rerender, onPageChange } = renderHarness({
      itemsLength: 90,
      currentPage: 3,
      totalPages: 3,
    });
    advanceSettleBlock();

    act(() => {
      fireEvent.click(getByTestId('jump-2'));
    });
    rerender(
      <Harness
        itemsLength={90}
        currentPage={2}
        totalPages={3}
        loading={false}
        onPageChange={onPageChange}
      />
    );
    stubLayout(container, 90, 0);
    flushDoubleRaf();

    // 目标页第一项 offsetTop = 30*40 = 1200，视口中心：1200 - 400/2 = 1000
    expect(container.scrollTop).toBe(1000);
  });

  it('pageSize 变化：滚动位置回顶', () => {
    const { container, rerender, onPageChange } = renderHarness({
      itemsLength: 30,
      pageSize: 30,
      currentPage: 1,
      totalPages: 3,
    });
    advanceSettleBlock();
    stubLayout(container, 30, 400); // 模拟已滚动到中部

    rerender(
      <Harness
        itemsLength={30}
        pageSize={50}
        currentPage={1}
        totalPages={2}
        loading={false}
        onPageChange={onPageChange}
      />
    );
    stubLayout(container, 30, 400);
    flushDoubleRaf();

    expect(container.scrollTop).toBe(0);
  });

  // ── 自动填充（内容不足视口时自动加载下一页；检查延迟一帧等布局稳定） ──

  it('内容不足视口且还有下一页：挂载后自动触发 next', () => {
    const { onPageChange } = renderHarness({
      itemsLength: 5, // 200px < 视口 400px
      currentPage: 1,
      totalPages: 3,
    });
    act(() => {
      vi.advanceTimersByTime(16); // flush 自动填充的延迟检查
    });
    expect(onPageChange).toHaveBeenCalledWith(2, 'next');
  });

  it('自动填充：追加后仍不足视口继续加载，填满后停止', () => {
    const { rerender, onPageChange } = renderHarness({
      itemsLength: 5,
      currentPage: 1,
      totalPages: 3,
    });
    act(() => {
      vi.advanceTimersByTime(16);
    });
    expect(onPageChange).toHaveBeenCalledWith(2, 'next');
    onPageChange.mockClear();

    // 第 2 页到位仍不足（10 项 = 400px == 视口）
    rerender(
      <Harness
        itemsLength={10}
        currentPage={2}
        totalPages={3}
        loading={false}
        onPageChange={onPageChange}
      />
    );
    act(() => {
      vi.advanceTimersByTime(16);
    });
    expect(onPageChange).toHaveBeenCalledWith(3, 'next');
    onPageChange.mockClear();

    // 第 3 页到位足够（15 项 = 600px > 视口）→ 不再触发
    rerender(
      <Harness
        itemsLength={15}
        currentPage={3}
        totalPages={3}
        loading={false}
        onPageChange={onPageChange}
      />
    );
    act(() => {
      vi.advanceTimersByTime(16);
    });
    expect(onPageChange).not.toHaveBeenCalled();
  });

  it('自动填充：单页（无下一页）不触发', () => {
    const { onPageChange } = renderHarness({
      itemsLength: 5,
      currentPage: 1,
      totalPages: 1,
    });
    act(() => {
      vi.advanceTimersByTime(16);
    });
    expect(onPageChange).not.toHaveBeenCalled();
  });

  it('自动填充：加载中不触发', () => {
    const { onPageChange } = renderHarness({
      itemsLength: 5,
      currentPage: 1,
      totalPages: 3,
      loading: true,
    });
    act(() => {
      vi.advanceTimersByTime(16);
    });
    expect(onPageChange).not.toHaveBeenCalled();
  });

  // ── 加载指示派生 ──

  it('showBottomLoader：加载中且已有数据时显示', () => {
    const { getByTestId, rerender, onPageChange } = renderHarness({
      itemsLength: 30,
      currentPage: 1,
      totalPages: 3,
      loading: false,
    });
    expect(getByTestId('bottom-loader').textContent).toBe('false');

    rerender(
      <Harness
        itemsLength={30}
        currentPage={2}
        totalPages={3}
        loading={true}
        onPageChange={onPageChange}
      />
    );
    expect(getByTestId('bottom-loader').textContent).toBe('true');

    rerender(
      <Harness
        itemsLength={30}
        currentPage={2}
        totalPages={3}
        loading={false}
        onPageChange={onPageChange}
      />
    );
    expect(getByTestId('bottom-loader').textContent).toBe('false');
  });

  it('showTopLoader：向上滚动加载（最近方向 prev）进行中显示', () => {
    const { container, getByTestId, rerender, onPageChange } = renderHarness({
      itemsLength: 60,
      currentPage: 2,
      totalPages: 3,
      loading: false,
    });
    expect(getByTestId('top-loader').textContent).toBe('false');

    advanceSettleBlock();
    scrollTo(container, 400, 60);
    scrollTo(container, 0, 60); // 触发 prev → 最近方向 = prev
    expect(onPageChange).toHaveBeenCalledWith(1, 'prev');

    rerender(
      <Harness
        itemsLength={60}
        currentPage={1}
        totalPages={3}
        loading={true}
        onPageChange={onPageChange}
      />
    );
    expect(getByTestId('top-loader').textContent).toBe('true');

    rerender(
      <Harness
        itemsLength={90}
        currentPage={1}
        totalPages={3}
        loading={false}
        onPageChange={onPageChange}
      />
    );
    expect(getByTestId('top-loader').textContent).toBe('false');
  });

  it('showTopLoader：向下滚动加载（方向 next）不显示顶部指示', () => {
    const { container, getByTestId, rerender, onPageChange } = renderHarness({
      itemsLength: 30,
      currentPage: 1,
      totalPages: 3,
      loading: false,
    });
    advanceSettleBlock();
    scrollTo(container, 600, 30); // 触发 next
    expect(onPageChange).toHaveBeenCalledWith(2, 'next');

    rerender(
      <Harness
        itemsLength={30}
        currentPage={2}
        totalPages={3}
        loading={true}
        onPageChange={onPageChange}
      />
    );
    expect(getByTestId('top-loader').textContent).toBe('false');
  });

  it('isLastPage：已加载到最后一页时为 true', () => {
    const { getByTestId } = renderHarness({
      itemsLength: 60,
      currentPage: 3,
      totalPages: 3,
    });
    expect(getByTestId('last-page').textContent).toBe('true');
  });

  it('isLastPage：未到最后一页时为 false', () => {
    const { getByTestId } = renderHarness({
      itemsLength: 60,
      currentPage: 2,
      totalPages: 3,
    });
    expect(getByTestId('last-page').textContent).toBe('false');
  });

  it('isLastPage：无数据时不显示（避免空态误报）', () => {
    const { getByTestId } = renderHarness({
      itemsLength: 0,
      currentPage: 1,
      totalPages: 1,
    });
    expect(getByTestId('last-page').textContent).toBe('false');
  });

  it('isLastPage：totalPages 未同步（0）时不显示（防首屏误报「已经是最后一页」）', () => {
    const { getByTestId } = renderHarness({
      itemsLength: 30,
      currentPage: 1,
      totalPages: 0,
    });
    expect(getByTestId('last-page').textContent).toBe('false');
  });

  it('isLastPage：加载中不显示（防与底部加载指示冲突）', () => {
    const { getByTestId } = renderHarness({
      itemsLength: 30,
      currentPage: 1,
      totalPages: 1,
      loading: true,
    });
    expect(getByTestId('last-page').textContent).toBe('false');
  });

  it('jump 到未加载页（累计模型 → replace）：保留挂起等数据到位后居中定位', () => {
    const { container, getByTestId, rerender, onPageChange } = renderHarness({
      itemsLength: 90, // 已累计 3 页
      currentPage: 3,
      totalPages: 5,
    });
    advanceSettleBlock();

    // 页脚跳未加载的第 5 页：累计模型下 children[120] 不存在 → 保留挂起等 replace
    act(() => {
      fireEvent.click(getByTestId('jump-5'));
    });
    rerender(
      <Harness
        itemsLength={90}
        currentPage={5}
        totalPages={5}
        loading={false}
        onPageChange={onPageChange}
      />
    );
    stubLayout(container, 90, 0);
    flushDoubleRaf();
    // 目标页未加载：未定位（保持原位置 0），挂起保留
    expect(container.scrollTop).toBe(0);

    // replace 到位（30 项 = 第 5 页）：居中定位 (1200-400)/2 = 400
    rerender(
      <Harness
        itemsLength={30}
        currentPage={5}
        totalPages={5}
        loading={false}
        onPageChange={onPageChange}
      />
    );
    stubLayout(container, 30, 0);
    flushDoubleRaf();
    expect(container.scrollTop).toBe(400);
  });

  // ── 动态提前量（滚动速度感知：连续快速滚动放大提前量，单次大跳不放大） ──

  it('连续快速滚动：速度达标后提前量放大（距底更远即触发）', () => {
    const { container, onPageChange } = renderHarness({
      itemsLength: 30,
      currentPage: 1,
      totalPages: 3,
    });
    advanceSettleBlock();
    // 首次滚动（velocityRef 初始 0，单次事件不放大）：450+400=850 < 1200-300=900 不触发
    scrollTo(container, 450, 30);
    expect(onPageChange).not.toHaveBeenCalled();
    // 连续快速滚动（上一事件速度达标 → 提前量放大至 600）：550+400=950 >= 1200-600 触发
    scrollTo(container, 550, 30);
    expect(onPageChange).toHaveBeenCalledWith(2, 'next');
  });

  it('单次大跳（拖滚动条式）+ 停顿后慢速滚动：不放大提前量', () => {
    const { container, onPageChange } = renderHarness({
      itemsLength: 30,
      currentPage: 1,
      totalPages: 3,
    });
    advanceSettleBlock();
    // 从顶单次跳 450：首事件不放大 → 850 < 900 不触发
    scrollTo(container, 450, 30);
    expect(onPageChange).not.toHaveBeenCalled();
    // 长停顿后慢速小幅滚动（速度不达标）：880 < 900 仍不触发
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    scrollTo(container, 480, 30);
    expect(onPageChange).not.toHaveBeenCalled();
  });

  // ── 链式预载（数据到位后仍停留在触发边界内自动续载） ──

  it('链式预载：数据到位后仍停留在底部边界内自动续载下一页', () => {
    const { container, onPageChange, rerender } = renderHarness({
      itemsLength: 30,
      currentPage: 1,
      totalPages: 5,
    });
    advanceSettleBlock();
    scrollTo(container, 800, 30); // 滚到底触发 next
    expect(onPageChange).toHaveBeenCalledWith(2, 'next');
    onPageChange.mockClear();

    // 请求中（keepPreviousData 占位：itemsLength 不变）
    rerender(
      <Harness
        itemsLength={30}
        currentPage={2}
        totalPages={5}
        loading={true}
        onPageChange={onPageChange}
      />
    );
    stubLayout(container, 30, 800);
    // 数据到位：用户继续快速滚动已贴近新底部（2140 距底 < 300）
    rerender(
      <Harness
        itemsLength={60}
        currentPage={2}
        totalPages={5}
        loading={false}
        onPageChange={onPageChange}
      />
    );
    stubLayout(container, 60, 2140);
    // loading 结束 + settle 屏蔽窗过后：仍在边界 → 自动续载下一页
    act(() => {
      vi.advanceTimersByTime(116);
    });
    expect(onPageChange).toHaveBeenCalledWith(3, 'next');
  });

  it('链式预载：连续自动加载有上限（3 页）防无限拉取', () => {
    const { container, onPageChange, rerender } = renderHarness({
      itemsLength: 30,
      currentPage: 1,
      totalPages: 10,
    });
    advanceSettleBlock();
    scrollTo(container, 800, 30); // 用户滚动触发第 1 次（重置计数为 0）
    onPageChange.mockClear();

    // 依次数据到位（每次都停在底部）：链式 1→2→3 次续载后达到上限停止
    for (let page = 2; page <= 6; page++) {
      rerender(
        <Harness
          itemsLength={30 * (page - 1)}
          currentPage={page}
          totalPages={10}
          loading={true}
          onPageChange={onPageChange}
        />
      );
      stubLayout(container, 30 * (page - 1), 800);
      rerender(
        <Harness
          itemsLength={30 * page}
          currentPage={page}
          totalPages={10}
          loading={false}
          onPageChange={onPageChange}
        />
      );
      stubLayout(container, 30 * page, 30 * page * ITEM_HEIGHT - CLIENT_HEIGHT);
      act(() => {
        vi.advanceTimersByTime(116);
      });
    }
    // 仅页 2/3/4 到位后触发链式（页 5 到位后计数已达上限 3 → 停止）
    expect(onPageChange).toHaveBeenCalledTimes(3);
    expect(onPageChange.mock.calls.map((c) => c[0])).toEqual([3, 4, 5]);
  });

  it('链式预载：prev 数据到位后视口锚定回原位置（离开顶部边界），不重复触发', () => {
    const { container, onPageChange, rerender } = renderHarness({
      itemsLength: 90,
      currentPage: 3,
      totalPages: 5,
    });
    advanceSettleBlock();
    scrollTo(container, 1200, 90); // 中间位置建立方向基线
    scrollTo(container, 200, 90); // 顶部边界 → 触发 prev
    expect(onPageChange).toHaveBeenCalledWith(2, 'prev');
    onPageChange.mockClear();

    // 请求中
    rerender(
      <Harness
        itemsLength={90}
        currentPage={2}
        totalPages={5}
        loading={true}
        onPageChange={onPageChange}
      />
    );
    stubLayout(container, 90, 200);
    // 数据到位（120 项前插）→ 双 rAF 视口锚定：scrollTop = 200 + 1200 = 1400
    rerender(
      <Harness
        itemsLength={120}
        currentPage={2}
        totalPages={5}
        loading={false}
        onPageChange={onPageChange}
      />
    );
    stubLayout(container, 120, 200);
    flushDoubleRaf();
    expect(container.scrollTop).toBe(1400);
    // 链式检查：锚定后距顶 1400px 已离开边界 → 不重复触发（防重复请求）
    act(() => {
      vi.advanceTimersByTime(116);
    });
    expect(onPageChange).not.toHaveBeenCalled();
  });

  it('链式预载：翻页失败（loadError 非空）后停止，不静默跳过失败页', () => {
    const { container, onPageChange, rerender } = renderHarness({
      itemsLength: 30,
      currentPage: 1,
      totalPages: 5,
    });
    advanceSettleBlock();
    scrollTo(container, 800, 30); // 滚到底触发 next
    expect(onPageChange).toHaveBeenCalledWith(2, 'next');
    onPageChange.mockClear();

    // 请求中
    rerender(
      <Harness
        itemsLength={30}
        currentPage={2}
        totalPages={5}
        loading={true}
        onPageChange={onPageChange}
      />
    );
    stubLayout(container, 30, 800);
    // 请求失败：数据未追加（itemsLength 仍 30）+ loadError 非空 + 仍在底部边界
    rerender(
      <Harness
        itemsLength={30}
        currentPage={2}
        totalPages={5}
        loading={false}
        loadError="加载失败"
        onPageChange={onPageChange}
      />
    );
    stubLayout(container, 30, 800);
    // 链式检查：loadError 非空 → 停止（不请求第 3 页，避免跳过失败的第 2 页）
    act(() => {
      vi.advanceTimersByTime(116);
    });
    expect(onPageChange).not.toHaveBeenCalled();
  });
});
