///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { useState, useEffect, useRef, useCallback } from 'react';

export interface UseFileListSearchOptions {
  /** 防抖延迟（毫秒） */
  debounceDelay?: number;
  /** 搜索回调 */
  onSearch?: (searchTerm: string) => void | Promise<void>;
  /** 是否启用远程搜索 */
  enableRemoteSearch?: boolean;
}

export interface UseFileListSearchReturn {
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
}

/**
 * 文件列表搜索 Hook
 *
 * 用于管理文件列表的搜索状态，支持防抖和远程搜索
 *
 * @param options 配置选项
 * @returns 搜索状态和方法
 */
export const useFileListSearch = (
  options: UseFileListSearchOptions = {}
): UseFileListSearchReturn => {
  const {
    debounceDelay = 300,
    onSearch,
    enableRemoteSearch = false,
  } = options;

  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isInitialMountRef = useRef(true);

  /**
   * 清除搜索
   */
  const clearSearch = useCallback(() => {
    setSearchQuery('');
    setDebouncedSearchTerm('');
  }, []);

  /**
   * 设置搜索关键词（带防抖）
   */
  const handleSetSearchQuery = useCallback((query: string) => {
    setSearchQuery(query);
    setIsSearching(true);
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
          onSearch(searchQuery);
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
  };
};

export default useFileListSearch;
