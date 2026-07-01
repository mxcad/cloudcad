import React from 'react';
import { SearchInput } from '@/components/search/SearchInput';
import { ViewToggle } from '@/components/common/ViewToggle';
import { t } from '@/languages';

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
        placeholder={t("搜索文件...")}
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
        onSearch={() => onSearchSubmit?.()}
      />

      {/* 视图切换 */}
      <ViewToggle viewMode={viewMode} onChange={onViewModeChange} />
    </div>
  );
};
