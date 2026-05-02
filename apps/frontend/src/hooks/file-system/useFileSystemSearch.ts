///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { useState, useCallback, useRef, useEffect } from 'react';
import { useFileSystemStore } from '../../stores/fileSystemStore';

interface UseFileSystemSearchProps {
  loadData: () => void;
}

export const useFileSystemSearch = ({ loadData }: UseFileSystemSearchProps) => {
  const [searchQuery, setSearchQuery] = useState('');
  const { pageSize: storePageSize, setPageSize: setStorePageSize } = useFileSystemStore();
  const [pagination, setPagination] = useState({ page: 1, limit: storePageSize });
  const paginationRef = useRef(pagination);
  const shouldLoadDataRef = useRef(false);

  // 同步 store 中的 pageSize 到 pagination
  useEffect(() => {
    if (storePageSize !== paginationRef.current.limit) {
      paginationRef.current = { ...paginationRef.current, limit: storePageSize };
      setPagination((prev) => ({ ...prev, limit: storePageSize }));
    }
  }, [storePageSize]);

  const syncPaginationRef = useCallback(() => {
    paginationRef.current = pagination;
  }, [pagination]);

  const handleSearchChange = useCallback((query: string) => {
    setSearchQuery(query);
    setPagination((prev) => ({ ...prev, page: 1 }));
  }, []);

  const handleSearchSubmit = useCallback(() => {
    loadData();
  }, [loadData]);

  const handlePageChange = useCallback((newPage: number) => {
    paginationRef.current = { ...paginationRef.current, page: newPage };
    shouldLoadDataRef.current = true;
    setPagination(paginationRef.current);
  }, []);

  const handlePageSizeChange = useCallback((newPageSize: number) => {
    paginationRef.current = { page: 1, limit: newPageSize };
    shouldLoadDataRef.current = true;
    // 更新 store 以持久化 pageSize
    setStorePageSize(newPageSize);
    // 立即更新 pagination 状态，确保 useEffect 能捕获到变化
    setPagination({ page: 1, limit: newPageSize });
  }, [setStorePageSize]);

  const checkShouldLoadData = useCallback(() => {
    const shouldLoad = shouldLoadDataRef.current;
    shouldLoadDataRef.current = false;
    return shouldLoad;
  }, []);

  return {
    searchQuery,
    setSearchQuery: handleSearchChange,
    handleSearchSubmit,
    pagination,
    setPagination,
    handlePageChange,
    handlePageSizeChange,
    paginationRef,
    syncPaginationRef,
    checkShouldLoadData,
  };
};
