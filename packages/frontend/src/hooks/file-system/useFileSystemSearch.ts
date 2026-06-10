import { useState, useCallback, useRef, useEffect } from 'react';
import { useFileSystemStore } from '../../stores/fileSystemStore';
import { useSearch } from '../useSearch';
import type { SearchFilterValues } from '../../components/search/SearchFilters';

interface UseFileSystemSearchProps {
  loadData: () => void;
}

export const useFileSystemSearch = ({ loadData }: UseFileSystemSearchProps) => {
  const {
    searchQuery,
    setSearchQuery,
    debouncedSearchTerm,
    isSearching,
  } = useSearch({
    debounceDelay: 300,
    enableRemoteSearch: false,
  });

  const { pageSize: storePageSize, setPageSize: setStorePageSize } = useFileSystemStore();
  const [pagination, setPagination] = useState({ page: 1, limit: storePageSize });
  const paginationRef = useRef(pagination);
  const shouldLoadDataRef = useRef(false);

  // Search filter state
  const [searchFilters, setSearchFilters] = useState<SearchFilterValues>({});

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
  }, [setSearchQuery]);

  const handleSearchSubmit = useCallback(() => {
    loadData();
  }, [loadData]);

  const handlePageChange = useCallback((newPage: number) => {
    if (newPage === paginationRef.current.page) return;
    paginationRef.current = { ...paginationRef.current, page: newPage };
    shouldLoadDataRef.current = true;
    setPagination(paginationRef.current);
  }, []);

  const handlePageSizeChange = useCallback((newPageSize: number) => {
    paginationRef.current = { page: 1, limit: newPageSize };
    shouldLoadDataRef.current = true;
    setStorePageSize(newPageSize);
    setPagination({ page: 1, limit: newPageSize });
  }, [setStorePageSize]);

  const checkShouldLoadData = useCallback(() => {
    const shouldLoad = shouldLoadDataRef.current;
    shouldLoadDataRef.current = false;
    return shouldLoad;
  }, []);

  const handleFiltersChange = useCallback((filters: SearchFilterValues) => {
    const cleaned: SearchFilterValues = {};
    if (filters.extension) cleaned.extension = filters.extension;
    if (filters.timeRange) cleaned.timeRange = filters.timeRange;
    if (filters.sortBy) cleaned.sortBy = filters.sortBy;
    if (filters.sortOrder) cleaned.sortOrder = filters.sortOrder;
    setSearchFilters(cleaned);
    setPagination((prev) => ({ ...prev, page: 1 }));
  }, []);

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
  };
};
