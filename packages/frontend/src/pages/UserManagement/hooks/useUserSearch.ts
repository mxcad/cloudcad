import { useState } from 'react';
import { useSearch } from '../../../hooks/useSearch';

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
  userTab: 'active' | 'deleted';
  setUserTab: (tab: 'active' | 'deleted') => void;
}

export function useUserSearch(): UseUserSearchReturn {
  const { searchQuery, setSearchQuery, debouncedSearchTerm, isSearching } =
    useSearch({
      debounceDelay: 300,
      enableRemoteSearch: false,
      initialLimit: 30,
    });

  const [roleFilter, setRoleFilter] = useState('');
  const [tierFilter, setTierFilter] = useState('');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(30);
  const [userTab, setUserTab] = useState<'active' | 'deleted'>('active');

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
