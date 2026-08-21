///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  SETTLE_BLOCK_MS,
  MAX_CHAIN_PAGES,
  computeTriggerEdge,
  computeVelocityFactor,
  measureVisiblePage as measureVisiblePageCore,
} from './scrollPaginationCore';
import { useScrollRestore } from './useScrollRestore';
import type {
  MeasureState,
  PendingRestore,
  UseScrollPaginationOptions,
  UseScrollPaginationReturn,
} from './scrollPaginationCore';

/**
 * 滚动分页控制器（FileListGrid / SelectableTable / ResourceList / ProjectListView 共用）
 *
 * - visiblePage：见 UseScrollPaginationReturn 注释，两种数据模型统一；
 * - 边界触发（预加载）：距底/顶 max(300, clientHeight×0.6) 内滚动即触发，
 *   连续快速滚动时按速度放大提前量至多 2 倍，数据提前就位、滚动到底无等待；
 *   加载中整体阻塞防止并发；
 * - 滚动位置恢复（数据到位 + 双 rAF，等父层合并渲染完成）：
 *   prev 前插 → scrollTop = oldTop + heightDiff 视口锚定；
 *   jump 跳页 → 累计模型定位目标页第一项（视口中心），replace 模型滚动条居中；
 *   pageSize 变化 → 回顶；next 追加不动；
 * - 自动填充：内容不足视口且还有下一页 → 自动触发 next 直至填满/加载完；
 * - 链式预载：数据到位后仍停留在触发边界内 → 自动续载（上限 MAX_CHAIN_PAGES，
 *   用户滚动触发翻页时重置；翻页失败 loadError 非空时停止）；
 * - 加载指示派生：showBottomLoader / showTopLoader / isLastPage。
 *
 * 常量/纯函数/类型在 scrollPaginationCore.ts（ADR-0033 拆分）。
 */
export function useScrollPagination({
  containerRef,
  itemContainerRef,
  itemsLength,
  pageSize,
  currentPage,
  totalPages,
  loading,
  enabled,
  shouldSkip,
  loadError,
  minLoadedPage,
  onPageChange,
}: UseScrollPaginationOptions): UseScrollPaginationReturn {
  // 数据实际渲染的页：加载中（keepPreviousData 占位）保持旧页，数据到位后 = currentPage
  const [displayedPage, setDisplayedPage] = useState(currentPage);
  const [measuredPage, setMeasuredPage] = useState(currentPage);

  // ref 化避免 effect 因回调/状态变化反复重跑
  const onPageChangeRef = useRef(onPageChange);
  onPageChangeRef.current = onPageChange;
  const shouldSkipRef = useRef(shouldSkip);
  shouldSkipRef.current = shouldSkip;
  const loadErrorRef = useRef(loadError);
  loadErrorRef.current = loadError;
  const minLoadedPageRef = useRef(minLoadedPage ?? 1);
  minLoadedPageRef.current = minLoadedPage ?? 1;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const stateRef = useRef<MeasureState>({
    itemsLength,
    pageSize,
    currentPage,
    totalPages,
    loading,
    displayedPage,
    minLoadedPage: minLoadedPage ?? 1,
  });
  stateRef.current = {
    itemsLength,
    pageSize,
    currentPage,
    totalPages,
    loading,
    displayedPage,
    minLoadedPage: minLoadedPage ?? 1,
  };

  const lastScrollTopRef = useRef(0);
  const lastScrollTimeRef = useRef(0);
  // 滚动速度（px/ms，瞬时值）：连续两次事件速度均达标才放大提前量——
  // 单次大跳（拖滚动条/PageDown）不视为快速滚动模式，避免误放大
  const velocityRef = useRef(0);
  // 链式预载连续自动加载计数（用户滚动触发翻页时重置）
  const chainCountRef = useRef(0);
  const prevLoadingRef = useRef(loading);
  const settleBlockedRef = useRef(false);
  // rAF 节流：滚动事件每帧多次触发，DOM 二分测量只与渲染帧对齐执行（每帧最多一次），
  // 避免每帧强制布局（getBoundingClientRect 二分 ×N）造成滚动掉帧
  const rafPendingRef = useRef<number | null>(null);

  // ── 方向自跟踪 + 挂起的滚动位置恢复 ──────────────────────────────
  const directionRef = useRef<'prev' | 'next' | 'jump' | 'top' | null>(null);
  const pendingRestoreRef = useRef<PendingRestore | null>(null);

  // 视口所在页测量（委托核心纯函数，稳定回调供 scroll handler 依赖）
  const measureVisiblePage = useCallback(
    (scrollTop: number): number => {
      const container = containerRef.current;
      const itemContainer = itemContainerRef?.current;
      if (!container) return stateRef.current.currentPage;
      return measureVisiblePageCore(
        container,
        itemContainer,
        stateRef.current,
        scrollTop
      );
    },
    [containerRef, itemContainerRef]
  );

  // 数据到位（itemsLength 变化）后短暂屏蔽边界触发；
  // 页码测量延迟到替换屏蔽窗结束（滚动恢复双 rAF 已完成）再执行：
  // prepend 前插后视口锚定 scrollTop = oldTop + heightDiff，若在锚定前测量
  // 会读到旧 scrollTop（顶部触发值），页码被错误算成第 1 页且不再刷新
  useLayoutEffect(() => {
    if (!enabled) return;
    const container = containerRef.current;
    if (!container) return;
    settleBlockedRef.current = true;
    const t = setTimeout(() => {
      settleBlockedRef.current = false;
      setMeasuredPage(measureVisiblePage(container.scrollTop));
    }, SETTLE_BLOCK_MS);
    return () => clearTimeout(t);
  }, [itemsLength, enabled, containerRef, measureVisiblePage]);

  // 指示器页：列表累计多页（append/prepend 模型）用 DOM 测量；
  // 单页（replace/jump，DOM 只有当前页，测量恒为 1 无意义）用 displayedPage
  const visiblePage = useMemo(() => {
    if (itemsLength > pageSize) return measuredPage;
    return displayedPage;
  }, [itemsLength, pageSize, measuredPage, displayedPage]);

  // ── 页脚跳页（页码/上一页/下一页按钮）：记录 jump 目标，数据到位后居中定位；
  // 同时重置链式预载计数（跳页属于用户显式操作） ──
  const jumpTo = useCallback((page: number) => {
    directionRef.current = 'jump';
    chainCountRef.current = 0;
    pendingRestoreRef.current = { direction: 'jump', page, beforeLoad: null };
  }, []);

  // 每页数量变化：清旧挂起，数据到位后回顶
  const prevPageSizeRef = useRef(pageSize);
  useEffect(() => {
    if (pageSize === prevPageSizeRef.current) return;
    prevPageSizeRef.current = pageSize;
    if (!enabled) return;
    directionRef.current = 'top';
    pendingRestoreRef.current = {
      direction: 'top',
      page: null,
      beforeLoad: null,
    };
  }, [pageSize, enabled]);

  // ── 滚动位置恢复：数据到位（loading 结束 / 页码或数据变化）后双 rAF 执行 ──
  useScrollRestore({
    containerRef,
    itemContainerRef,
    stateRef,
    pendingRestoreRef,
    loading,
    currentPage,
    itemsLength,
    pageSize,
  });

  // ── 自动填充：内容不足视口且还有下一页 → 自动加载直至填满/加载完 ──
  const checkAutoFill = useCallback(() => {
    const container = containerRef.current;
    const {
      currentPage: cp,
      totalPages: tp,
      loading: ld,
      itemsLength: len,
    } = stateRef.current;
    if (!container || ld || !enabledRef.current || cp >= tp || len === 0)
      return;
    if (container.scrollHeight <= container.clientHeight + 1) {
      onPageChangeRef.current?.(cp + 1, 'next');
    }
  }, [containerRef]);

  // ── 链式预载：数据到位（loading 结束 + 替换屏蔽窗过后）后，若滚动位置仍
  // 停留在触发边界内（用户未再滚动），自动续载下一页/上一页，避免
  // 「滚到底 → 等加载 → 必须再滚一次」的体验断裂；
  // 连续自动加载有上限（MAX_CHAIN_PAGES）防慢网下无限拉取；
  // 翻页失败（loadError 非空）时停止——数据未追加，继续链式会静默跳过失败页
  const chainLoad = useCallback(() => {
    const container = containerRef.current;
    const {
      currentPage: cp,
      totalPages: tp,
      loading: ld,
      itemsLength: len,
    } = stateRef.current;
    if (
      !container ||
      ld ||
      !enabledRef.current ||
      len === 0 ||
      settleBlockedRef.current ||
      loadErrorRef.current
    ) {
      return;
    }
    if (chainCountRef.current >= MAX_CHAIN_PAGES) return;

    const scrollTop = container.scrollTop;
    const scrollHeight = container.scrollHeight;
    const clientHeight = container.clientHeight;
    const triggerEdge = computeTriggerEdge(clientHeight);

    if (scrollTop + clientHeight >= scrollHeight - triggerEdge) {
      if (cp < tp) {
        chainCountRef.current += 1;
        directionRef.current = 'next';
        onPageChangeRef.current?.(cp + 1, 'next');
      }
    } else if (scrollTop <= triggerEdge) {
      // 同 handleScroll：prev 目标页 = minLoadedPage - 1（防重复加载已存在页）
      const targetPage = minLoadedPageRef.current - 1;
      if (targetPage >= 1) {
        chainCountRef.current += 1;
        directionRef.current = 'prev';
        pendingRestoreRef.current = {
          direction: 'prev',
          page: null,
          beforeLoad: { scrollTop, scrollHeight },
        };
        onPageChangeRef.current?.(targetPage, 'prev');
      }
    }
  }, [containerRef]);

  // 翻页加载结束后：延迟到替换屏蔽窗结束再检查链式续载
  useEffect(() => {
    const wasLoading = prevLoadingRef.current;
    prevLoadingRef.current = loading;
    if (!enabled || !wasLoading || loading) return;
    const t = setTimeout(() => {
      chainLoad();
    }, SETTLE_BLOCK_MS + 16);
    return () => clearTimeout(t);
  }, [loading, enabled, chainLoad]);

  // 挂载后 + 数据变化后检查（追加仍不足视口则继续加载，填满后自动停止）。
  // rAF 延迟一帧：等布局稳定（scrollHeight/clientHeight 有效）再检查，
  // 避免挂载瞬间读到未布局的几何误触发
  useEffect(() => {
    if (!enabled) return;
    const raf = requestAnimationFrame(() => checkAutoFill());
    return () => cancelAnimationFrame(raf);
  }, [itemsLength, enabled, checkAutoFill]);

  // 视口尺寸变化（窗口缩放/侧边栏展开）后检查
  useEffect(() => {
    if (!enabled) return;
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => checkAutoFill());
    observer.observe(container);
    return () => observer.disconnect();
  }, [enabled, containerRef, checkAutoFill]);

  useEffect(() => {
    if (!enabled) return;
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      if (shouldSkipRef.current?.()) return;

      const {
        pageSize: ps,
        currentPage: cp,
        totalPages: tp,
        loading: ld,
        itemsLength: len,
      } = stateRef.current;
      const scrollTop = container.scrollTop;
      const scrollHeight = container.scrollHeight;
      const clientHeight = container.clientHeight;

      // 1) 指示器：视口顶部所在页实时同步——rAF 节流（每帧最多一次 DOM 测量，
      //    与渲染帧对齐，避免滚动事件高频强制布局导致掉帧；加载中也更新）
      if (rafPendingRef.current === null) {
        rafPendingRef.current = requestAnimationFrame(() => {
          rafPendingRef.current = null;
          setMeasuredPage(measureVisiblePage(container.scrollTop));
        });
      }

      // 2) 边界触发（预加载：距底/顶 max(300, clientHeight×0.6) 内提前触发；
      //    连续快速滚动时按速度扩大提前量至多 2 倍，保证快速滚到底数据已就位；
      //    跳过 programmatic scroll / 内容替换窗口；加载中整体阻塞）
      if (ld) return;
      if (settleBlockedRef.current) return;
      if (scrollTop === lastScrollTopRef.current) return;

      // 速度因子：单次大跳（拖滚动条/PageDown）不放大——要求上一事件与本次事件
      // 速度均达标（连续快速滚动）才按本次速度放大提前量
      const now = performance.now();
      const dt = now - lastScrollTimeRef.current;
      const distance = Math.abs(scrollTop - lastScrollTopRef.current);
      lastScrollTimeRef.current = now;
      const instVelocity = dt > 0 ? distance / dt : 0;
      const velocityFactor = computeVelocityFactor(
        velocityRef.current,
        instVelocity
      );
      velocityRef.current = instVelocity;

      const direction = scrollTop > lastScrollTopRef.current ? 'next' : 'prev';
      lastScrollTopRef.current = scrollTop;

      const cb = onPageChangeRef.current;
      if (!cb) return;

      const triggerEdge = computeTriggerEdge(clientHeight, velocityFactor);

      if (
        direction === 'next' &&
        scrollTop + clientHeight >= scrollHeight - triggerEdge
      ) {
        if (cp < tp) {
          // next 追加无需滚动恢复（内容在底部增长，视口自然锚定），仅记录方向
          directionRef.current = 'next';
          chainCountRef.current = 0; // 用户滚动触发：重置链式预载计数
          cb(cp + 1, 'next');
        }
      } else if (direction === 'prev' && scrollTop <= triggerEdge) {
        // prev 目标页 = minLoadedPage - 1（累计模型下 cp-1 可能已在列表中，
        // 应加载的是「列表第一页之前」的页；jump 到深层页后逐页前插同理）；
        // minLoadedPage=1（列表已覆盖第 1 页）或列表为空时不触发
        const targetPage = minLoadedPageRef.current - 1;
        if (len > 0 && targetPage >= 1) {
          directionRef.current = 'prev';
          chainCountRef.current = 0;
          pendingRestoreRef.current = {
            direction: 'prev',
            page: null,
            beforeLoad: { scrollTop, scrollHeight },
          };
          cb(targetPage, 'prev');
        }
      }
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      container.removeEventListener('scroll', handleScroll);
      if (rafPendingRef.current !== null) {
        cancelAnimationFrame(rafPendingRef.current);
        rafPendingRef.current = null;
      }
    };
  }, [enabled, containerRef, measureVisiblePage]);

  // 数据到位后记录实际渲染的页。
  // 延迟到替换屏蔽窗结束（SETTLE_BLOCK_MS）再更新：滚动触发翻页时 currentPage 立即前跳，
  // 而 react-query 的 isFetching 经 useSyncExternalStore 可能延迟一帧才变 true——若立即更新
  // 会让页码抢先于数据（内容还是旧页）造成页码跳变（「页码快速滚动」）；延迟窗口内 loading
  // 变为 true 时 cleanup 取消本次更新，只有数据真正到位（loading 稳定 false）才更新
  useEffect(() => {
    if (loading) return;
    const t = setTimeout(() => {
      setDisplayedPage(currentPage);
    }, SETTLE_BLOCK_MS);
    return () => clearTimeout(t);
  }, [loading, currentPage]);

  // ── 加载指示派生 ──
  const showBottomLoader = loading && itemsLength > 0;
  const showTopLoader =
    loading && itemsLength > 0 && directionRef.current === 'prev';
  // totalPages > 0：初始 0/未同步时不算「已到最后一页」，避免首屏误报「已经是最后一页」
  const isLastPage =
    itemsLength > 0 && !loading && totalPages > 0 && currentPage >= totalPages;

  return {
    visiblePage,
    jumpTo,
    showBottomLoader,
    showTopLoader,
    isLastPage,
  };
}
