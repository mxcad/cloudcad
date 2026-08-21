import { X, ChevronDown } from 'lucide-react';
import { Button, Select } from '@/components/ui';
import { SearchInput } from '@/components/search/SearchInput';
import { ViewToggle } from '@/components/common/ViewToggle';
import { getFontTypes } from '../fontTypeConfig';
import { t } from '@/languages';

export interface FontFilters {
  name: string;
  extension: string;
}

interface FontToolbarProps {
  filters: FontFilters;
  viewMode: 'grid' | 'list';
  sortBy: 'name' | 'size' | 'createdAt';
  sortOrder: 'asc' | 'desc';
  handleFilterChange: (key: string, value: string) => void;
  handleReset: () => void;
  handleSort: (field: 'name' | 'size' | 'createdAt') => void;
  setViewMode: (mode: 'grid' | 'list') => void;
}

const sortOptions = [
  { key: 'createdAt', label: () => t('修改时间') },
  { key: 'name', label: () => t('名称') },
  { key: 'size', label: () => t('大小') },
] as const;

export const FontToolbar: React.FC<FontToolbarProps> = ({
  filters,
  viewMode,
  sortBy,
  sortOrder,
  handleFilterChange,
  handleReset,
  handleSort,
  setViewMode,
}) => {
  const hasActiveFilters = filters.name || filters.extension;

  return (
    <>
      <div className="card-theme mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[200px]">
            <SearchInput
              placeholder={t('搜索字体名称...')}
              value={filters.name}
              onChange={(e) => handleFilterChange('name', e.target.value)}
            />
          </div>

          <div className="w-36">
            <Select
              value={filters.extension}
              onChange={(val) => handleFilterChange('extension', val)}
              options={getFontTypes().map((t) => ({
                value: t.value,
                label: t.label,
              }))}
            />
          </div>

          {hasActiveFilters && (
            <Button variant="secondary" icon={X} onClick={handleReset}>
              {t('清除')}
            </Button>
          )}

          {/* 排序按钮组 + 视图切换并入第一行，节省独立排序行高度 */}
          <div className="ml-auto flex items-center gap-1">
            {sortOptions.map(({ key, label }) => (
              <Button
                variant="secondary"
                size="xs"
                key={key}
                onClick={() => handleSort(key)}
                className={
                  sortBy === key ? 'text-[var(--primary-500)] font-medium' : ''
                }
              >
                {label()}
                {sortBy === key && (
                  <ChevronDown
                    size={14}
                    className={`transition-transform ${sortOrder === 'asc' ? 'rotate-180' : ''}`}
                  />
                )}
              </Button>
            ))}
          </div>

          <ViewToggle viewMode={viewMode} onChange={setViewMode} />
        </div>
      </div>
    </>
  );
};
