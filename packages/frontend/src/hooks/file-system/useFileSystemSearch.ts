///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement
// 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
// This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { useState, useCallback, useRef } from 'react';

interface UseFileSystemSearchProps {
  loadData: () => void;
}

export const useFileSystemSearch = ({ loadData }: UseFileSystemSearchProps) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [pagination, setPagination] = useState({ page: 1, limit: 20 });
  const paginationRef = useRef(pagination);
  const shouldLoadDataRef = useRef(false);

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
    setPagination(paginationRef.current);
  }, []);

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
