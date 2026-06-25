import React, { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Filter, X, Calendar, FileText, Ruler, ArrowUpDown } from 'lucide-react';
import { Select, type SelectOption } from '@/components/ui/Select';
import { Tooltip } from '@/components/ui/Tooltip';
import { Z_LAYERS } from '@/constants/layers';

export interface SearchFilterValues {
  extensions?: string[];
  timeRange?: string;
  modifiedAtFrom?: string;
  modifiedAtTo?: string;
  createdAtFrom?: string;
  createdAtTo?: string;
  sizeMin?: number;
  sizeMax?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

function cleanFilters(f: SearchFilterValues): SearchFilterValues {
  const out: SearchFilterValues = {};
  if (f.extensions && f.extensions.length > 0) out.extensions = [...f.extensions];
  if (f.timeRange) out.timeRange = f.timeRange;
  if (f.modifiedAtFrom) out.modifiedAtFrom = f.modifiedAtFrom;
  if (f.modifiedAtTo) out.modifiedAtTo = f.modifiedAtTo;
  if (f.createdAtFrom) out.createdAtFrom = f.createdAtFrom;
  if (f.createdAtTo) out.createdAtTo = f.createdAtTo;
  if (f.sizeMin !== undefined) out.sizeMin = f.sizeMin;
  if (f.sizeMax !== undefined) out.sizeMax = f.sizeMax;
  if (f.sortBy) out.sortBy = f.sortBy;
  if (f.sortOrder) out.sortOrder = f.sortOrder;
  return out;
}

const extOptions = [
  { value: '.dwg', label: 'DWG 图纸' },
  { value: '.dxf', label: 'DXF 图纸' },
  { value: '.mxweb', label: 'MXWEB 文件' },
];

const SIZE_PRESETS: { value: string; label: string; min?: number; max?: number }[] = [
  { value: '', label: '全部大小' },
  { value: 'lt1mb', label: '< 1 MB', max: 1_000_000 },
  { value: '1mb-10mb', label: '1 MB - 10 MB', min: 1_000_000, max: 10_000_000 },
  { value: '10mb-100mb', label: '10 MB - 100 MB', min: 10_000_000, max: 100_000_000 },
  { value: 'gt100mb', label: '> 100 MB', min: 100_000_000 },
];

const timePresets: { value: string; label: string }[] = [
  { value: '', label: '不限' },
  { value: '-1d', label: '今天' },
  { value: '-7d', label: '最近 7 天' },
  { value: '-30d', label: '最近 30 天' },
  { value: '-90d', label: '最近 90 天' },
];

const sortOptions: { value: string; label: string; sortBy: string; sortOrder: 'asc' | 'desc' }[] = [
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

function formatBytes(bytes?: number): string {
  if (bytes === undefined) return '';
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(0)} KB`;
  return `${bytes} B`;
}

function getSizeLabel(min?: number, max?: number): string | undefined {
  if (min !== undefined && max !== undefined) return `${formatBytes(min)} ~ ${formatBytes(max)}`;
  if (min !== undefined) return `> ${formatBytes(min)}`;
  if (max !== undefined) return `< ${formatBytes(max)}`;
  return undefined;
}

function getDateLabel(from?: string, to?: string): string | undefined {
  if (from && to) return `${from.slice(0, 10)} ~ ${to.slice(0, 10)}`;
  if (from) return `从 ${from.slice(0, 10)}`;
  if (to) return `到 ${to.slice(0, 10)}`;
  return undefined;
}

export interface FilterChip {
  key: string;
  label: string;
  onRemove: () => void;
}

export function getActiveFilterChips(
  filters: SearchFilterValues,
  onChange: (f: SearchFilterValues) => void,
): FilterChip[] {
  const chips: FilterChip[] = [];

  if (filters.extensions && filters.extensions.length > 0) {
    chips.push({
      key: 'extensions',
      label: `格式: ${filters.extensions.join(', ')}`,
      onRemove: () => onChange(cleanFilters({ ...filters, extensions: undefined })),
    });
  }

  if (filters.timeRange) {
    const opt = timePresets.find((o) => o.value === filters.timeRange);
    chips.push({
      key: 'timeRange',
      label: `修改: ${opt?.label || filters.timeRange}`,
      onRemove: () => onChange(cleanFilters({ ...filters, timeRange: undefined })),
    });
  }

  const modifiedLabel = getDateLabel(filters.modifiedAtFrom, filters.modifiedAtTo);
  if (modifiedLabel) {
    chips.push({
      key: 'modifiedAt',
      label: `修改: ${modifiedLabel}`,
      onRemove: () => onChange(cleanFilters({ ...filters, modifiedAtFrom: undefined, modifiedAtTo: undefined })),
    });
  }

  const createdLabel = getDateLabel(filters.createdAtFrom, filters.createdAtTo);
  if (createdLabel) {
    chips.push({
      key: 'createdAt',
      label: `创建: ${createdLabel}`,
      onRemove: () => onChange(cleanFilters({ ...filters, createdAtFrom: undefined, createdAtTo: undefined })),
    });
  }

  const sizeLabel = getSizeLabel(filters.sizeMin, filters.sizeMax);
  if (sizeLabel) {
    chips.push({
      key: 'size',
      label: `大小: ${sizeLabel}`,
      onRemove: () => onChange(cleanFilters({ ...filters, sizeMin: undefined, sizeMax: undefined })),
    });
  }

  if (filters.sortBy) {
    const sortOption = sortOptions.find(
      (o) => o.sortBy === filters.sortBy && o.sortOrder === filters.sortOrder,
    );
    chips.push({
      key: 'sort',
      label: `排序: ${sortOption?.label || `${filters.sortBy} ${filters.sortOrder}`}`,
      onRemove: () => onChange(cleanFilters({ ...filters, sortBy: undefined, sortOrder: undefined })),
    });
  }

  return chips;
}

function CheckboxList<T extends string>({
  options,
  selected,
  onChange,
}: {
  options: { value: T; label: string }[];
  selected: T[];
  onChange: (v: T[]) => void;
}) {
  const toggle = useCallback(
    (value: T) => {
      if (selected.includes(value)) {
        onChange(selected.filter((v) => v !== value));
      } else {
        onChange([...selected, value]);
      }
    },
    [selected, onChange],
  );

  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => {
        const isActive = selected.includes(opt.value);
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => toggle(opt.value)}
            className="px-2 py-1 text-xs rounded-[3px] transition-all duration-150"
            style={{
              background: isActive ? 'var(--info)' : 'var(--bg-tertiary)',
              color: isActive ? '#fff' : 'var(--text-secondary)',
              border: `1px solid ${isActive ? 'var(--info)' : 'var(--border-subtle)'}`,
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

interface SearchFiltersProps {
  filters: SearchFilterValues;
  onChange: (filters: SearchFilterValues) => void;
  scope?: 'project' | 'project_files';
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
    const handleResize = () => closePanel();
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [open, closePanel]);

  const hasActiveFilters = !!(
    (filters.extensions && filters.extensions.length > 0) ||
    filters.timeRange ||
    filters.modifiedAtFrom || filters.modifiedAtTo ||
    filters.createdAtFrom || filters.createdAtTo ||
    filters.sizeMin !== undefined || filters.sizeMax !== undefined ||
    filters.sortBy
  );

  const clearAll = useCallback(() => {
    onChange({});
  }, [onChange]);

  const openPanel = useCallback(() => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const panelW = 300;
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
            className="p-3 rounded-lg shadow-lg space-y-3 min-w-[300px] max-h-[80vh] overflow-y-auto"
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
              <div className="space-y-1.5">
                <label className="block text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  <FileText size={12} className="inline mr-1" />
                  文件格式（多选）
                </label>
                <CheckboxList
                  options={extOptions}
                  selected={filters.extensions || []}
                  onChange={(v) => onChange(cleanFilters({ ...filters, extensions: v.length > 0 ? v : undefined }))}
                />
              </div>
            )}

            <div className="space-y-1.5">
              <label className="block text-xs" style={{ color: 'var(--text-tertiary)' }}>
                <ArrowUpDown size={12} className="inline mr-1" />
                排序
              </label>
              <Select
                options={sortOptions}
                value={getCurrentSortValue(filters.sortBy, filters.sortOrder)}
                onChange={(v) => {
                  const parsed = parseSortValue(v);
                  onChange(cleanFilters({ ...filters, ...parsed }));
                }}
                size="sm"
              />
            </div>

            <div className="border-t" style={{ borderColor: 'var(--border-subtle)' }} />

            <div className="space-y-1.5">
              <label className="block text-xs" style={{ color: 'var(--text-tertiary)' }}>
                <Calendar size={12} className="inline mr-1" />
                修改时间
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  value={filters.modifiedAtFrom ? filters.modifiedAtFrom.slice(0, 10) : ''}
                  onChange={(e) =>
                    onChange(cleanFilters({ ...filters, modifiedAtFrom: e.target.value || undefined, timeRange: undefined }))
                  }
                  className="flex-1 px-1.5 py-1 text-xs rounded-[3px]"
                  style={{
                    background: 'var(--bg-primary)',
                    border: '1px solid var(--border-default)',
                    color: 'var(--text-primary)',
                  }}
                  placeholder="起始"
                />
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>~</span>
                <input
                  type="date"
                  value={filters.modifiedAtTo ? filters.modifiedAtTo.slice(0, 10) : ''}
                  onChange={(e) =>
                    onChange(cleanFilters({ ...filters, modifiedAtTo: e.target.value || undefined, timeRange: undefined }))
                  }
                  className="flex-1 px-1.5 py-1 text-xs rounded-[3px]"
                  style={{
                    background: 'var(--bg-primary)',
                    border: '1px solid var(--border-default)',
                    color: 'var(--text-primary)',
                  }}
                  placeholder="结束"
                />
              </div>
              <div className="flex flex-wrap gap-1">
                {timePresets.slice(1).map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() =>
                      onChange(
                        cleanFilters({
                          ...filters,
                          timeRange: filters.timeRange === p.value ? undefined : p.value,
                          modifiedAtFrom: undefined,
                          modifiedAtTo: undefined,
                        }),
                      )
                    }
                    className="px-2 py-0.5 text-xs rounded-[3px] transition-all duration-150"
                    style={{
                      background: filters.timeRange === p.value ? 'var(--info)' : 'var(--bg-tertiary)',
                      color: filters.timeRange === p.value ? '#fff' : 'var(--text-tertiary)',
                      border: `1px solid ${filters.timeRange === p.value ? 'var(--info)' : 'var(--border-subtle)'}`,
                    }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs" style={{ color: 'var(--text-tertiary)' }}>
                <Calendar size={12} className="inline mr-1" />
                创建时间
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  value={filters.createdAtFrom ? filters.createdAtFrom.slice(0, 10) : ''}
                  onChange={(e) =>
                    onChange(cleanFilters({ ...filters, createdAtFrom: e.target.value || undefined }))
                  }
                  className="flex-1 px-1.5 py-1 text-xs rounded-[3px]"
                  style={{
                    background: 'var(--bg-primary)',
                    border: '1px solid var(--border-default)',
                    color: 'var(--text-primary)',
                  }}
                  placeholder="起始"
                />
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>~</span>
                <input
                  type="date"
                  value={filters.createdAtTo ? filters.createdAtTo.slice(0, 10) : ''}
                  onChange={(e) =>
                    onChange(cleanFilters({ ...filters, createdAtTo: e.target.value || undefined }))
                  }
                  className="flex-1 px-1.5 py-1 text-xs rounded-[3px]"
                  style={{
                    background: 'var(--bg-primary)',
                    border: '1px solid var(--border-default)',
                    color: 'var(--text-primary)',
                  }}
                  placeholder="结束"
                />
              </div>
            </div>

            <div className="border-t" style={{ borderColor: 'var(--border-subtle)' }} />

            <div className="space-y-1.5">
              <label className="block text-xs" style={{ color: 'var(--text-tertiary)' }}>
                <Ruler size={12} className="inline mr-1" />
                文件大小
              </label>
              <Select
                options={SIZE_PRESETS}
                value={
                  filters.sizeMin !== undefined || filters.sizeMax !== undefined
                    ? SIZE_PRESETS.find(
                        (p) => p.min === filters.sizeMin && p.max === filters.sizeMax,
                      )?.value || ''
                    : ''
                }
                onChange={(v) => {
                  const preset = SIZE_PRESETS.find((p) => p.value === v);
                  if (preset) {
                    onChange(cleanFilters({ ...filters, sizeMin: preset.min, sizeMax: preset.max }));
                  }
                }}
                size="sm"
              />
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  value={filters.sizeMin !== undefined ? filters.sizeMin : ''}
                  onChange={(e) =>
                    onChange(
                      cleanFilters({
                        ...filters,
                        sizeMin: e.target.value ? Number(e.target.value) : undefined,
                      }),
                    )
                  }
                  className="flex-1 px-1.5 py-1 text-xs rounded-[3px] min-w-0"
                  style={{
                    background: 'var(--bg-primary)',
                    border: '1px solid var(--border-default)',
                    color: 'var(--text-primary)',
                  }}
                  placeholder="最小 (bytes)"
                  min={0}
                />
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>~</span>
                <input
                  type="number"
                  value={filters.sizeMax !== undefined ? filters.sizeMax : ''}
                  onChange={(e) =>
                    onChange(
                      cleanFilters({
                        ...filters,
                        sizeMax: e.target.value ? Number(e.target.value) : undefined,
                      }),
                    )
                  }
                  className="flex-1 px-1.5 py-1 text-xs rounded-[3px] min-w-0"
                  style={{
                    background: 'var(--bg-primary)',
                    border: '1px solid var(--border-default)',
                    color: 'var(--text-primary)',
                  }}
                  placeholder="最大 (bytes)"
                  min={0}
                />
              </div>
            </div>

          </div>
        </>,
        document.body,
      )}
    </div>
  );
};

export default SearchFilters;
