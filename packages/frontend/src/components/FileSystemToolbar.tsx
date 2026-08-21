import React, { useMemo } from 'react';
import { Undo2, Redo2 } from 'lucide-react';
import { Button } from './ui/Button';
import { SearchInput } from '@/components/search/SearchInput';
import {
  SearchFilters,
  type SearchFilterValues,
  getActiveFilterChips,
} from '@/components/search/SearchFilters';
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
  onSearchQueryChange?: (query: string) => void;
  /** 撤销/重做（命令栈 fileSystemUndoRedoStore；undefined 时不渲染按钮） */
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void | Promise<void>;
  onRedo?: () => void | Promise<void>;
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
  onSearchQueryChange,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}) => {
  const hasUndoRedo = onUndo !== undefined || onRedo !== undefined;
  const scope = isProjectRootMode && !searchTerm ? 'project' : 'project_files';
  const filterChips = useMemo(
    () =>
      searchFilters && onSearchFiltersChange
        ? getActiveFilterChips(searchFilters, onSearchFiltersChange, scope)
        : [],
    [searchFilters, onSearchFiltersChange, scope]
  );

  return (
    <div
      className="flex flex-col pt-2"
      style={{ borderTop: '1px solid var(--border-subtle)' }}
    >
      <div className="flex items-start gap-2">
        <div className="flex items-start gap-2 flex-1 min-w-0">
          <SearchInput
            placeholder={
              isTrashView ? t('搜索已删除的项目...') : t('搜索文件或项目...')
            }
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            onSearch={() => onSearchSubmit()}
            chips={filterChips}
          />

          {searchFilters !== undefined && onSearchFiltersChange && (
            <SearchFilters
              filters={searchFilters}
              onChange={onSearchFiltersChange}
              scope={scope}
              searchQuery={searchTerm}
              onSearchQueryChange={onSearchQueryChange}
            />
          )}
        </div>

        {hasUndoRedo && (
          <div
            className="flex items-center rounded-xl overflow-hidden"
            style={{
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-default)',
            }}
          >
            <Tooltip content={t('撤销 (Ctrl+Z)')}>
              <button
                type="button"
                onClick={onUndo}
                disabled={!canUndo}
                aria-label={t('撤销')}
                className="p-1.5 transition-colors duration-150"
                style={{
                  color: canUndo
                    ? 'var(--text-primary)'
                    : 'var(--text-tertiary)',
                  opacity: canUndo ? 1 : 0.5,
                  cursor: canUndo ? 'pointer' : 'not-allowed',
                }}
              >
                <Undo2 size={14} />
              </button>
            </Tooltip>
            <div
              className="w-px h-4"
              style={{ background: 'var(--border-default)' }}
            />
            <Tooltip content={t('重做 (Ctrl+Shift+Z / Ctrl+Y)')}>
              <button
                type="button"
                onClick={onRedo}
                disabled={!canRedo}
                aria-label={t('重做')}
                className="p-1.5 transition-colors duration-150"
                style={{
                  color: canRedo
                    ? 'var(--text-primary)'
                    : 'var(--text-tertiary)',
                  opacity: canRedo ? 1 : 0.5,
                  cursor: canRedo ? 'pointer' : 'not-allowed',
                }}
              >
                <Redo2 size={14} />
              </button>
            </Tooltip>
          </div>
        )}

        <ViewToggle
          viewMode={viewMode}
          onChange={onViewModeChange}
          dataTour="view-toggle-list"
        />

        {isTrashView && onClearTrash && trashItemsCount > 0 && (
          <Tooltip content={t('清空回收站')}>
            <Button
              variant="outline"
              size="sm"
              onClick={onClearTrash}
              style={{ color: 'var(--error)', borderColor: 'var(--error-dim)' }}
              className="hover:bg-[var(--error-dim)]"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
              </svg>
            </Button>
          </Tooltip>
        )}
      </div>
    </div>
  );
};
