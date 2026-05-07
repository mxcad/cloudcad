///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { useState, useCallback, useEffect } from 'react';
import { useFileSystemStore } from '../../stores/fileSystemStore';

interface UseLibraryPaginationOptions {
  /** 初始页码 */
  initialPage?: number;
}

interface UseLibraryPaginationReturn {
  currentPage: number;
  pageSize: number;
  totalPages: number;
  total: number;
  setCurrentPage: (page: number) => void;
  setPageSize: (size: number) => void;
  setTotalPages: (pages: number) => void;
  setTotal: (total: number) => void;
  handlePageChange: (page: number) => void;
  handleTotalPagesChange: (pages: number) => void;
  handleTotalChange: (total: number) => void;
}

/**
 * 资源库分页状态 Hook
 *
 * 管理分页状态（页码、每页数量、总页数、总数），
 * 并将 pageSize 同步到 fileSystemStore 实现持久化。
 */
export function useLibraryPagination(
  options: UseLibraryPaginationOptions = {}
): UseLibraryPaginationReturn {
  const { initialPage = 1 } = options;

  const { pageSize: storePageSize, setPageSize: setStorePageSize } =
    useFileSystemStore();

  const [currentPage, setCurrentPage] = useState(initialPage);
  const [pageSize, setPageSizeState] = useState(storePageSize);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // 同步 pageSize 到 store
  useEffect(() => {
    if (pageSize !== storePageSize) {
      setStorePageSize(pageSize);
    }
  }, [pageSize, storePageSize, setStorePageSize]);

  // setPageSize 时重置到第一页
  const setPageSize = useCallback(
    (size: number) => {
      setPageSizeState(size);
      setCurrentPage(1);
    },
    []
  );

  // 回调函数使用 useCallback 包裹，避免无限重渲染
  const handlePageChange = useCallback((page: number) => {
    setCurrentPage(page);
  }, []);

  const handleTotalPagesChange = useCallback((pages: number) => {
    setTotalPages(pages);
  }, []);

  const handleTotalChange = useCallback((total: number) => {
    setTotal(total);
  }, []);

  return {
    currentPage,
    pageSize,
    totalPages,
    total,
    setCurrentPage,
    setPageSize,
    setTotalPages,
    setTotal,
    handlePageChange,
    handleTotalPagesChange,
    handleTotalChange,
  };
}
