import { useState } from 'react';
import { useSearch } from '../../../hooks/useSearch';

interface UseUserSearchReturn {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  debouncedSearchTerm: string;
  isSearching: boolean;
  roleFilter: string;
  setRoleFilter: (roleId: string) => void;
  sortBy: string;
  setSortBy: (field: string) => void;
  sortOrder: 'asc' | 'desc';
  setSortOrder: (order: 'asc' | 'desc') => void;
  currentPage: number;
  setCurrentPage: (page: number) => void;
  pageSize: number;
  userTab: 'active' | 'deleted';
  setUserTab: (tab: 'active' | 'deleted') => void;
}

export function useUserSearch(): UseUserSearchReturn {
  const {
    searchQuery,
    setSearchQuery,
    debouncedSearchTerm,
    isSearching,
  } = useSearch({
    debounceDelay: 300,
    enableRemoteSearch: false,
    initialLimit: 20,
  });

  const [roleFilter, setRoleFilter] = useState('');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(20);
  const [userTab, setUserTab] = useState<'active' | 'deleted'>('active');

  return {
    searchQuery,
    setSearchQuery,
    debouncedSearchTerm,
    isSearching,
    roleFilter,
    setRoleFilter,
    sortBy,
    setSortBy,
    sortOrder,
    setSortOrder,
    currentPage,
    setCurrentPage,
    pageSize,
    userTab,
    setUserTab,
  };
}
