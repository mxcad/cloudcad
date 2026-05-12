///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { useState, useEffect, useRef, useCallback } from 'react';

export interface UseSearchPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface UseSearchOptions {
  /** 防抖延迟（毫秒） */
  debounceDelay?: number;
  /** 搜索回调 */
  onSearch?: (searchTerm: string) => void | Promise<void>;
  /** 是否启用远程搜索 */
  enableRemoteSearch?: boolean;
  /** 初始页码 */
  initialPage?: number;
  /** 初始每页数量 */
  initialLimit?: number;
}

export interface UseSearchReturn {
  /** 搜索关键词（本地状态） */
  searchQuery: string;
  /** 设置搜索关键词 */
  setSearchQuery: (query: string) => void;
  /** 防抖后的搜索关键词（用于远程搜索） */
  debouncedSearchTerm: string;
  /** 清除搜索 */
  clearSearch: () => void;
  /** 是否正在搜索 */
  isSearching: boolean;
  /** 分页状态 */
  pagination: UseSearchPagination;
  /** 设置页码（从 1 开始） */
  setPage: (page: number) => void;
  /** 设置每页数量 */
  setLimit: (limit: number) => void;
  /** 设置总数（通常由 API 响应设置） */
  setTotal: (total: number) => void;
}

/**
 * 通用搜索 Hook
 *
 * 管理搜索关键词、防抖、分页状态。可作为文件搜索、用户搜索等
 * 业务 hook 的基类。
 *
 * @param options 配置选项
 * @returns 搜索状态和方法
 */
export const useSearch = (
  options: UseSearchOptions = {}
): UseSearchReturn => {
  const {
    debounceDelay = 300,
    onSearch,
    enableRemoteSearch = false,
    initialPage = 1,
    initialLimit = 50,
  } = options;

  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [pagination, setPagination] = useState<UseSearchPagination>({
    page: initialPage,
    limit: initialLimit,
    total: 0,
    totalPages: 0,
  });

  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isInitialMountRef = useRef(true);

  /**
   * 清除搜索
   */
  const clearSearch = useCallback(() => {
    setSearchQuery('');
    setDebouncedSearchTerm('');
    setPagination((prev) => ({ ...prev, page: 1 }));
  }, []);

  /**
   * 设置搜索关键词（带防抖）
   */
  const handleSetSearchQuery = useCallback((query: string) => {
    setSearchQuery(query);
    setIsSearching(true);
    setPagination((prev) => ({ ...prev, page: 1 }));
  }, []);

  /**
   * 设置页码
   */
  const setPage = useCallback((page: number) => {
    setPagination((prev) => ({ ...prev, page }));
  }, []);

  /**
   * 设置每页数量（同时重置到第一页）
   */
  const setLimit = useCallback((limit: number) => {
    setPagination((prev) => ({ ...prev, limit, page: 1 }));
  }, []);

  /**
   * 设置总数（通常由 API 响应设置）
   */
  const setTotal = useCallback((total: number) => {
    setPagination((prev) => ({
      ...prev,
      total,
      totalPages: Math.ceil(total / prev.limit),
    }));
  }, []);

  /**
   * 防抖处理
   */
  useEffect(() => {
    // 跳过首次渲染
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      return;
    }

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(() => {
      if (debouncedSearchTerm !== searchQuery) {
        setDebouncedSearchTerm(searchQuery);
        setIsSearching(false);

        if (enableRemoteSearch && onSearch) {
          void onSearch(searchQuery);
        }
      }
    }, debounceDelay);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery, debounceDelay, enableRemoteSearch, onSearch, debouncedSearchTerm]);

  /**
   * 清理定时器
   */
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  return {
    searchQuery,
    setSearchQuery: handleSetSearchQuery,
    debouncedSearchTerm,
    clearSearch,
    isSearching,
    pagination,
    setPage,
    setLimit,
    setTotal,
  };
};

export default useSearch;
