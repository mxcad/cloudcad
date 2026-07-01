import React, { useMemo } from 'react';
import { X } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { SearchInput } from '@/components/search/SearchInput';
import { SearchFilters, type SearchFilterValues, getActiveFilterChips } from '@/components/search/SearchFilters';
import { ViewToggle } from '@/components/common/ViewToggle';
import { Tooltip } from '@/components/ui/Tooltip';
import { t } from '@/languages';

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
  const scope = isProjectRootMode && !searchTerm ? 'project' : 'project_files';
  const filterChips = useMemo(
    () => (searchFilters && onSearchFiltersChange ? getActiveFilterChips(searchFilters, onSearchFiltersChange, scope) : []),
    [searchFilters, onSearchFiltersChange, scope],
  );

  return (
    <div
      className="flex flex-col pt-2"
      style={{ borderTop: '1px solid var(--border-subtle)' }}
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2 flex-1">
          <SearchInput
            placeholder={isTrashView ? t('搜索已删除的项目...') : t('搜索文件或项目...')}
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            onSearch={() => onSearchSubmit()}
          />

          {searchFilters !== undefined && onSearchFiltersChange && (
            <SearchFilters
              filters={searchFilters}
              onChange={onSearchFiltersChange}
              scope={scope}
            />
          )}
        </div>

        <div className="flex items-center gap-2">
          <ViewToggle
            viewMode={viewMode}
            onChange={onViewModeChange}
            dataTour="view-toggle-list"
          />

          {isTrashView && onClearTrash && trashItemsCount > 0 && (
            <Tooltip content={t("清空回收站")}>
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

      {filterChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 mt-2">
          {filterChips.map((chip) => (
            <span
              key={chip.key}
              className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full transition-colors duration-150 hover:opacity-80"
              style={{
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-secondary)',
              }}
            >
              {chip.label}
              <button
                type="button"
                onClick={chip.onRemove}
                className="flex items-center justify-center rounded-full hover:bg-[var(--bg-elevated)] transition-colors"
                style={{ width: 14, height: 14 }}
              >
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
};
