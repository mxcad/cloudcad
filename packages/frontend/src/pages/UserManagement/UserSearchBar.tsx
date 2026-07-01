import React from 'react';
import { t } from '@/languages';
import { getRoleDisplayName } from '@/constants/permissions';
import { SearchInput } from '@/components/search/SearchInput';
import { Select } from '@/components/ui/Select';
import type { SelectOption } from '@/components/ui/Select';

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
}: UserSearchBarProps) {
  const roleOptions: SelectOption[] = [
    { value: '', label: t('所有角色') },
    ...roles.map((role) => ({
      value: role.id,
      label: getRoleDisplayName(role.name, role.isSystem),
    })),
  ];

  const sortOptions: SelectOption[] = [
    { value: 'createdAt-desc', label: t('创建时间（降序）') },
    { value: 'createdAt-asc', label: t('创建时间（升序）') },
    { value: 'username-asc', label: t('用户名（升序）') },
    { value: 'username-desc', label: t('用户名（降序）') },
    { value: 'email-asc', label: t('邮箱（升序）') },
    { value: 'email-desc', label: t('邮箱（降序）') },
  ];

  return (
    <div className="filters-card">
      <div className="filters-grid">
        <SearchInput
          placeholder={t("搜索用户（邮箱、用户名、昵称）")}
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
        />

        <div className="filter-select-wrapper">
          <Select
            value={roleFilter}
            onChange={onRoleFilterChange}
            options={roleOptions}
            placeholder={t("所有角色")}
          />
        </div>

        <div className="filter-select-wrapper">
          <Select
            value={`${sortBy}-${sortOrder}`}
            onChange={(value) => {
              const [field, order] = value.split('-');
              if (field) onSortByChange(field);
              onSortOrderChange(order as 'asc' | 'desc');
            }}
            options={sortOptions}
            placeholder={t("排序方式")}
          />
        </div>
      </div>
    </div>
  );
}
