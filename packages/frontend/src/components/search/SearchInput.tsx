import type React from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import type { InputProps } from '@/components/ui/Input';

export interface SearchInputProps extends Omit<InputProps, 'leftIcon' | 'rightIcon' | 'rightNode'> {
  onSearch?: (value: string) => void;
  onClear?: () => void;
}

export const SearchInput: React.FC<SearchInputProps> = ({
  value,
  onChange,
  onSearch,
  onClear,
  placeholder = '搜索...',
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
      const synthetic = { target: { value: '' } } as React.ChangeEvent<HTMLInputElement>;
      onChange(synthetic);
    }
  };

  const showClear = value !== undefined && value !== '';

  return (
    <Input
      leftIcon={Search}
      value={value}
      onChange={onChange}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      rightNode={showClear ? (
        <button
          type="button"
          onClick={handleClear}
          className="p-1 rounded-[3px] transition-all duration-200 hover:bg-[var(--bg-tertiary)]"
          style={{ color: 'var(--text-muted)' }}
          title="清除"
        >
          <X size={14} />
        </button>
      ) : undefined}
      {...props}
    />
  );
};

SearchInput.displayName = 'SearchInput';

export default SearchInput;
