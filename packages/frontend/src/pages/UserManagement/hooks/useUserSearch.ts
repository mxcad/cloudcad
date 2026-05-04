import { useState } from 'react';

interface UseUserSearchReturn {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  roleFilter: string;
  setRoleFilter: (roleId: string) => void;
  sortBy: string;
  setSortBy: (field: string) => void;
  sortOrder: 'asc' | 'desc';
  setSortOrder: (order: 'asc' | 'desc') => void;
  currentPage: number;
  setCurrentPage: (page: number) => void;
  pageSize: number;
  totalUsers: number;
  userTab: 'active' | 'deleted';
  setUserTab: (tab: 'active' | 'deleted') => void;
}

export function useUserSearch(): UseUserSearchReturn {
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(20);
  const [totalUsers, setTotalUsers] = useState(0);
  const [userTab, setUserTab] = useState<'active' | 'deleted'>('active');

  return {
    searchQuery,
    setSearchQuery,
    roleFilter,
    setRoleFilter,
    sortBy,
    setSortBy,
    sortOrder,
    setSortOrder,
    currentPage,
    setCurrentPage,
    pageSize,
    totalUsers,
    userTab,
    setUserTab,
  };
}
