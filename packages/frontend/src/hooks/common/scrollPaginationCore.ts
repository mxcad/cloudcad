///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import type { RefObject } from 'react';

// ── 常量 ───────────────────────────────────────────────────────────────────

/** 边界触发阈值下限（px）：视口小（如侧边栏）时也保证有提前量 */
export const MIN_TRIGGER_EDGE = 300;
/** 边界触发提前量比例：触发距离 = max(MIN_TRIGGER_EDGE, clientHeight × 该值) */
export const TRIGGER_EDGE_RATIO = 0.6;
/** 页码指示「距底即最后一页」阈值（px）：独立于触发阈值，避免预加载提前让页码过早变最后一页 */
export const PAGE_EDGE_PX = 200;
/** 内容替换后的触发屏蔽窗口（ms），防止数据到位瞬间的滚动事件误触发边界翻页 */
export const SETTLE_BLOCK_MS = 100;
/** 滚动速度基准（px/ms ≈ 1500px/s）：连续滚动速度达此值起放大提前量 */
export const VELOCITY_BASE = 1.5;
/** 提前量速度放大上限（倍）：快速滚动时提前量最多翻倍，保证快速滚到底数据已就位 */
export const MAX_VELOCITY_FACTOR = 2;
/** 链式预载连续自动加载上限（页）：数据到位后仍停留在触发边界时自动续载，防慢网下无限拉取 */
export const MAX_CHAIN_PAGES = 3;

// ── 类型 ───────────────────────────────────────────────────────────────────

export interface UseScrollPaginationOptions {
  /** 滚动容器 */
  containerRef: RefObject<HTMLElement | null>;
  /** 列表项容器（children 即按页码顺序排列的列表项 DOM，用于测量视口所在页）；未提供时不测量 */
  itemContainerRef: RefObject<HTMLElement | null> | null;
  /** 当前已渲染列表项数量 */
  itemsLength: number;
  /** 每页数量 */
  pageSize: number;
  /** 最近一次请求的页码 */
  currentPage: number;
  /** 总页数 */
  totalPages: number;
  /** 数据加载中（翻页请求进行中或后台刷新） */
  loading: boolean;
  /** 是否启用滚动分页 */
  enabled: boolean;
  /** 滚动处理前额外检查，返回 true 则跳过本次（如橡皮筋框选进行中） */
  shouldSkip?: () => boolean;
  /** 翻页/后台刷新失败信息（非空时链式预载停止，避免静默跳过失败页破坏「列表=已加载连续页」） */
  loadError?: string | null;
  /**
   * 列表第一项所属页码（累计模型下由父层合并逻辑维护：整体替换/prepend → currentPage，
   * append → 不变；replace 单页模型 = currentPage）。prev 触发条件之一：
   * 目标页 cp-1 已存在于列表（minLoadedPage ≤ cp-1）时不触发，防重复加载已存在页
   * 导致 prepend 去重错乱（实例：从第 1 页滚到第 5 页后向上滚，错误请求已存在的 page4）。
   */
  minLoadedPage?: number;
  /** 边界触发翻页回调（滚动触发只产生 next/prev；页脚跳页走 jumpTo 通知） */
  onPageChange: (page: number, direction: 'prev' | 'next') => void;
}

export interface PendingRestore {
  direction: 'prev' | 'next' | 'jump' | 'top';
  /** jump 目标页码 */
  page: number | null;
  /** 触发前的滚动位置（prev 前插恢复用） */
  beforeLoad: { scrollTop: number; scrollHeight: number } | null;
}

export interface UseScrollPaginationReturn {
  /**
   * 页脚指示器应展示的页码，保证「指示器 = 可视内容」：
   * - 列表已累计多页（itemsLength > pageSize，滚动翻页 append/prepend 模型）：
   *   测量视口顶部所在页（滚动到顶恒为第 1 页、距底 PAGE_EDGE_PX 内为最后一页）。
   * - 单页（replace 模型：翻页替换内容 / jump 跳转，DOM 只有当前页）：
   *   跟随「数据实际渲染的页 displayedPage」。
   */
  visiblePage: number;
  /** 页脚跳页通知（页码/上一页/下一页按钮）：数据到位后滚动条居中定位 */
  jumpTo: (page: number) => void;
  /** 底部加载指示（滚动加载/自动填充进行中） */
  showBottomLoader: boolean;
  /** 顶部加载指示（向上滚动加载进行中，最近方向为 prev） */
  showTopLoader: boolean;
  /** 已加载到最后一页（列表非空且当前页到达总页数） */
  isLastPage: boolean;
}

/** measureVisiblePage 需要的分页状态快照（hook 内 stateRef.current 的结构子集） */
export interface MeasureState {
  itemsLength: number;
  pageSize: number;
  currentPage: number;
  totalPages: number;
  /** 数据加载中（翻页请求进行中或后台刷新） */
  loading: boolean;
  /** 数据实际渲染页（加载中保持旧页）：测量不可靠时回退用它而非请求页 */
  displayedPage: number;
  /** 列表第一项所属页码（jump 到深层页后前插，列表不从第 1 页开始时测量需偏移） */
  minLoadedPage: number;
}

// ── 纯函数 ─────────────────────────────────────────────────────────────────

/** 边界触发提前量：基准 = max(MIN_TRIGGER_EDGE, clientHeight × RATIO)，可乘以速度因子（1~2） */
export function computeTriggerEdge(
  clientHeight: number,
  velocityFactor = 1
): number {
  return Math.round(
    Math.max(MIN_TRIGGER_EDGE, clientHeight * TRIGGER_EDGE_RATIO) *
      velocityFactor
  );
}

/**
 * 速度因子（提前量放大系数）：连续快速滚动才放大。
 * 单次大跳（拖滚动条/PageDown）不视为快速滚动模式——要求上一事件与本次事件
 * 速度均达标（≥ VELOCITY_BASE）才按本次速度线性放大，封顶 MAX_VELOCITY_FACTOR。
 */
export function computeVelocityFactor(
  prevVelocity: number,
  instVelocity: number
): number {
  if (
    prevVelocity >= VELOCITY_BASE &&
    instVelocity >= VELOCITY_BASE
  ) {
    return Math.min(
      MAX_VELOCITY_FACTOR,
      Math.max(1, instVelocity / VELOCITY_BASE)
    );
  }
  return 1;
}

/**
 * 计算视口顶部所在页：二分查找第一个「底部仍在视口内」的列表项，页码 = 下标 / pageSize。
 * 仅对「DOM 累计多页」的模型有效，故 children 必须与 items 一一对应；
 * 任何一项渲染出多个 DOM 节点都会破坏下标 ↔ 页码映射，此时放弃测量回退 displayedPage。
 * 距底 PAGE_EDGE_PX 内恒为最后一页——真实网格每项高度不均，视口顶部可能仍在前一页，
 * 但用户看到的内容已是最后一页。
 *
 * 页码计算带 minLoadedPage 偏移：jump 到深层页后向上滚动前插（列表不从第 1 页开始，
 * 如 [4,5]）时，第 i 项的真实页码 = floor(i/ps) + minLoadedPage，而非 floor(i/ps) + 1。
 */
export function measureVisiblePage(
  container: HTMLElement,
  itemContainer: HTMLElement | null | undefined,
  state: MeasureState,
  scrollTop: number
): number {
  const {
    itemsLength: len,
    pageSize: ps,
    totalPages: tp,
    displayedPage,
    minLoadedPage,
  } = state;
  if (!itemContainer || len === 0 || ps <= 0) return state.currentPage;
  // 顶部恒为列表第一页（jump 后列表从深层页开始 → 显示 minLoadedPage），跳过无谓的布局读取
  if (scrollTop <= 1) return minLoadedPage;
  if (
    scrollTop + container.clientHeight >=
    container.scrollHeight - PAGE_EDGE_PX
  ) {
    // 距底 PAGE_EDGE_PX 内：恒为「已累计内容的最后一页」= 已加载页数 + minLoadedPage − 1
    return Math.ceil(len / ps) + minLoadedPage - 1;
  }
  const children = itemContainer.children;
  if (children.length !== len) return displayedPage; // 项 ↔ DOM 非一一对应，测量不可靠
  // 视口坐标：项的底部仍在滚动容器顶部之下 ⟺ 该项是视口内第一个可见项
  const containerTop = container.getBoundingClientRect().top;
  let lo = 0;
  let hi = children.length - 1;
  let firstVisible = children.length;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const el = children[mid] as HTMLElement;
    if (el.getBoundingClientRect().bottom > containerTop) {
      firstVisible = mid;
      hi = mid - 1;
    } else {
      lo = mid + 1;
    }
  }
  if (firstVisible >= len) return Math.ceil(len / ps) + minLoadedPage - 1; // 兜底：最后一项所在页
  return Math.min(
    Math.floor(firstVisible / ps) + minLoadedPage,
    tp || Math.ceil(len / ps) + minLoadedPage - 1
  );
}
