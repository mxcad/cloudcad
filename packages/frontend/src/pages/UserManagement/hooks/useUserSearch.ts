import { useState } from 'react';
import { useDebouncedValue } from '../../../hooks/useDebouncedValue';

interface UseUserSearchReturn {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  debouncedSearchTerm: string;
  isSearching: boolean;
  roleFilter: string;
  setRoleFilter: (roleId: string) => void;
  tierFilter: string;
  setTierFilter: (tier: string) => void;
  sortBy: string;
  setSortBy: (field: string) => void;
  sortOrder: 'asc' | 'desc';
  setSortOrder: (order: 'asc' | 'desc') => void;
  currentPage: number;
  setCurrentPage: (page: number) => void;
  pageSize: number;
  setPageSize: (size: number) => void;
  userTab: 'active' | 'deleted' | 'stats';
  setUserTab: (tab: 'active' | 'deleted' | 'stats') => void;
}

export function useUserSearch(): UseUserSearchReturn {
  // 搜索防抖走 useDebouncedValue 唯一出口（原 useSearch 假 seam 已删；
  // 分页由本 hook 自有 currentPage/pageSize 管理，与 useSearch 的 pagination 无关）
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearchTerm = useDebouncedValue(searchQuery, 300);
  const isSearching = debouncedSearchTerm !== searchQuery;

  const [roleFilter, setRoleFilter] = useState('');
  const [tierFilter, setTierFilter] = useState('');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(30);
  const [userTab, setUserTab] = useState<'active' | 'deleted' | 'stats'>(
    'active'
  );

  return {
    searchQuery,
    setSearchQuery,
    debouncedSearchTerm,
    isSearching,
    roleFilter,
    setRoleFilter,
    tierFilter,
    setTierFilter,
    sortBy,
    setSortBy,
    sortOrder,
    setSortOrder,
    currentPage,
    setCurrentPage,
    pageSize,
    setPageSize,
    userTab,
    setUserTab,
  };
}
