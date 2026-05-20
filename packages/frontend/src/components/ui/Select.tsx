import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import { ChevronDown, X, Check, Loader2, Search } from 'lucide-react';
import { Z_LAYERS } from '@/constants/layers';

export interface SelectOption {
  value: string;
  label: string;
  icon?: React.ElementType;
  disabled?: boolean;
}

interface SelectProps {
  value?: string;
  onChange?: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  clearable?: boolean;
  disabled?: boolean;
  loading?: boolean;
  searchable?: boolean;
  onSearch?: (query: string) => void;
  renderOption?: (option: SelectOption) => React.ReactNode;
  className?: string;
  wrapperClassName?: string;
  name?: string;
}

const sizeConfig = {
  xs: { cls: 'h-[20px] px-1.5 py-0 text-xs gap-1 rounded-[2px]', iconSize: 10, itemCls: 'px-2 py-1 text-xs', itemGap: 'gap-1.5' },
  sm: { cls: 'h-[22px] px-2 py-0.5 text-xs gap-1 rounded-[3px]', iconSize: 12, itemCls: 'px-2 py-1.5 text-xs', itemGap: 'gap-1.5' },
  md: { cls: 'h-[24px] px-2 py-1 text-xs gap-1.5 rounded-[3px]', iconSize: 14, itemCls: 'px-2.5 py-1.5 text-xs', itemGap: 'gap-2' },
  lg: { cls: 'h-[28px] px-2.5 py-1 text-sm gap-2 rounded-[4px]', iconSize: 16, itemCls: 'px-3 py-2 text-sm', itemGap: 'gap-2' },
};

const itemBaseCls = `
  relative flex items-center w-full rounded-md
  outline-none cursor-pointer select-none
  transition-colors duration-150
  data-[disabled]:opacity-50 data-[disabled]:cursor-not-allowed
  data-[highlighted]:bg-[rgba(255,255,255,0.05)]
  data-[highlighted]:text-[var(--text-primary)]
  data-[state=checked]:text-[var(--info)]
  data-[state=checked]:bg-[rgba(0,156,255,0.1)]
  data-[state=checked]:font-medium
`;

const SimpleSelect: React.FC<SelectProps> = ({
  value,
  onChange,
  options,
  placeholder = '请选择',
  size = 'md',
  clearable,
  disabled,
  loading,
  className,
  wrapperClassName,
  renderOption,
}) => {
  const cfg = sizeConfig[size];

  const handleClear = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onChange?.('');
  }, [onChange]);

  return (
    <SelectPrimitive.Root value={value} onValueChange={onChange} disabled={disabled}>
      <div className={`relative ${wrapperClassName || ''}`}>
        <SelectPrimitive.Trigger asChild>
          <button
            className={`
              flex items-center justify-between w-full
              transition-all duration-200
              ${cfg.cls}
              ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
              ${className || ''}
            `}
            style={{
              background: 'var(--bg-primary)',
              border: '1px solid var(--border-default)',
              color: 'var(--text-primary)',
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--primary-500)'; }}
            onBlur={(e) => {
              if (!e.currentTarget.dataset.state) {
                e.currentTarget.style.borderColor = 'var(--border-default)';
              }
            }}
          >
            <span className="flex-1 text-left truncate" style={{ color: value ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>
              <SelectPrimitive.Value placeholder={placeholder} />
            </span>

            <span className="flex items-center flex-shrink-0" style={{ gap: '2px' }}>
              {clearable && value && (
                <span
                  role="button"
                  tabIndex={-1}
                  onClick={handleClear}
                  className="flex items-center justify-center rounded-full transition-colors duration-150 hover:bg-[rgba(255,255,255,0.1)]"
                  style={{ width: cfg.iconSize + 4, height: cfg.iconSize + 4, color: 'var(--text-muted)' }}
                >
                  <X size={cfg.iconSize * 0.75} />
                </span>
              )}
              <SelectPrimitive.Icon>
                <ChevronDown size={cfg.iconSize} style={{ color: 'var(--text-muted)' }} />
              </SelectPrimitive.Icon>
            </span>
          </button>
        </SelectPrimitive.Trigger>

        <SelectPrimitive.Portal>
          <SelectPrimitive.Content
            className="min-w-[var(--radix-select-trigger-width)] rounded-xl p-1 shadow-xl overflow-hidden"
            style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-default)',
            zIndex: Z_LAYERS.POPUP,
            }}
            position="popper"
            sideOffset={4}
            align="start"
          >
            {loading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 size={16} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
              </div>
            ) : options.length === 0 ? (
              <div className="text-xs py-2 text-center" style={{ color: 'var(--text-muted)' }}>
                暂无数据
              </div>
            ) : (
              <SelectPrimitive.Viewport className="max-h-60">
                {options.map((option) => (
                  <SelectPrimitive.Item
                    key={option.value}
                    value={option.value}
                    disabled={option.disabled}
                    className={`${itemBaseCls} ${cfg.itemCls} ${cfg.itemGap}`}
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {option.icon && <option.icon size={14} style={{ flexShrink: 0 }} />}
                    <SelectPrimitive.ItemText>
                      {renderOption ? renderOption(option) : option.label}
                    </SelectPrimitive.ItemText>
                    <SelectPrimitive.ItemIndicator className="ml-auto flex-shrink-0">
                      <Check size={14} style={{ color: 'var(--info)' }} />
                    </SelectPrimitive.ItemIndicator>
                  </SelectPrimitive.Item>
                ))}
              </SelectPrimitive.Viewport>
            )}
          </SelectPrimitive.Content>
        </SelectPrimitive.Portal>

        {name && (
          <input type="hidden" name={name} value={value || ''} />
        )}
      </div>
    </SelectPrimitive.Root>
  );
};

const SearchableSelect: React.FC<SelectProps> = ({
  value,
  onChange,
  options,
  placeholder = '搜索...',
  size = 'md',
  clearable,
  disabled,
  loading,
  onSearch,
  className,
  wrapperClassName,
  renderOption,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const cfg = sizeConfig[size];

  const selectedOption = useMemo(
    () => options.find((o) => o.value === value),
    [options, value]
  );

  const filteredOptions = useMemo(() => {
    if (!searchQuery) return options;
    const q = searchQuery.toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, searchQuery]);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen]);

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value;
    setSearchQuery(q);
    onSearch?.(q);
  }, [onSearch]);

  const handleSelect = useCallback((option: SelectOption) => {
    onChange?.(option.value);
    setIsOpen(false);
    setSearchQuery('');
  }, [onChange]);

  const handleClear = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onChange?.('');
    setSearchQuery('');
  }, [onChange]);

  return (
    <div ref={containerRef} className={`relative ${wrapperClassName || ''}`}>
      <div
        className={`
          flex items-center justify-between w-full
          transition-all duration-200
          ${cfg.cls}
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
          ${className || ''}
        `}
        style={{
          background: 'var(--bg-primary)',
          border: `1px solid ${isOpen ? 'var(--primary-500)' : 'var(--border-default)'}`,
          color: 'var(--text-primary)',
        }}
        onClick={() => {
          if (!disabled) {
            setIsOpen(!isOpen);
          }
        }}
      >
        <span className="flex-1 text-left truncate" style={{ color: selectedOption ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <span className="flex items-center flex-shrink-0" style={{ gap: '2px' }}>
          {clearable && value && (
            <span
              role="button"
              tabIndex={-1}
              onClick={handleClear}
              className="flex items-center justify-center rounded-full transition-colors duration-150 hover:bg-[rgba(255,255,255,0.1)]"
              style={{ width: cfg.iconSize + 4, height: cfg.iconSize + 4, color: 'var(--text-muted)' }}
            >
              <X size={cfg.iconSize * 0.75} />
            </span>
          )}
          <ChevronDown size={cfg.iconSize} style={{ color: 'var(--text-muted)', flexShrink: 0, transition: 'transform 0.2s', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }} />
        </span>
      </div>

      {isOpen && (
        <div
          className="absolute w-full mt-1 rounded-xl p-1 shadow-xl overflow-hidden"
          style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-default)',
            zIndex: Z_LAYERS.POPUP,
          }}
        >
          <div
            className="flex items-center mx-1 mb-1 px-2 rounded-md"
            style={{
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <Search size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            <input
              ref={searchInputRef}
              value={searchQuery}
              onChange={handleSearchChange}
              placeholder={selectedOption?.label || placeholder}
              className="flex-1 bg-transparent outline-none min-w-0 py-1.5 pl-1.5 text-xs"
              style={{ color: 'var(--text-primary)' }}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setIsOpen(false);
                }
                if (e.key === 'Enter' && filteredOptions.length > 0) {
                  handleSelect(filteredOptions[0]);
                }
              }}
            />
            {searchQuery && (
              <span
                role="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.stopPropagation();
                  setSearchQuery('');
                  onSearch?.('');
                }}
                className="flex items-center justify-center rounded-full transition-colors duration-150 hover:bg-[rgba(255,255,255,0.1)]"
                style={{ width: 16, height: 16, color: 'var(--text-muted)' }}
              >
                <X size={10} />
              </span>
            )}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 size={16} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
            </div>
          ) : filteredOptions.length === 0 ? (
            <div className="text-xs py-2 text-center" style={{ color: 'var(--text-muted)' }}>
              暂无数据
            </div>
          ) : (
            <div className="max-h-60 overflow-y-auto">
              {filteredOptions.map((option) => {
                const isSelected = option.value === value;
                return (
                  <div
                    key={option.value}
                    className={`flex items-center ${cfg.itemCls} ${cfg.itemGap} rounded-md cursor-pointer select-none transition-colors duration-150 ${option.disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                    style={{
                      color: isSelected ? 'var(--info)' : 'var(--text-secondary)',
                      background: isSelected ? 'rgba(0, 156, 255, 0.1)' : 'transparent',
                    }}
                    onClick={() => {
                      if (!option.disabled) {
                        handleSelect(option);
                      }
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected && !option.disabled) {
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                        e.currentTarget.style.color = 'var(--text-primary)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected && !option.disabled) {
                        e.currentTarget.style.background = 'transparent';
                        e.currentTarget.style.color = 'var(--text-secondary)';
                      }
                    }}
                  >
                    {option.icon && <option.icon size={14} style={{ flexShrink: 0 }} />}
                    <span className="flex-1 truncate">
                      {renderOption ? renderOption(option) : option.label}
                    </span>
                    {isSelected && (
                      <Check size={14} style={{ color: 'var(--info)', flexShrink: 0 }} />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export const Select: React.FC<SelectProps> = (props) => {
  if (props.searchable) {
    return <SearchableSelect {...props} />;
  }
  return <SimpleSelect {...props} />;
};

Select.displayName = 'Select';

export default Select;
