import React from 'react';
import { Search, X } from 'lucide-react';
import { Tooltip } from '@/components/ui/Tooltip';
import { Input } from '@/components/ui/Input';
import type { InputProps } from '@/components/ui/Input';
import { t } from '@/languages';

export interface Chip {
  key: string;
  label: string;
  onRemove: () => void;
}

export interface SearchInputProps extends Omit<
  InputProps,
  'leftIcon' | 'rightIcon' | 'rightNode'
> {
  onSearch?: (value: string) => void;
  onClear?: () => void;
  chips?: Chip[];
}

export const SearchInput: React.FC<SearchInputProps> = ({
  value,
  onChange,
  onSearch,
  onClear,
  chips,
  placeholder = t('搜索...'),
  ...props
}) => {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      onSearch?.(String(value));
    }
    props.onKeyDown?.(e);
  };

  const handleClear = () => {
    if (onClear) {
      onClear();
    } else if (onChange) {
      const synthetic = {
        target: { value: '' },
      } as React.ChangeEvent<HTMLInputElement>;
      onChange(synthetic);
    }
  };

  const showClear = value !== undefined && value !== '';

  return (
    <div className="relative flex-1 min-w-0">
      <Input
        leftIcon={Search}
        value={value}
        onChange={onChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rightNode={
          showClear ? (
            <Tooltip content={t('清除')}>
              <button
                type="button"
                onClick={handleClear}
                className="p-1 rounded-[3px] transition-all duration-200 hover:bg-[var(--bg-tertiary)]"
                style={{ color: 'var(--text-muted)' }}
              >
                <X size={14} />
              </button>
            </Tooltip>
          ) : undefined
        }
        {...props}
      />

      {chips && chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
          {chips.map((chip) => (
            <span
              key={chip.key}
              className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full transition-colors duration-150 hover:opacity-80"
              style={{
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-secondary)',
              }}
            >
              {chip.label}
              <button
                type="button"
                onClick={chip.onRemove}
                className="flex items-center justify-center rounded-full hover:bg-[var(--bg-elevated)] transition-colors"
                style={{ width: 14, height: 14 }}
              >
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

SearchInput.displayName = 'SearchInput';

export default SearchInput;
