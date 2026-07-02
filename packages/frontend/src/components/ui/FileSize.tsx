import React, { useState, useCallback } from 'react';

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;
export type SizeUnit = (typeof UNITS)[number];
const BASE = 1024;
const MAX_SAFE_BYTES = Number.MAX_SAFE_INTEGER;
const MAX_DISPLAY_DECIMALS = 4;

export function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes) return '-';
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(BASE)), UNITS.length - 1);
  return parseFloat((bytes / Math.pow(BASE, i)).toFixed(2)) + ' ' + UNITS[i];
}

export function toBytes(value: number, unit: SizeUnit): number {
  const bytes = Math.round(value * Math.pow(BASE, UNITS.indexOf(unit)));
  if (bytes > MAX_SAFE_BYTES) return MAX_SAFE_BYTES;
  return bytes;
}

export function fromBytes(bytes: number, unit: SizeUnit): number {
  return bytes / Math.pow(BASE, UNITS.indexOf(unit));
}

export function autoUnit(bytes: number): SizeUnit {
  if (bytes <= 0) return 'B';
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(BASE)), UNITS.length - 1);
  return UNITS[i]!;
}

function toDisplayValue(bytes: number | undefined, unit: SizeUnit): string {
  if (bytes === undefined) return '';
  const raw = fromBytes(bytes, unit);
  if (raw === 0) return '0';
  if (Math.abs(raw) < 0.0001) return raw.toExponential(MAX_DISPLAY_DECIMALS);
  return parseFloat(raw.toFixed(MAX_DISPLAY_DECIMALS)).toString();
}

export interface FileSizeProps {
  bytes: number | null | undefined;
  className?: string;
}

export const FileSize: React.FC<FileSizeProps> = ({ bytes, className }) => {
  return <span className={className}>{formatFileSize(bytes)}</span>;
};

export interface FileSizeInputProps {
  value: number | undefined;
  onChange: (bytes: number | undefined) => void;
  unit?: SizeUnit;
  onUnitChange?: (unit: SizeUnit) => void;
  className?: string;
  placeholder?: string;
  min?: number;
  step?: number;
  defaultUnit?: SizeUnit;
  units?: SizeUnit[];
}

export const FileSizeInput: React.FC<FileSizeInputProps> = ({
  value,
  onChange,
  unit: externalUnit,
  onUnitChange,
  className = '',
  placeholder,
  min,
  step = 0.01,
  defaultUnit = 'MB',
  units: allowedUnits,
}) => {
  const unitList = allowedUnits || UNITS;
  const [internalUnit, setInternalUnit] = useState<SizeUnit>(
    unitList.includes(defaultUnit) ? defaultUnit : unitList[0]!,
  );
  const unit = externalUnit ?? internalUnit;

  const displayValue = toDisplayValue(value, unit);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      if (raw && Number(raw) < 0) return;
      onChange(raw ? toBytes(Number(raw), unit) : undefined);
    },
    [unit, onChange],
  );

  const handleUnitChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const newUnit = e.target.value as SizeUnit;
      setInternalUnit(newUnit);
      onUnitChange?.(newUnit);
    },
    [onUnitChange],
  );

  return (
    <div className={`flex items-center gap-0 ${className ?? ''}`}>
      <input
        type="number"
        value={displayValue}
        onChange={handleChange}
        placeholder={placeholder}
        min={min !== undefined ? fromBytes(min, unit) : undefined}
        step={step}
        className="flex-1 px-1.5 py-1 text-xs rounded-l-[3px] min-w-0"
        style={{
          background: 'var(--bg-primary)',
          border: '1px solid var(--border-default)',
          borderRight: 'none',
          color: 'var(--text-primary)',
          outline: 'none',
          boxShadow: 'none',
        }}
      />
      <select
        value={unit}
        onChange={handleUnitChange}
        className="px-1 py-1 text-xs rounded-r-[3px] cursor-pointer shrink-0"
        style={{
          background: 'var(--bg-tertiary)',
          border: '1px solid var(--border-default)',
          color: 'var(--text-tertiary)',
          outline: 'none',
        }}
      >
        {unitList.map((u) => (
          <option key={u} value={u}>{u}</option>
        ))}
      </select>
    </div>
  );
};

export default FileSize;
