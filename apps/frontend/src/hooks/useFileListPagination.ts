///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { useState, useCallback, useRef, useEffect } from 'react';

interface PaginationState {
  /** 当前页码 */
  currentPage: number;
  /** 总页数 */
  totalPages: number;
  /** 是否有更多数据 */
  hasMore: boolean;
  /** 总数据量 */
  total: number;
  /** 加载状态 */
  loading: boolean;
}

export interface UseFileListPaginationOptions {
  /** 每页显示数量 */
  pageSize?: number;
  /** 初始页码 */
  initialPage?: number;
  /** 是否启用滚动加载更多 */
  enableLoadMore?: boolean;
  /** 加载更多触发阈值（像素） */
  loadMoreThreshold?: number;
}

export interface UseFileListPaginationReturn extends PaginationState {
  /** 设置当前页码 */
  setCurrentPage: (page: number) => void;
  /** 设置总页数 */
  setTotalPages: (pages: number) => void;
  /** 设置是否有更多数据 */
  setHasMore: (hasMore: boolean) => void;
  /** 设置总数据量 */
  setTotal: (total: number) => void;
  /** 设置加载状态 */
  setLoading: (loading: boolean) => void;
  /** 上一页 */
  handlePreviousPage: () => void;
  /** 下一页 */
  handleNextPage: () => void;
  /** 滚动加载更多 */
  handleLoadMore: () => void;
  /** 重置分页状态 */
  reset: () => void;
  /** 刷新当前页 */
  refresh: () => void;
  /** 内容区域 ref（用于滚动加载更多） */
  contentRef: React.RefObject<HTMLDivElement | null>;
  /** 加载更多 ref */
  loadMoreRef: React.RefObject<HTMLDivElement | null>;
}

/**
 * 文件列表分页 Hook
 *
 * 用于管理文件列表的分页状态，支持上一页/下一页/滚动加载更多
 *
 * @param options 配置选项
 * @returns 分页状态和方法
 */
export const useFileListPagination = (
  options: UseFileListPaginationOptions = {}
): UseFileListPaginationReturn => {
  const {
    pageSize = 20,
    initialPage = 1,
    enableLoadMore = true,
    loadMoreThreshold = 100,
  } = options;

  const [currentPage, setCurrentPageState] = useState(initialPage);
  const [totalPages, setTotalPages] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const contentRef = useRef<HTMLDivElement | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  /**
   * 设置当前页码
   */
  const setCurrentPage = useCallback((page: number) => {
    setCurrentPageState(Math.max(1, Math.min(page, totalPages)));
  }, [totalPages]);

  /**
   * 上一页
   */
  const handlePreviousPage = useCallback(() => {
    if (currentPage > 1) {
      setCurrentPageState(currentPage - 1);
    }
  }, [currentPage]);

  /**
   * 下一页
   */
  const handleNextPage = useCallback(() => {
    if (currentPage < totalPages) {
      setCurrentPageState(currentPage + 1);
    }
  }, [currentPage, totalPages]);

  /**
   * 滚动加载更多
   */
  const handleLoadMore = useCallback(() => {
    if (hasMore && !loading) {
      setCurrentPageState((prev) => prev + 1);
    }
  }, [hasMore, loading]);

  /**
   * 重置分页状态
   */
  const reset = useCallback(() => {
    setCurrentPageState(initialPage);
    setTotalPages(1);
    setHasMore(false);
    setTotal(0);
  }, [initialPage]);

  /**
   * 刷新当前页
   */
  const refresh = useCallback(() => {
    setCurrentPageState(initialPage);
  }, [initialPage]);

  /**
   * 监听滚动加载更多
   */
  useEffect(() => {
    if (!enableLoadMore || !contentRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting && hasMore && !loading) {
          handleLoadMore();
        }
      },
      {
        root: contentRef.current,
        rootMargin: `0px 0px ${loadMoreThreshold}px 0px`,
        threshold: 0,
      }
    );

    const loadMoreElement = loadMoreRef.current;
    if (loadMoreElement) {
      observer.observe(loadMoreElement);
    }

    return () => {
      if (loadMoreElement) {
        observer.unobserve(loadMoreElement);
      }
    };
  }, [hasMore, loading, enableLoadMore, loadMoreThreshold, handleLoadMore]);

  return {
    currentPage,
    totalPages,
    hasMore,
    total,
    loading,
    setCurrentPage,
    setTotalPages,
    setHasMore,
    setTotal,
    setLoading,
    handlePreviousPage,
    handleNextPage,
    handleLoadMore,
    reset,
    refresh,
    contentRef,
    loadMoreRef,
  };
};

export default useFileListPagination;
