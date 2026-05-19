import type React from 'react';
import { Search, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/Input';

export interface AutocompleteItem {
  key: string;
  label: string;
  [key: string]: unknown;
}

interface AutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onSearch?: (value: string) => void;
  loading?: boolean;
  items: AutocompleteItem[];
  onSelectItem: (item: AutocompleteItem) => void;
  placeholder?: string;
  renderItem?: (item: AutocompleteItem) => React.ReactNode;
  getItemKey?: (item: AutocompleteItem) => string;
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
  wrapperClassName?: string;
}

export const Autocomplete: React.FC<AutocompleteProps> = ({
  value,
  onChange,
  onSearch,
  loading = false,
  items,
  onSelectItem,
  placeholder = '搜索...',
  renderItem,
  getItemKey,
  open,
  onOpenChange,
  className = '',
  wrapperClassName = '',
}) => {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      onSearch?.(value);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
  };

  const handleClear = () => {
    onChange('');
  };

  const showClear = value.length > 0 && !loading;

  return (
    <div className={`relative ${wrapperClassName}`}>
      <Input
        leftIcon={Search}
        value={value}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        autoComplete="off"
        className={className}
        rightNode={
          <>
            {loading && (
              <Loader2
                size={14}
                className="animate-spin"
                style={{ color: 'var(--text-muted)' }}
              />
            )}
            {showClear && !loading && (
              <button
                type="button"
                onClick={handleClear}
                className="p-1 rounded-lg transition-all duration-200"
                style={{ color: 'var(--text-muted)' }}
                title="清除"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            )}
          </>
        }
      />
      {open && items.length > 0 && (
        <div
          className="absolute z-10 w-full mt-1 rounded-xl shadow-lg max-h-60 overflow-y-auto"
          style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-default)',
          }}
        >
          {items.map((item) => (
            <button
              key={getItemKey?.(item) ?? item.key}
              type="button"
              className="w-full px-3 py-2 text-left text-sm transition-colors duration-150 last:border-b-0"
              style={{
                color: 'var(--text-secondary)',
                borderBottom: '1px solid var(--border-subtle)',
              }}
              onClick={() => onSelectItem(item)}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--bg-tertiary)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              {renderItem ? renderItem(item) : item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

Autocomplete.displayName = 'Autocomplete';

export default Autocomplete;
