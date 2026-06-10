import React from 'react';
import { Button } from '../../components/ui/Button';
import { RefreshIcon } from '../../components/FileIcons';
import { SearchInput } from '@/components/search/SearchInput';
import { SearchFilters, type SearchFilterValues } from '@/components/search/SearchFilters';
import { ViewToggle } from '@/components/common/ViewToggle';
import { Tooltip } from '@/components/ui/Tooltip';

interface FileSystemToolbarProps {
  searchTerm: string;
  onSearchChange: (term: string) => void;
  onSearchSubmit: () => void;
  viewMode: 'grid' | 'list';
  onViewModeChange: (mode: 'grid' | 'list') => void;
  loading: boolean;
  isTrashView: boolean;
  onClearTrash?: () => void;
  trashItemsCount?: number;
  isAtRoot?: boolean;
  isProjectRootMode?: boolean;
  searchFilters?: SearchFilterValues;
  onSearchFiltersChange?: (filters: SearchFilterValues) => void;
}

export const FileSystemToolbar: React.FC<FileSystemToolbarProps> = ({
  searchTerm,
  onSearchChange,
  onSearchSubmit,
  viewMode,
  onViewModeChange,
  loading,
  isTrashView,
  onClearTrash,
  trashItemsCount = 0,
  isAtRoot = false,
  isProjectRootMode = false,
  searchFilters,
  onSearchFiltersChange,
}) => {
  return (
    <div
      className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2"
      style={{ borderTop: '1px solid var(--border-subtle)' }}
    >
      <div className="flex items-center gap-2 flex-1">
        <SearchInput
          placeholder={isTrashView ? '搜索已删除的项目...' : '搜索文件或项目...'}
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          onSearch={() => onSearchSubmit()}
        />

        {!isTrashView && searchFilters !== undefined && onSearchFiltersChange && (
          <SearchFilters
            filters={searchFilters}
            onChange={onSearchFiltersChange}
            scope={isProjectRootMode ? 'project' : 'project_files'}
          />
        )}
      </div>

      <div className="flex items-center gap-3">
        <ViewToggle
          viewMode={viewMode}
          onChange={onViewModeChange}
          className="data-tour-view-toggle"
        />

        {isTrashView && onClearTrash && trashItemsCount > 0 && (
          <Tooltip content="清空回收站">
            <Button
              variant="outline"
              size="sm"
              onClick={onClearTrash}
              style={{ color: 'var(--error)', borderColor: 'var(--error-dim)' }}
              className="hover:bg-[var(--error-dim)]"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
              </svg>
            </Button>
          </Tooltip>
        )}
      </div>
    </div>
  );
};
