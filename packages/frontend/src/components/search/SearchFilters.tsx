import React, { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Filter, X, Calendar, CalendarPlus, FileText, Ruler, ArrowUpDown } from 'lucide-react';
import { Select } from '@/components/ui/Select';
import { Tooltip } from '@/components/ui/Tooltip';
import { Z_LAYERS } from '@/constants/layers';
import { formatFileSize, toBytes, FileSizeInput, type SizeUnit } from '@/components/ui/FileSize';
import { t, $t } from '@/languages';
import { useIsMobile } from '@/hooks/useIsMobile';

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

function getExtOptions() {
  return [
    { value: '.dwg', label: t("DWG 图纸") },
    { value: '.dxf', label: t("DXF 图纸") },
    { value: '.mxweb', label: t("MXWEB 文件") },
  ];
}

function getSizePresets(): { value: string; label: string; min?: number; max?: number }[] {
  return [
    { value: '', label: t("全部大小") },
    { value: 'lt1mb', label: '< 1 MB', max: toBytes(1, 'MB') },
    { value: '1mb-10mb', label: '1 MB - 10 MB', min: toBytes(1, 'MB'), max: toBytes(10, 'MB') },
    { value: '10mb-100mb', label: '10 MB - 100 MB', min: toBytes(10, 'MB'), max: toBytes(100, 'MB') },
    { value: 'gt100mb', label: '> 100 MB', min: toBytes(100, 'MB') },
  ];
}

function getTimePresets(): { value: string; label: string }[] {
  return [
    { value: '', label: t("不限") },
    { value: '-1d', label: t("今天") },
    { value: '-7d', label: t("最近 7 天") },
    { value: '-30d', label: t("最近 30 天") },
    { value: '-90d', label: t("最近 90 天") },
  ];
}

function getSortOptions(): { value: string; label: string; sortBy: string; sortOrder: 'asc' | 'desc' }[] {
  return [
    { value: '',                  label: t("默认排序"),       sortBy: 'updatedAt', sortOrder: 'desc' },
    { value: 'updatedAt|desc',    label: t("更新时间 ↑"),     sortBy: 'updatedAt', sortOrder: 'desc' },
    { value: 'updatedAt|asc',     label: t("更新时间 ↓"),     sortBy: 'updatedAt', sortOrder: 'asc' },
    { value: 'createdAt|desc',    label: t("创建时间 ↑"),     sortBy: 'createdAt', sortOrder: 'desc' },
    { value: 'createdAt|asc',     label: t("创建时间 ↓"),     sortBy: 'createdAt', sortOrder: 'asc' },
    { value: 'name|asc',          label: t("名称 A-Z"),       sortBy: 'name',      sortOrder: 'asc' },
    { value: 'name|desc',         label: t("名称 Z-A"),       sortBy: 'name',      sortOrder: 'desc' },
    { value: 'size|asc',          label: t("从小到大"),       sortBy: 'size',      sortOrder: 'asc' },
    { value: 'size|desc',         label: t("从大到小"),       sortBy: 'size',      sortOrder: 'desc' },
  ];
}

function getProjectSortOptions(): { value: string; label: string; sortBy: string; sortOrder: 'asc' | 'desc' }[] {
  return [
    { value: '',                  label: t("默认排序"),       sortBy: 'updatedAt', sortOrder: 'desc' },
    { value: 'updatedAt|desc',    label: t("更新时间 ↑"),     sortBy: 'updatedAt', sortOrder: 'desc' },
    { value: 'updatedAt|asc',     label: t("更新时间 ↓"),     sortBy: 'updatedAt', sortOrder: 'asc' },
    { value: 'createdAt|desc',    label: t("创建时间 ↑"),     sortBy: 'createdAt', sortOrder: 'desc' },
    { value: 'createdAt|asc',     label: t("创建时间 ↓"),     sortBy: 'createdAt', sortOrder: 'asc' },
    { value: 'name|asc',          label: t("名称 A-Z"),       sortBy: 'name',      sortOrder: 'asc' },
    { value: 'name|desc',         label: t("名称 Z-A"),       sortBy: 'name',      sortOrder: 'desc' },
    { value: 'size|asc',          label: t("从小到大"),       sortBy: 'size',      sortOrder: 'asc' },
    { value: 'size|desc',         label: t("从大到小"),       sortBy: 'size',      sortOrder: 'desc' },
  ];
}

const SIZE_PRESETS: { value: string; label: string; min?: number; max?: number }[] = [
  { value: '', label: t("全部大小") },
  { value: 'lt1mb', label: '< 1 MB', max: toBytes(1, 'MB') },
  { value: '1mb-10mb', label: '1 MB - 10 MB', min: toBytes(1, 'MB'), max: toBytes(10, 'MB') },
  { value: '10mb-100mb', label: '10 MB - 100 MB', min: toBytes(10, 'MB'), max: toBytes(100, 'MB') },
  { value: 'gt100mb', label: '> 100 MB', min: toBytes(100, 'MB') },
];

const timePresets: { value: string; label: string }[] = [
  { value: '', label: t("不限") },
  { value: '-1d', label: t("今天") },
  { value: '-7d', label: t("最近 7 天") },
  { value: '-30d', label: t("最近 30 天") },
  { value: '-90d', label: t("最近 90 天") },
];

const sortOptions: { value: string; label: string; sortBy: string; sortOrder: 'asc' | 'desc' }[] = [
  { value: '',                  label: t("默认排序"),       sortBy: 'updatedAt', sortOrder: 'desc' },
  { value: 'updatedAt|desc',    label: t("更新时间 ↑"),     sortBy: 'updatedAt', sortOrder: 'desc' },
  { value: 'updatedAt|asc',     label: t("更新时间 ↓"),     sortBy: 'updatedAt', sortOrder: 'asc' },
  { value: 'createdAt|desc',    label: t("创建时间 ↑"),     sortBy: 'createdAt', sortOrder: 'desc' },
  { value: 'createdAt|asc',     label: t("创建时间 ↓"),     sortBy: 'createdAt', sortOrder: 'asc' },
  { value: 'name|asc',          label: t("名称 A-Z"),       sortBy: 'name',      sortOrder: 'asc' },
  { value: 'name|desc',         label: t("名称 Z-A"),       sortBy: 'name',      sortOrder: 'desc' },
  { value: 'size|asc',          label: t("从小到大"),       sortBy: 'size',      sortOrder: 'asc' },
  { value: 'size|desc',         label: t("从大到小"),       sortBy: 'size',      sortOrder: 'desc' },
];

const projectSortOptions: { value: string; label: string; sortBy: string; sortOrder: 'asc' | 'desc' }[] = [
  { value: '',                  label: t("默认排序"),       sortBy: 'updatedAt', sortOrder: 'desc' },
  { value: 'updatedAt|desc',    label: t("更新时间 ↑"),     sortBy: 'updatedAt', sortOrder: 'desc' },
  { value: 'updatedAt|asc',     label: t("更新时间 ↓"),     sortBy: 'updatedAt', sortOrder: 'asc' },
  { value: 'createdAt|desc',    label: t("创建时间 ↑"),     sortBy: 'createdAt', sortOrder: 'desc' },
  { value: 'createdAt|asc',     label: t("创建时间 ↓"),     sortBy: 'createdAt', sortOrder: 'asc' },
  { value: 'name|asc',          label: t("名称 A-Z"),       sortBy: 'name',      sortOrder: 'asc' },
  { value: 'name|desc',         label: t("名称 Z-A"),       sortBy: 'name',      sortOrder: 'desc' },
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

function getSizeLabel(min?: number, max?: number): string | undefined {
  if (min !== undefined && max !== undefined) return `${formatFileSize(min)} ~ ${formatFileSize(max)}`;
  if (min !== undefined) return `> ${formatFileSize(min)}`;
  if (max !== undefined) return `< ${formatFileSize(max)}`;
  return undefined;
}

function getDateLabel(from?: string, to?: string): string | undefined {
  if (from && to) return `${from.slice(0, 10)} ~ ${to.slice(0, 10)}`;
  if (from) return $t("从 {date}", { date: from.slice(0, 10) });
  if (to) return $t("到 {date}", { date: to.slice(0, 10) });
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
  scope?: 'project' | 'project_files',
): FilterChip[] {
  const chips: FilterChip[] = [];

  // 文件专属过滤（项目模式不显示）
  if (scope !== 'project') {
    if (filters.extensions && filters.extensions.length > 0) {
      chips.push({
        key: 'extensions',
        label: $t("格式: {ext}", { ext: filters.extensions.join(', ') }),
        onRemove: () => onChange(cleanFilters({ ...filters, extensions: undefined })),
      });
    }

    if (filters.timeRange) {
      const opt = getTimePresets().find((o) => o.value === filters.timeRange);
      chips.push({
        key: 'timeRange',
        label: $t("修改: {label}", { label: opt?.label || filters.timeRange }),
        onRemove: () => onChange(cleanFilters({ ...filters, timeRange: undefined })),
      });
    }

    const modifiedLabel = getDateLabel(filters.modifiedAtFrom, filters.modifiedAtTo);
    if (modifiedLabel) {
      chips.push({
        key: 'modifiedAt',
        label: $t("修改: {label}", { label: modifiedLabel }),
        onRemove: () => onChange(cleanFilters({ ...filters, modifiedAtFrom: undefined, modifiedAtTo: undefined })),
      });
    }

    const createdLabel = getDateLabel(filters.createdAtFrom, filters.createdAtTo);
    if (createdLabel) {
      chips.push({
        key: 'createdAt',
        label: $t("创建: {label}", { label: createdLabel }),
        onRemove: () => onChange(cleanFilters({ ...filters, createdAtFrom: undefined, createdAtTo: undefined })),
      });
    }

    const sizeLabel = getSizeLabel(filters.sizeMin, filters.sizeMax);
    if (sizeLabel) {
      chips.push({
        key: 'size',
        label: $t("大小: {label}", { label: sizeLabel }),
        onRemove: () => onChange(cleanFilters({ ...filters, sizeMin: undefined, sizeMax: undefined })),
      });
    }
  }

  if (filters.sortBy) {
    const opts = scope === 'project' ? getProjectSortOptions() : getSortOptions();
    const sortOption = opts.find(
      (o) => o.sortBy === filters.sortBy && o.sortOrder === filters.sortOrder,
    );
    chips.push({
      key: 'sort',
        label: $t("排序: {label}", { label: sortOption?.label || `${filters.sortBy} ${filters.sortOrder}` }),
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
  const [sizeUnit, setSizeUnit] = useState<SizeUnit>('MB');
  const isMobile = useIsMobile();

  const closePanel = useCallback(() => {
    setOpen(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    const closeOnScroll = () => closePanel();
    const closeOnResize = () => closePanel();
    window.addEventListener('scroll', closeOnScroll, true);
    window.addEventListener('resize', closeOnResize);
    return () => {
      window.removeEventListener('scroll', closeOnScroll, true);
      window.removeEventListener('resize', closeOnResize);
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
    if (isMobile) {
      setPanelStyle({});
    } else {
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
    }
    setOpen(true);
  }, [isMobile]);

  const panelContent = (
    <>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
          {t("筛选排序")}
        </span>
        <div className="flex items-center gap-2">
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearAll}
              className="text-xs hover:underline cursor-pointer"
              style={{ color: 'var(--info)' }}
            >
              {t("重置")}
            </button>
          )}
          {isMobile && (
            <button
              type="button"
              onClick={closePanel}
              className="p-0.5 rounded hover:bg-[var(--bg-tertiary)]"
              style={{ color: 'var(--text-muted)' }}
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="block text-xs" style={{ color: 'var(--text-tertiary)' }}>
          <ArrowUpDown size={12} className="inline mr-1" />
          {t("排序")}
        </label>
        <Select
          options={scope === 'project' ? getProjectSortOptions() : getSortOptions()}
          value={getCurrentSortValue(filters.sortBy, filters.sortOrder)}
          onChange={(v) => {
            const parsed = parseSortValue(v);
            onChange(cleanFilters({ ...filters, ...parsed }));
          }}
          size="sm"
        />
      </div>

      {scope === 'project_files' && (
        <div className="space-y-1.5">
          <label className="block text-xs" style={{ color: 'var(--text-tertiary)' }}>
            <FileText size={12} className="inline mr-1" />
            {t("文件格式（多选）")}
          </label>
          <CheckboxList
            options={getExtOptions()}
            selected={filters.extensions || []}
            onChange={(v) => onChange(cleanFilters({ ...filters, extensions: v.length > 0 ? v : undefined }))}
          />
        </div>
      )}

      {scope === 'project_files' && (
      <div className="space-y-1.5">
        <label className="block text-xs" style={{ color: 'var(--text-tertiary)' }}>
          <Ruler size={12} className="inline mr-1" />
            {t("文件大小")}
          </label>
        <Select
          options={getSizePresets()}
          value={
            filters.sizeMin !== undefined || filters.sizeMax !== undefined
              ? getSizePresets().find(
                  (p) => p.min === filters.sizeMin && p.max === filters.sizeMax,
                )?.value || ''
              : ''
          }
          onChange={(v) => {
            const preset = getSizePresets().find((p) => p.value === v);
            if (preset) {
              onChange(cleanFilters({ ...filters, sizeMin: preset.min, sizeMax: preset.max }));
            }
          }}
          size="sm"
        />
        <div className="flex items-center gap-1">
          <FileSizeInput
            className="flex-1 min-w-0"
            value={filters.sizeMin}
            onChange={(v) => onChange(cleanFilters({ ...filters, sizeMin: v }))}
            unit={sizeUnit}
            onUnitChange={setSizeUnit}
            placeholder={t("最小")}
            min={0}
          />
          <span className="text-xs shrink-0" style={{ color: 'var(--text-muted)' }}>~</span>
          <FileSizeInput
            className="flex-1 min-w-0"
            value={filters.sizeMax}
            onChange={(v) => onChange(cleanFilters({ ...filters, sizeMax: v }))}
            unit={sizeUnit}
            onUnitChange={setSizeUnit}
            placeholder={t("最大")}
            min={0}
          />
        </div>
      </div>
      )}

      {scope === 'project_files' && (
        <div className="border-t" style={{ borderColor: 'var(--border-subtle)' }} />
      )}

      {scope === 'project_files' && (
      <div className="space-y-1.5">
        <label className="block text-xs" style={{ color: 'var(--text-tertiary)' }}>
          <Calendar size={12} className="inline mr-1" />
          {t("修改时间")}
          </label>
        <div className="flex items-center gap-1">
          <span className="text-xs shrink-0" style={{ color: 'var(--text-tertiary)' }}>{t("起")}</span>
          <input
            type="date"
            value={filters.modifiedAtFrom ? filters.modifiedAtFrom.slice(0, 10) : ''}
            onChange={(e) =>
              onChange(cleanFilters({ ...filters, modifiedAtFrom: e.target.value || undefined, timeRange: undefined }))
            }
            className="flex-1 px-1.5 py-1 text-xs rounded-[3px] min-w-0"
            style={{
              background: 'var(--bg-primary)',
              border: '1px solid var(--border-default)',
              color: 'var(--text-primary)',
            }}
          />
          <span className="text-xs shrink-0" style={{ color: 'var(--text-muted)' }}>~</span>
          <input
            type="date"
            value={filters.modifiedAtTo ? filters.modifiedAtTo.slice(0, 10) : ''}
            onChange={(e) =>
              onChange(cleanFilters({ ...filters, modifiedAtTo: e.target.value || undefined, timeRange: undefined }))
            }
            className="flex-1 px-1.5 py-1 text-xs rounded-[3px] min-w-0"
            style={{
              background: 'var(--bg-primary)',
              border: '1px solid var(--border-default)',
              color: 'var(--text-primary)',
            }}
          />
          <span className="text-xs shrink-0" style={{ color: 'var(--text-tertiary)' }}>{t("止")}</span>
        </div>
        <div className="flex flex-wrap gap-1">
          {getTimePresets().slice(1).map((p) => (
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
      )}

      {scope === 'project_files' && (
      <div className="space-y-1.5">
        <label className="block text-xs" style={{ color: 'var(--text-tertiary)' }}>
          <CalendarPlus size={12} className="inline mr-1" />
          {t("创建时间")}
          </label>
        <div className="flex items-center gap-1">
          <span className="text-xs shrink-0" style={{ color: 'var(--text-tertiary)' }}>{t("起")}</span>
          <input
            type="date"
            value={filters.createdAtFrom ? filters.createdAtFrom.slice(0, 10) : ''}
            onChange={(e) =>
              onChange(cleanFilters({ ...filters, createdAtFrom: e.target.value || undefined }))
            }
            className="flex-1 px-1.5 py-1 text-xs rounded-[3px] min-w-0"
            style={{
              background: 'var(--bg-primary)',
              border: '1px solid var(--border-default)',
              color: 'var(--text-primary)',
            }}
          />
          <span className="text-xs shrink-0" style={{ color: 'var(--text-muted)' }}>~</span>
          <input
            type="date"
            value={filters.createdAtTo ? filters.createdAtTo.slice(0, 10) : ''}
            onChange={(e) =>
              onChange(cleanFilters({ ...filters, createdAtTo: e.target.value || undefined }))
            }
            className="flex-1 px-1.5 py-1 text-xs rounded-[3px] min-w-0"
            style={{
              background: 'var(--bg-primary)',
              border: '1px solid var(--border-default)',
              color: 'var(--text-primary)',
            }}
          />
          <span className="text-xs shrink-0" style={{ color: 'var(--text-tertiary)' }}>{t("止")}</span>
        </div>
      </div>
      )}
    </>
  );

  return (
    <div className="inline-flex">
      <div ref={buttonRef} className="flex items-center gap-1">
        <Tooltip content={hasActiveFilters ? t("已启用筛选条件") : t("筛选条件")} disabled={open}>
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
          <Tooltip content={t("清除筛选")} disabled={open}>
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

          {isMobile ? (
            <div
              className="fixed bottom-0 left-0 right-0 rounded-t-2xl shadow-2xl overflow-y-auto mobile-filter-panel"
              style={{
                zIndex: Z_LAYERS.POPUP,
                background: 'var(--bg-elevated)',
                maxHeight: '80vh',
                paddingBottom: 'env(safe-area-inset-bottom, 0px)',
              }}
            >
              <div className="p-4 space-y-4">
                {panelContent}
              </div>
            </div>
          ) : (
            <div
              className="p-3 rounded-lg shadow-lg space-y-3 min-w-[300px] max-h-[80vh] overflow-y-auto"
              style={{
                ...panelStyle,
                zIndex: Z_LAYERS.POPUP,
                background: 'var(--bg-primary)',
                border: '1px solid var(--border-default)',
              }}
            >
              {panelContent}
            </div>
          )}
        </>,
        document.body,
      )}
    </div>
  );
};

export default SearchFilters;
