import React, { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Filter, X } from 'lucide-react';
import { Select, type SelectOption } from '@/components/ui/Select';
import { Tooltip } from '@/components/ui/Tooltip';
import { Z_LAYERS } from '@/constants/layers';

export interface SearchFilterValues {
  extension?: string;
  timeRange?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

function cleanFilters(f: SearchFilterValues): SearchFilterValues {
  const out: SearchFilterValues = {};
  if (f.extension) out.extension = f.extension;
  if (f.timeRange) out.timeRange = f.timeRange;
  if (f.sortBy) out.sortBy = f.sortBy;
  if (f.sortOrder) out.sortOrder = f.sortOrder;
  return out;
}

interface SearchFiltersProps {
  filters: SearchFilterValues;
  onChange: (filters: SearchFilterValues) => void;
  scope?: 'project' | 'project_files';
}

const extOptions: SelectOption[] = [
  { value: '', label: '全部格式' },
  { value: '.dwg', label: 'DWG 图纸' },
  { value: '.dxf', label: 'DXF 图纸' },
  { value: '.dwt', label: 'DWT 图纸模板' },
  { value: '.dwf', label: 'DWF 设计' },
  { value: '.pdf', label: 'PDF 文档' },
  { value: '.doc', label: 'Word 文档' },
  { value: '.docx', label: 'Word 文档' },
  { value: '.xls', label: 'Excel 表格' },
  { value: '.xlsx', label: 'Excel 表格' },
  { value: '.ppt', label: 'PPT 演示' },
  { value: '.pptx', label: 'PPT 演示' },
  { value: '.png', label: 'PNG 图片' },
  { value: '.jpg', label: 'JPG 图片' },
  { value: '.jpeg', label: 'JPEG 图片' },
  { value: '.bmp', label: 'BMP 图片' },
  { value: '.tif', label: 'TIFF 图片' },
  { value: '.tiff', label: 'TIFF 图片' },
  { value: '.gif', label: 'GIF 图片' },
  { value: '.svg', label: 'SVG 矢量图' },
  { value: '.zip', label: 'ZIP 压缩包' },
  { value: '.rar', label: 'RAR 压缩包' },
  { value: '.7z', label: '7Z 压缩包' },
  { value: '.txt', label: 'TXT 文本' },
  { value: '.csv', label: 'CSV 表格' },
  { value: '.json', label: 'JSON 数据' },
  { value: '.xml', label: 'XML 数据' },
  { value: '.md', label: 'Markdown' },
];

const timeOptions: SelectOption[] = [
  { value: '', label: '全部时间' },
  { value: '-1d', label: '今天' },
  { value: '-7d', label: '最近 7 天' },
  { value: '-30d', label: '最近 30 天' },
  { value: '-90d', label: '最近 90 天' },
];

const SORT_OPTIONS: { value: string; label: string; sortBy: string; sortOrder: 'asc' | 'desc' }[] = [
  { value: '',                  label: '默认排序',       sortBy: 'updatedAt', sortOrder: 'desc' },
  { value: 'updatedAt|desc',    label: '更新时间 ↑',     sortBy: 'updatedAt', sortOrder: 'desc' },
  { value: 'updatedAt|asc',     label: '更新时间 ↓',     sortBy: 'updatedAt', sortOrder: 'asc' },
  { value: 'createdAt|desc',    label: '创建时间 ↑',     sortBy: 'createdAt', sortOrder: 'desc' },
  { value: 'createdAt|asc',     label: '创建时间 ↓',     sortBy: 'createdAt', sortOrder: 'asc' },
  { value: 'name|asc',          label: '名称 A-Z',       sortBy: 'name',      sortOrder: 'asc' },
  { value: 'name|desc',         label: '名称 Z-A',       sortBy: 'name',      sortOrder: 'desc' },
  { value: 'size|asc',          label: '从小到大',       sortBy: 'size',      sortOrder: 'asc' },
  { value: 'size|desc',         label: '从大到小',       sortBy: 'size',      sortOrder: 'desc' },
];

function getCurrentSortValue(sortBy?: string, sortOrder?: 'asc' | 'desc'): string {
  if (!sortBy) return '';
  return `${sortBy}|${sortOrder || 'desc'}`;
}

function parseSortValue(value: string): { sortBy?: string; sortOrder?: 'asc' | 'desc' } {
  if (!value) return {};
  const parts = value.split('|');
  return { sortBy: parts[0], sortOrder: (parts[1] as 'asc' | 'desc') || 'desc' };
}

export const SearchFilters: React.FC<SearchFiltersProps> = ({
  filters,
  onChange,
  scope = 'project_files',
}) => {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLDivElement>(null);
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({});

  const closePanel = useCallback(() => {
    setOpen(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    const handleClose = () => closePanel();
    window.addEventListener('scroll', handleClose, true);
    window.addEventListener('resize', handleClose);
    return () => {
      window.removeEventListener('scroll', handleClose, true);
      window.removeEventListener('resize', handleClose);
    };
  }, [open, closePanel]);

  const hasActiveFilters = !!(filters.extension || filters.timeRange || filters.sortBy);

  const handleChange = useCallback(
    (key: keyof SearchFilterValues, value: string) => {
      onChange(cleanFilters({ ...filters, [key]: value || undefined }));
    },
    [filters, onChange],
  );

  const handleSortChange = useCallback(
    (value: string) => {
      const parsed = parseSortValue(value);
      onChange(cleanFilters({ ...filters, ...parsed }));
    },
    [filters, onChange],
  );

  const clearAll = useCallback(() => {
    onChange({});
  }, [onChange]);

  const openPanel = useCallback(() => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const panelW = 260;
      let left = rect.right - panelW;
      const gap = 12;
      if (left < gap) left = gap;
      if (left + panelW > window.innerWidth - gap) {
        left = window.innerWidth - panelW - gap;
      }
      setPanelStyle({
        position: 'fixed',
        top: rect.bottom + 8,
        left,
      });
    }
    setOpen(true);
  }, []);

  return (
    <div className="inline-flex">
      <div ref={buttonRef} className="flex items-center gap-1">
        <Tooltip content={hasActiveFilters ? '已启用筛选条件' : '筛选条件'} disabled={open}>
          <button
            type="button"
            onClick={() => (open ? closePanel() : openPanel())}
            className="p-1.5 rounded-[3px] transition-all duration-200 hover:bg-[var(--bg-tertiary)]"
            style={{
              color: hasActiveFilters ? 'var(--info)' : 'var(--text-muted)',
              background: open ? 'var(--bg-tertiary)' : 'transparent',
            }}
          >
            <Filter size={14} />
          </button>
        </Tooltip>
        {hasActiveFilters && (
          <Tooltip content="清除筛选" disabled={open}>
            <button
              type="button"
              onClick={clearAll}
              className="p-1.5 rounded-[3px] transition-all duration-200 hover:bg-[var(--bg-tertiary)]"
              style={{ color: 'var(--text-muted)' }}
            >
              <X size={14} />
            </button>
          </Tooltip>
        )}
      </div>

      {open && createPortal(
        <>
          <div
            className="fixed inset-0"
            style={{ zIndex: Z_LAYERS.OVERLAY }}
            onClick={closePanel}
          />
          <div
            className="p-3 rounded-lg shadow-lg space-y-3 min-w-[260px] max-h-[70vh] overflow-y-auto"
            style={{
              ...panelStyle,
              zIndex: Z_LAYERS.POPUP,
              background: 'var(--bg-primary)',
              border: '1px solid var(--border-default)',
            }}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                筛选排序
              </span>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearAll}
                  className="text-xs hover:underline cursor-pointer"
                  style={{ color: 'var(--info)' }}
                >
                  重置
                </button>
              )}
            </div>

            {scope === 'project_files' && (
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
            )}

            <div className="space-y-2">
              <label className="block text-xs" style={{ color: 'var(--text-tertiary)' }}>修改时间</label>
              <Select
                options={timeOptions}
                value={filters.timeRange || ''}
                onChange={(v) => handleChange('timeRange', v)}
                size="sm"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-xs" style={{ color: 'var(--text-tertiary)' }}>排序</label>
              <Select
                options={SORT_OPTIONS}
                value={getCurrentSortValue(filters.sortBy, filters.sortOrder)}
                onChange={handleSortChange}
                size="sm"
              />
            </div>
          </div>
        </>,
        document.body,
      )}
    </div>
  );
};

export default SearchFilters;
