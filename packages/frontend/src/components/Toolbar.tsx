import React from 'react';
import { GridIcon, ListIcon } from './FileIcons';
import { SearchInput } from '@/components/search/SearchInput';
import { Tooltip } from './ui/Tooltip';

interface ToolbarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onSearchSubmit?: () => void;
  viewMode: 'grid' | 'list';
  onViewModeChange: (mode: 'grid' | 'list') => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  searchQuery,
  onSearchChange,
  onSearchSubmit,
  viewMode,
  onViewModeChange,
}) => {
  return (
    <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
      {/* 搜索框 */}
      <SearchInput
        placeholder="搜索文件..."
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
        onSearch={() => onSearchSubmit?.()}
      />

      {/* 视图切换 */}
      <div className="flex items-center bg-white border border-slate-200 rounded-lg overflow-hidden">
        <Tooltip content="网格视图" position="bottom" delay={100}>
          <button
            onClick={() => onViewModeChange('grid')}
            className={`p-2 transition-all duration-200 ${
              viewMode === 'grid'
                ? 'bg-indigo-50 text-indigo-600'
                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
            }`}
            aria-label="网格视图"
          >
            <GridIcon size={18} />
          </button>
        </Tooltip>
        <div className="w-px h-5 bg-slate-200" />
        <Tooltip content="列表视图" position="bottom" delay={100}>
          <button
            onClick={() => onViewModeChange('list')}
            className={`p-2 transition-all duration-200 ${
              viewMode === 'list'
                ? 'bg-indigo-50 text-indigo-600'
                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
            }`}
            aria-label="列表视图"
          >
            <ListIcon size={18} />
          </button>
        </Tooltip>
      </div>
    </div>
  );
};
