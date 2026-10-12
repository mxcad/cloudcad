import { useState, useCallback, useRef, useEffect } from 'react';
import { useFileSystemStore } from '../../stores/fileSystemStore';
import { useDebouncedValue } from '../useDebouncedValue';
import type { SearchFilterValues } from '../../components/search/SearchFilters';

interface UseFileSystemSearchProps {
  loadData: () => void;
}

export const useFileSystemSearch = ({ loadData }: UseFileSystemSearchProps) => {
  // 搜索防抖走 useDebouncedValue 唯一出口（原 useSearch 假 seam 已删）
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearchTerm = useDebouncedValue(searchQuery, 300);
  const isSearching = debouncedSearchTerm !== searchQuery;

  const { pageSize: storePageSize, setPageSize: setStorePageSize } =
    useFileSystemStore();
  const [pagination, setPagination] = useState({
    page: 1,
    limit: storePageSize,
  });
  const paginationRef = useRef(pagination);
  const shouldLoadDataRef = useRef(false);

  const [searchFilters, setSearchFilters] = useState<SearchFilterValues>({});

  useEffect(() => {
    if (storePageSize !== paginationRef.current.limit) {
      paginationRef.current = {
        ...paginationRef.current,
        limit: storePageSize,
      };
      setPagination((prev) => ({ ...prev, limit: storePageSize }));
    }
  }, [storePageSize]);

  const syncPaginationRef = useCallback(() => {
    paginationRef.current = pagination;
  }, [pagination]);

  // 「任一筛选变化回页 1」单一出口（原 3 处内联副本）
  const resetToFirstPage = useCallback(() => {
    setPagination((prev) => ({ ...prev, page: 1 }));
  }, []);

  const handleSearchChange = useCallback(
    (query: string) => {
      setSearchQuery(query);
      resetToFirstPage();
    },
    [setSearchQuery, resetToFirstPage]
  );

  const handleSearchSubmit = useCallback(() => {
    loadData();
  }, [loadData]);

  const handlePageChange = useCallback((newPage: number) => {
    if (newPage === paginationRef.current.page) return;
    paginationRef.current = { ...paginationRef.current, page: newPage };
    shouldLoadDataRef.current = true;
    setPagination(paginationRef.current);
  }, []);

  const handlePageSizeChange = useCallback(
    (newPageSize: number) => {
      paginationRef.current = { page: 1, limit: newPageSize };
      shouldLoadDataRef.current = true;
      setStorePageSize(newPageSize);
      setPagination({ page: 1, limit: newPageSize });
    },
    [setStorePageSize]
  );

  const checkShouldLoadData = useCallback(() => {
    const shouldLoad = shouldLoadDataRef.current;
    shouldLoadDataRef.current = false;
    return shouldLoad;
  }, []);

  const handleFiltersChange = useCallback(
    (filters: SearchFilterValues) => {
      setSearchFilters(filters);
      resetToFirstPage();
    },
    [resetToFirstPage]
  );

  const handleSearchQueryChange = useCallback(
    (query: string) => {
      setSearchQuery(query);
      resetToFirstPage();
    },
    [setSearchQuery, resetToFirstPage]
  );

  return {
    searchQuery,
    debouncedSearchTerm,
    isSearching,
    setSearchQuery: handleSearchChange,
    handleSearchSubmit,
    pagination,
    setPagination,
    handlePageChange,
    handlePageSizeChange,
    paginationRef,
    syncPaginationRef,
    checkShouldLoadData,
    searchFilters,
    handleFiltersChange,
    handleSearchQueryChange,
  };
};
