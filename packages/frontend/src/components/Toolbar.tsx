import React from 'react';
import { GridIcon, ListIcon } from './FileIcons';
import { SearchInput } from '@/components/search/SearchInput';
import { Tooltip } from './ui/Tooltip';
import { Tabs, Tab } from './ui';

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
      <Tabs>
        <Tooltip content="网格视图" position="bottom" delay={100}>
          <Tab
            active={viewMode === 'grid'}
            onClick={() => onViewModeChange('grid')}
            aria-label="网格视图"
          >
            <GridIcon size={18} />
          </Tab>
        </Tooltip>
        <Tooltip content="列表视图" position="bottom" delay={100}>
          <Tab
            active={viewMode === 'list'}
            onClick={() => onViewModeChange('list')}
            aria-label="列表视图"
          >
            <ListIcon size={18} />
          </Tab>
        </Tooltip>
      </Tabs>
    </div>
  );
};
