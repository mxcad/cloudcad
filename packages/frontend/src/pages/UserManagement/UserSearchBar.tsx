import React from 'react';
import { Search } from 'lucide-react';
import { Pagination } from '@/components/ui/Pagination';
import { getRoleDisplayName } from '@/constants/permissions';
import { SearchInput } from '@/components/search/SearchInput';

interface RoleDto {
  id: string;
  name: string;
  isSystem: boolean;
}

interface UserSearchBarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  roleFilter: string;
  onRoleFilterChange: (roleId: string) => void;
  roles: RoleDto[];
  sortBy: string;
  onSortByChange: (field: string) => void;
  sortOrder: 'asc' | 'desc';
  onSortOrderChange: (order: 'asc' | 'desc') => void;
  currentPage: number;
  totalPages: number;
  totalUsers: number;
  pageSize: number;
  loading: boolean;
  onPageChange: (page: number) => void;
}

export function UserSearchBar({
  searchQuery,
  onSearchChange,
  roleFilter,
  onRoleFilterChange,
  roles,
  sortBy,
  onSortByChange,
  sortOrder,
  onSortOrderChange,
  currentPage,
  totalPages,
  totalUsers,
  pageSize,
  loading,
  onPageChange,
}: UserSearchBarProps) {
  return (
    <div className="filters-card">
      <div className="filters-grid">
        <div className="search-input-wrapper">
          <Search className="search-icon" size={20} />
          <SearchInput
            placeholder="搜索用户（邮箱、用户名、昵称）"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>

        <div className="filter-select-wrapper">
          <select
            value={roleFilter}
            onChange={(e) => onRoleFilterChange(e.target.value)}
            className="filter-select"
          >
            <option value="">所有角色</option>
            {roles.map((role) => (
              <option key={role.id} value={role.id}>
                {getRoleDisplayName(role.name, role.isSystem)}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-select-wrapper">
          <select
            value={`${sortBy}-${sortOrder}`}
            onChange={(e) => {
              const [field, order] = e.target.value.split('-');
              if (field) onSortByChange(field);
              onSortOrderChange(order as 'asc' | 'desc');
            }}
            className="filter-select"
          >
            <option value="createdAt-desc">创建时间（降序）</option>
            <option value="createdAt-asc">创建时间（升序）</option>
            <option value="username-asc">用户名（升序）</option>
            <option value="username-desc">用户名（降序）</option>
            <option value="email-asc">邮箱（升序）</option>
            <option value="email-desc">邮箱（降序）</option>
          </select>
        </div>
      </div>

      <Pagination
        meta={{
          total: totalUsers,
          page: currentPage,
          limit: pageSize,
          totalPages: totalPages || 1,
        }}
        onPageChange={onPageChange}
        simple
        loading={loading}
      />
    </div>
  );
}
