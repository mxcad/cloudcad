import type React from 'react';
import { Search, Loader2, X } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { Z_LAYERS } from '@/constants/layers';

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
  value = '',
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
                className="flex items-center justify-center rounded-full transition-colors duration-150 hover:bg-[rgba(255,255,255,0.1)]"
                style={{ color: 'var(--text-muted)', width: 18, height: 18 }}
                title="清除"
              >
                <X size={12} />
              </button>
            )}
          </>
        }
      />
      {open && (
        <div
          className="absolute w-full mt-1 rounded-xl p-1 shadow-xl overflow-hidden"
          style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-default)',
            zIndex: Z_LAYERS.POPUP,
            maxHeight: 280,
            overflowY: 'auto',
          }}
        >
          {loading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 size={16} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
            </div>
          ) : items.length === 0 ? (
            <div className="text-xs py-2 text-center" style={{ color: 'var(--text-muted)' }}>
              暂无数据
            </div>
          ) : (
            items.map((item) => (
              <button
                key={getItemKey?.(item) ?? item.key}
                type="button"
                className="w-full flex items-center px-2.5 py-1.5 text-xs rounded-md transition-colors duration-150"
                style={{ color: 'var(--text-secondary)' }}
                onClick={() => onSelectItem(item)}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                  e.currentTarget.style.color = 'var(--text-primary)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = 'var(--text-secondary)';
                }}
              >
                {renderItem ? renderItem(item) : item.label}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
};

Autocomplete.displayName = 'Autocomplete';

export default Autocomplete;
