import React from 'react';
import { Button } from '../../components/ui/Button';
import { RefreshIcon } from '../../components/FileIcons';
import { SearchInput } from '@/components/search/SearchInput';
import { ViewToggle } from '@/components/common/ViewToggle';
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
      <SearchInput
        placeholder={isTrashView ? '搜索已删除的项目...' : '搜索文件或项目...'}
        value={searchTerm}
        onChange={(e) => onSearchChange(e.target.value)}
        onSearch={() => onSearchSubmit()}
      />

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

        <ViewToggle
          viewMode={viewMode}
          onChange={onViewModeChange}
          size="sm"
          className="data-tour-view-toggle"
        />

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
