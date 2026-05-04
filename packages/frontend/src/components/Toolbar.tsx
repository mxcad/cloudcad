import React from 'react';
import { SearchIcon, GridIcon, ListIcon } from './FileIcons';
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
      <div className="relative group flex-1 max-w-sm">
        <SearchIcon
          size={18}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 
                     group-focus-within:text-indigo-500 transition-colors"
        />
        <input
          type="text"
          placeholder="搜索文件..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && onSearchSubmit) {
              onSearchSubmit();
            }
          }}
          className="w-full pl-10 pr-10 py-2 bg-white border border-slate-200 rounded-lg 
                     text-sm text-slate-900 placeholder:text-slate-400
                     focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
                     transition-all duration-200 hover:border-slate-300"
        />
        {searchQuery && (
          <button
            onClick={() => onSearchChange('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 
                       hover:text-slate-600 transition-colors p-1"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

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
