///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
///////////////////////////////////////////////////////////////////////////////

import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { LOADING_TIMEOUT } from '@/constants/timeouts';
import { useScrollPagination } from '@/hooks/common/useScrollPagination';

export type PageChangeCallback = (
  page: number,
  direction: 'prev' | 'next' | 'jump'
) => void;

interface UseResourceListScrollOptions {
  loading: boolean;
  itemsLength: number;
  paginationEnabled: boolean;
  totalPages?: number;
  currentPage?: number;
  pageSize?: number;
  /** 翻页/后台刷新失败信息（非空时链式预载停止，避免静默跳过失败页） */
  loadError?: string | null;
  /** 列表第一项所属页码（累计模型下由数据层维护；prev 触发防重复加载已存在页） */
  minLoadedPage?: number;
  onPageChange?: PageChangeCallback;
  /** 列表项容器 ref（useScrollPagination 用于测量视口所在页） */
  itemContainerRef?: RefObject<HTMLElement | null>;
}

interface UseResourceListScrollReturn {
  contentRef: React.RefObject<HTMLDivElement | null>;
  /** 首次加载超时（items 为空 + loading 超过 LOADING_TIMEOUT → 静默 fallback 到空状态） */
  loadingTimedOut: boolean;
  /** 视口顶部所在页码（页脚指示器展示用，见 useScrollPagination） */
  visiblePage: number;
  /** 页脚跳页通知（数据到位后滚动条居中定位） */
  jumpTo: (page: number) => void;
  /** 底部加载指示（滚动加载/自动填充进行中） */
  showBottomLoader: boolean;
  /** 顶部加载指示（向上滚动加载进行中） */
  showTopLoader: boolean;
  /** 已加载到最后一页 */
  isLastPage: boolean;
}

/**
 * ResourceList 滚动与分页逻辑
 *
 * 管理：加载超时检测、滚动触发翻页与滚动位置恢复（委托 useScrollPagination
 * 统一控制器——与 FileListGrid 行为一致：预加载/前插锚定/跳页居中/自动填充/加载指示）。
 * 通过 ref 稳定回调引用，避免 effect 因回调重建而反复重跑。
 */
export function useResourceListScroll({
  loading,
  itemsLength,
  paginationEnabled,
  totalPages,
  currentPage,
  pageSize = 30,
  loadError,
  minLoadedPage,
  onPageChange,
  itemContainerRef,
}: UseResourceListScrollOptions): UseResourceListScrollReturn {
  const contentRef = useRef<HTMLDivElement>(null);
  // 用 ref 稳定回调引用，避免 useEffect 因回调重建而反复重跑
  const onPageChangeRef = useRef(onPageChange);
  onPageChangeRef.current = onPageChange;

  // 滚动触发翻页 + 页脚指示器 + 滚动位置恢复 + 自动填充（统一控制器）
  const { visiblePage, jumpTo, showBottomLoader, showTopLoader, isLastPage } =
    useScrollPagination({
      containerRef: contentRef,
      itemContainerRef: itemContainerRef ?? null,
      itemsLength,
      pageSize,
      currentPage: currentPage ?? 1,
      // 初始 0：totalPages 未同步（侧边栏 loader 初始 0）时不算「已经是最后一页」（ADR-0050 Guidance）
      totalPages: totalPages ?? 0,
      loading: loading ?? false,
      enabled: paginationEnabled,
      loadError,
      minLoadedPage,
      onPageChange: (page, direction) =>
        onPageChangeRef.current?.(page, direction),
    });

  // 加载超时计时器
  const loadingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [loadingTimedOut, setLoadingTimedOut] = useState(false);
  const itemsLengthRef = useRef(itemsLength);
  itemsLengthRef.current = itemsLength;

  // 首次加载超时检测（items 为空 + loading 超过 10 秒 → 静默 fallback 到空状态）
  useEffect(() => {
    if (!loading || itemsLengthRef.current > 0) {
      // 加载结束或有数据，清除计时器
      if (loadingTimerRef.current) {
        clearTimeout(loadingTimerRef.current);
        loadingTimerRef.current = null;
      }
      setLoadingTimedOut(false);
      return;
    }

    // loading 为 true 且 items 为空，启动超时计时器
    loadingTimerRef.current = setTimeout(() => {
      setLoadingTimedOut(true);
    }, LOADING_TIMEOUT);

    return () => {
      if (loadingTimerRef.current) {
        clearTimeout(loadingTimerRef.current);
        loadingTimerRef.current = null;
      }
    };
  }, [loading]);

  // 传统滚动加载（IntersectionObserver 非分页模式）已删除：
  // 全仓无消费者传 onLoadMore/hasMore，滚动加载统一走 useScrollPagination（ADR-0050/0052）

  return {
    contentRef,
    loadingTimedOut,
    visiblePage,
    jumpTo,
    showBottomLoader,
    showTopLoader,
    isLastPage,
  };
}
