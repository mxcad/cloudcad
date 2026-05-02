import React from 'react';
import { Button } from '../../components/ui/Button';
import { SearchIcon, GridIcon, ListIcon, RefreshIcon } from '../../components/FileIcons';
import { FileSystemNode } from '../../types/filesystem';
import { PaginationMeta } from '../../components/ui/Pagination';

interface FileSystemToolbarProps {
  searchTerm: string;
  onSearchChange: (term: string) => void;
  onSearchSubmit: () => void;
  viewMode: 'grid' | 'list';
  onViewModeChange: (mode: 'grid' | 'list') => void;
  isMultiSelectMode: boolean;
  onMultiSelectModeChange: (mode: boolean) => void;
  selectedNodes: Set<string>;
  nodesCount: number;
  onSelectAll: () => void;
  loading: boolean;
  isTrashView: boolean;
  onClearTrash?: () => void;
  isAtRoot?: boolean;
}

export const FileSystemToolbar: React.FC<FileSystemToolbarProps> = ({
  searchTerm,
  onSearchChange,
  onSearchSubmit,
  viewMode,
  onViewModeChange,
  isMultiSelectMode,
  onMultiSelectModeChange,
  selectedNodes,
  nodesCount,
  onSelectAll,
  loading,
  isTrashView,
  onClearTrash,
  isAtRoot = false,
}) => {
  return (
    <div
      className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2"
      style={{ borderTop: '1px solid var(--border-subtle)' }}
    >
      <div className="relative group flex-1 max-w-xs" data-tour="search-input">
        <SearchIcon
          size={14}
          className="absolute left-3 top-1/2 -translate-y-1/2 transition-colors"
          style={{ color: 'var(--text-muted)' }}
        />
        <input
          type="text"
          placeholder={isTrashView ? '搜索已删除的项目...' : '搜索文件或项目...'}
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              onSearchSubmit();
            }
          }}
          className="w-full pl-9 pr-20 py-2 text-sm rounded-xl transition-all outline-none"
          style={{
            background: 'var(--bg-primary)',
            border: '1px solid var(--border-default)',
            color: 'var(--text-primary)',
          }}
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {searchTerm && (
            <button
              onClick={() => onSearchChange('')}
              className="transition-colors p-1"
              style={{ color: 'var(--text-muted)' }}
              title="清除搜索"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          )}
          <button
            onClick={onSearchSubmit}
            className="text-primary-500 hover:text-primary-600 transition-colors p-1"
            title="搜索"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {!isAtRoot && (
          <>
            <Button
              variant={isMultiSelectMode ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => {
                onMultiSelectModeChange(!isMultiSelectMode);
                if (isMultiSelectMode) {
                  selectedNodes.clear();
                }
              }}
              className={isMultiSelectMode ? '' : 'hover:bg-[var(--bg-tertiary)]'}
              style={isMultiSelectMode ? {} : { color: 'var(--text-tertiary)' }}
              title="多选模式"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z" />
              </svg>
            </Button>

            {isMultiSelectMode && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onSelectAll}
                className="hover:bg-[var(--bg-tertiary)]"
                style={{ color: 'var(--text-tertiary)' }}
                title={selectedNodes.size === nodesCount ? '取消全选' : '全选'}
              >
                {selectedNodes.size === nodesCount ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <path d="M9 9l6 6M15 9l-6 6" />
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <path d="M9 12l2 2 4-4" />
                  </svg>
                )}
              </Button>
            )}
          </>
        )}

        <div
          className="flex items-center rounded-xl overflow-hidden"
          style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-default)',
          }}
        >
          <button
            onClick={() => onViewModeChange('grid')}
            className="p-2 transition-colors"
            style={{
              background: viewMode === 'grid' ? 'var(--primary-50)' : 'transparent',
              color: viewMode === 'grid' ? 'var(--primary-600)' : 'var(--text-tertiary)',
            }}
          >
            <GridIcon size={14} />
          </button>
          <div className="w-px h-4" style={{ background: 'var(--border-default)' }} />
          <button
            onClick={() => onViewModeChange('list')}
            className="p-2 transition-colors"
            data-tour="view-toggle-list"
            style={{
              background: viewMode === 'list' ? 'var(--primary-50)' : 'transparent',
              color: viewMode === 'list' ? 'var(--primary-600)' : 'var(--text-tertiary)',
            }}
          >
            <ListIcon size={14} />
          </button>
        </div>

        {isTrashView && nodesCount > 0 && onClearTrash && (
          <Button
            variant="outline"
            size="sm"
            onClick={onClearTrash}
            style={{ color: 'var(--error)', borderColor: 'var(--error-dim)' }}
            className="hover:bg-[var(--error-dim)]"
            title="清空回收站"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
            </svg>
          </Button>
        )}
      </div>
    </div>
  );
};
