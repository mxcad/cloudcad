import React, { useState, useCallback } from 'react';
import { Filter, X } from 'lucide-react';
import { Select, type SelectOption } from '@/components/ui/Select';
import { Tooltip } from '@/components/ui/Tooltip';
import { Button } from '@/components/ui/Button';
import type { FileStatus } from '@/api-sdk';

export interface SearchFilterValues {
  extension?: string;
  type?: 'all' | 'file' | 'folder';
  fileStatus?: FileStatus;
}

interface SearchFiltersProps {
  filters: SearchFilterValues;
  onChange: (filters: SearchFilterValues) => void;
}

const typeOptions: SelectOption[] = [
  { value: 'all', label: '全部类型' },
  { value: 'file', label: '文件' },
  { value: 'folder', label: '文件夹' },
];

const extOptions: SelectOption[] = [
  { value: '', label: '全部格式' },
  { value: '.dwg', label: 'DWG 图纸' },
  { value: '.dxf', label: 'DXF 图纸' },
  { value: '.pdf', label: 'PDF 文档' },
  { value: '.png', label: 'PNG 图片' },
  { value: '.jpg', label: 'JPG 图片' },
  { value: '.doc', label: 'Word 文档' },
  { value: '.docx', label: 'Word 文档' },
  { value: '.xls', label: 'Excel 表格' },
  { value: '.xlsx', label: 'Excel 表格' },
];

const statusOptions: SelectOption[] = [
  { value: '', label: '全部状态' },
  { value: 'COMPLETED', label: '已完成' },
  { value: 'PROCESSING', label: '处理中' },
  { value: 'FAILED', label: '处理失败' },
  { value: 'UPLOADING', label: '上传中' },
];

export const SearchFilters: React.FC<SearchFiltersProps> = ({
  filters,
  onChange,
}) => {
  const [open, setOpen] = useState(false);

  const hasActiveFilters = !!(filters.extension || (filters.type && filters.type !== 'all') || filters.fileStatus);

  const handleChange = useCallback(
    (key: keyof SearchFilterValues, value: string) => {
      onChange({ ...filters, [key]: value || undefined });
    },
    [filters, onChange],
  );

  const clearAll = useCallback(() => {
    onChange({ extension: undefined, type: undefined, fileStatus: undefined });
  }, [onChange]);

  return (
    <div className="relative">
      <div className="flex items-center gap-1">
        <Tooltip content={hasActiveFilters ? '已启用筛选条件' : '筛选条件'}>
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className={`
              p-1.5 rounded-[3px] transition-all duration-200
              hover:bg-[var(--bg-tertiary)]
            `}
            style={{ color: hasActiveFilters ? 'var(--info)' : 'var(--text-muted)' }}
          >
            <Filter size={14} />
          </button>
        </Tooltip>
        {hasActiveFilters && (
          <Tooltip content="清除筛选">
            <button
              type="button"
              onClick={clearAll}
              className="p-1 rounded-[3px] transition-all duration-200 hover:bg-[var(--bg-tertiary)]"
              style={{ color: 'var(--text-muted)' }}
            >
              <X size={12} />
            </button>
          </Tooltip>
        )}
      </div>

      {open && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setOpen(false)}
          />
          <div
            className="absolute left-0 top-full mt-2 z-20 p-3 rounded-lg shadow-lg space-y-3 min-w-[280px]"
            style={{
              background: 'var(--bg-primary)',
              border: '1px solid var(--border-default)',
            }}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                筛选条件
              </span>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearAll}
                  className="text-xs hover:underline"
                  style={{ color: 'var(--info)' }}
                >
                  重置
                </button>
              )}
            </div>

            <div className="space-y-2">
              <label className="block text-xs" style={{ color: 'var(--text-tertiary)' }}>类型</label>
              <Select
                options={typeOptions}
                value={filters.type || 'all'}
                onChange={(v) => handleChange('type', v)}
                size="sm"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-xs" style={{ color: 'var(--text-tertiary)' }}>扩展名</label>
              <Select
                options={extOptions}
                value={filters.extension || ''}
                onChange={(v) => handleChange('extension', v)}
                size="sm"
                searchable
              />
            </div>

            <div className="space-y-2">
              <label className="block text-xs" style={{ color: 'var(--text-tertiary)' }}>状态</label>
              <Select
                options={statusOptions}
                value={filters.fileStatus || ''}
                onChange={(v) => handleChange('fileStatus', v)}
                size="sm"
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default SearchFilters;
