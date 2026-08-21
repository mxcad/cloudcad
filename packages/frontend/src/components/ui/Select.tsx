import React, {
  useState,
  useCallback,
  useMemo,
  useRef,
  useEffect,
} from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import { ChevronDown, X, Check, Loader2, Search } from 'lucide-react';
import { Z_LAYERS } from '@/constants/layers';
import { t } from '@/languages';

export interface SelectOption {
  value: string | number;
  label: string;
  icon?: React.ElementType;
  disabled?: boolean;
}

interface SelectProps {
  value?: string | number;
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
  xs: {
    cls: 'h-[20px] px-1.5 py-0 text-xs gap-1 rounded-[2px]',
    iconSize: 10,
    itemCls: 'px-2 py-1 text-xs',
    itemGap: 'gap-1.5',
  },
  sm: {
    cls: 'h-[22px] px-2 py-0.5 text-xs gap-1 rounded-[3px]',
    iconSize: 12,
    itemCls: 'px-2 py-1.5 text-xs',
    itemGap: 'gap-1.5',
  },
  md: {
    cls: 'h-[24px] px-2 py-1 text-xs gap-1.5 rounded-[3px]',
    iconSize: 14,
    itemCls: 'px-2.5 py-1.5 text-xs',
    itemGap: 'gap-2',
  },
  lg: {
    cls: 'h-[28px] px-2.5 py-1 text-sm gap-2 rounded-[4px]',
    iconSize: 16,
    itemCls: 'px-3 py-2 text-sm',
    itemGap: 'gap-2',
  },
};

const itemBaseCls = `
  relative flex items-center w-full rounded-md
  outline-none cursor-pointer select-none
  transition-colors duration-150
  data-[disabled]:opacity-50 data-[disabled]:cursor-not-allowed
  data-[highlighted]:bg-[var(--menu-highlight)]
  data-[highlighted]:text-[var(--text-primary)]
  data-[state=checked]:text-[var(--info)]
  data-[state=checked]:bg-[rgba(0,156,255,0.1)]
  data-[state=checked]:font-medium
`;

const SimpleSelect: React.FC<SelectProps> = ({
  value,
  onChange,
  options,
  placeholder = t('请选择'),
  size = 'md',
  clearable,
  disabled,
  loading,
  className,
  wrapperClassName,
  renderOption,
  name,
}) => {
  const cfg = sizeConfig[size];

  const handleClear = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onChange?.('');
    },
    [onChange]
  );

  // 选中项显示文本：自渲染替代 Radix SelectValue。
  // Radix SelectValue 内部 useComposedRefs(forwardedRef, setValueNode) 的回调引用每次渲染
  // 都重建，React 19 下任何一次重渲染都会触发 detach(null)+attach(node) 的 setState 循环
  // （Maximum update depth exceeded，ADR-0052 用户管理页打开即崩根因），自渲染彻底绕开。
  const displayLabel = useMemo(() => {
    if (value === undefined || value === '') return placeholder;
    const option = options.find((o) => String(o.value) === String(value));
    if (!option) return placeholder;
    return renderOption ? renderOption(option) : option.label;
  }, [value, options, placeholder, renderOption]);

  return (
    <SelectPrimitive.Root
      value={value !== undefined ? String(value) : undefined}
      onValueChange={(strVal) => onChange?.(strVal)}
      disabled={disabled}
    >
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
            onFocus={(e) => {
              e.currentTarget.style.borderColor = 'var(--primary-500)';
            }}
            onBlur={(e) => {
              if (!e.currentTarget.dataset.state) {
                e.currentTarget.style.borderColor = 'var(--border-default)';
              }
            }}
          >
            <span
              className="flex-1 text-left truncate"
              style={{
                color:
                  value !== undefined && value !== ''
                    ? 'var(--text-primary)'
                    : 'var(--text-tertiary)',
              }}
            >
              {displayLabel}
            </span>

            <span
              className="flex items-center flex-shrink-0"
              style={{ gap: '2px' }}
            >
              {clearable && value && (
                <span
                  role="button"
                  tabIndex={-1}
                  aria-label={t('清除')}
                  onClick={handleClear}
                  // 必须拦截 pointerdown 冒泡到 Radix Trigger：Radix 的 onPointerDown
                  // 会 preventDefault（打开下拉），而 pointerdown 的 preventDefault
                  // 会抑制后续 click 派发 → handleClear 永不执行、无法清除
                  onPointerDown={(e) => e.stopPropagation()}
                  className="flex items-center justify-center rounded-full transition-colors duration-150 hover:bg-[rgba(255,255,255,0.1)]"
                  style={{
                    width: cfg.iconSize + 4,
                    height: cfg.iconSize + 4,
                    color: 'var(--text-muted)',
                  }}
                >
                  <X size={cfg.iconSize * 0.75} />
                </span>
              )}
              <SelectPrimitive.Icon>
                <ChevronDown
                  size={cfg.iconSize}
                  style={{ color: 'var(--text-muted)' }}
                />
              </SelectPrimitive.Icon>
            </span>
          </button>
        </SelectPrimitive.Trigger>

        <SelectPrimitive.Portal>
          <SelectPrimitive.Content
            className="min-w-[var(--radix-select-trigger-width)] rounded-xl p-1 shadow-xl overflow-hidden"
            style={{
              background: 'var(--menu-bg)',
              border: '1px solid var(--border-default)',
              zIndex: Z_LAYERS.POPUP,
            }}
            position="popper"
            sideOffset={4}
            align="start"
          >
            {loading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2
                  size={16}
                  className="animate-spin"
                  style={{ color: 'var(--text-muted)' }}
                />
              </div>
            ) : options.length === 0 ? (
              <div
                className="text-xs py-2 text-center"
                style={{ color: 'var(--text-muted)' }}
              >
                {t('暂无数据')}
              </div>
            ) : (
              <SelectPrimitive.Viewport className="max-h-60">
                {/* 空字符串选项（"全部/不限/所有角色"等）是合法的显式选项，必须可再次选中，
                    否则用户筛选后无法通过下拉回到无筛选状态，只能刷新页面 */}
                {options
                  .filter((option) => option.value !== 0)
                  .map((option) => (
                    <SelectPrimitive.Item
                      key={option.value}
                      value={String(option.value)}
                      disabled={option.disabled}
                      className={`${itemBaseCls} ${cfg.itemCls} ${cfg.itemGap}`}
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      {option.icon && (
                        <option.icon size={14} style={{ flexShrink: 0 }} />
                      )}
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
          <input
            type="hidden"
            name={name}
            value={value !== undefined ? String(value) : ''}
          />
        )}
      </div>
    </SelectPrimitive.Root>
  );
};

const SearchableSelect: React.FC<SelectProps> = ({
  value,
  onChange,
  options,
  placeholder = t('搜索...'),
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
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
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

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const q = e.target.value;
      setSearchQuery(q);
      onSearch?.(q);
    },
    [onSearch]
  );

  const handleSelect = useCallback(
    (option: SelectOption) => {
      onChange?.(String(option.value));
      setIsOpen(false);
      setSearchQuery('');
    },
    [onChange]
  );

  const handleClear = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onChange?.('');
      setSearchQuery('');
    },
    [onChange]
  );

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
        <span
          className="flex-1 text-left truncate"
          style={{
            color: selectedOption
              ? 'var(--text-primary)'
              : 'var(--text-tertiary)',
          }}
        >
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <span
          className="flex items-center flex-shrink-0"
          style={{ gap: '2px' }}
        >
          {clearable && value && (
            <span
              role="button"
              tabIndex={-1}
              onClick={handleClear}
              onPointerDown={(e) => e.stopPropagation()}
              className="flex items-center justify-center rounded-full transition-colors duration-150 hover:bg-[rgba(255,255,255,0.1)]"
              style={{
                width: cfg.iconSize + 4,
                height: cfg.iconSize + 4,
                color: 'var(--text-muted)',
              }}
            >
              <X size={cfg.iconSize * 0.75} />
            </span>
          )}
          <ChevronDown
            size={cfg.iconSize}
            style={{
              color: 'var(--text-muted)',
              flexShrink: 0,
              transition: 'transform 0.2s',
              transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            }}
          />
        </span>
      </div>

      {isOpen && (
        <div
          className="absolute w-full mt-1 rounded-xl p-1 shadow-xl overflow-hidden"
          style={{
            background: 'var(--menu-bg)',
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
            <Search
              size={12}
              style={{ color: 'var(--text-muted)', flexShrink: 0 }}
            />
            <input
              ref={searchInputRef}
              value={searchQuery}
              onChange={handleSearchChange}
              placeholder={placeholder}
              className="flex-1 bg-transparent outline-none min-w-0 py-1.5 pl-1.5 text-xs"
              style={{ color: 'var(--text-primary)' }}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setIsOpen(false);
                }
                if (e.key === 'Enter' && filteredOptions.length > 0) {
                  handleSelect(filteredOptions[0]!);
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
              <Loader2
                size={16}
                className="animate-spin"
                style={{ color: 'var(--text-muted)' }}
              />
            </div>
          ) : filteredOptions.length === 0 ? (
            <div
              className="text-xs py-2 text-center"
              style={{ color: 'var(--text-muted)' }}
            >
              {t('暂无数据')}
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
                      color: isSelected
                        ? 'var(--info)'
                        : 'var(--text-secondary)',
                      background: isSelected
                        ? 'rgba(0, 156, 255, 0.1)'
                        : 'transparent',
                    }}
                    onClick={() => {
                      if (!option.disabled) {
                        handleSelect(option);
                      }
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected && !option.disabled) {
                        e.currentTarget.style.background =
                          'var(--menu-highlight)';
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
                    {option.icon && (
                      <option.icon size={14} style={{ flexShrink: 0 }} />
                    )}
                    <span className="flex-1 truncate">
                      {renderOption ? renderOption(option) : option.label}
                    </span>
                    {isSelected && (
                      <Check
                        size={14}
                        style={{ color: 'var(--info)', flexShrink: 0 }}
                      />
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

export interface MultiSelectProps {
  /** 选中值数组（多选为数组，单选 Select 保持字符串语义不变） */
  value: string[];
  onChange: (values: string[]) => void;
  options: SelectOption[];
  placeholder?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  /** 是否显示"全部清除"按钮 */
  clearable?: boolean;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
  wrapperClassName?: string;
}

/**
 * 多选下拉（审计筛选等场景）
 *
 * 基于 Radix Select 的 Trigger/Portal/Content 弹层，选项交互自定义：
 * 点击 toggle 选中、不关闭下拉；trigger 内渲染选中 tag（每个 tag 带 X 可单独移除）。
 * 与 SimpleSelect 相同：trigger 内所有可点击元素必须拦截 pointerdown
 * 冒泡，否则 Radix Trigger 的 preventDefault 会抑制 click 派发。
 */
export const MultiSelect: React.FC<MultiSelectProps> = ({
  value,
  onChange,
  options,
  placeholder = t('请选择'),
  size = 'md',
  clearable,
  disabled,
  loading,
  className,
  wrapperClassName,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const cfg = sizeConfig[size];

  const selectedOptions = useMemo(
    () => options.filter((o) => value.includes(String(o.value))),
    [options, value]
  );

  const toggleOption = useCallback(
    (optionValue: string | number) => {
      const v = String(optionValue);
      if (value.includes(v)) {
        onChange(value.filter((item) => item !== v));
      } else {
        onChange([...value, v]);
      }
    },
    [value, onChange]
  );

  const handleRemoveTag = useCallback(
    (e: React.MouseEvent, optionValue: string | number) => {
      e.stopPropagation();
      toggleOption(optionValue);
    },
    [toggleOption]
  );

  const handleClearAll = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onChange([]);
    },
    [onChange]
  );

  return (
    <SelectPrimitive.Root
      open={isOpen}
      onOpenChange={setIsOpen}
      disabled={disabled}
    >
      <div className={`relative ${wrapperClassName || ''}`}>
        <SelectPrimitive.Trigger asChild>
          <button
            type="button"
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
          >
            <span className="flex-1 text-left truncate">
              {selectedOptions.length > 0 ? (
                <span className="flex items-center gap-1 flex-wrap">
                  {selectedOptions.map((option) => (
                    <span
                      key={option.value}
                      className="flex items-center gap-0.5 rounded-full pl-1.5 pr-0.5 py-px"
                      style={{
                        background: 'rgba(0,156,255,0.12)',
                        color: 'var(--info)',
                      }}
                    >
                      <span className="truncate max-w-[10em]">
                        {option.label}
                      </span>
                      <span
                        role="button"
                        tabIndex={-1}
                        aria-label={`${t('移除')} ${option.label}`}
                        onClick={(e) => handleRemoveTag(e, option.value)}
                        onPointerDown={(e) => e.stopPropagation()}
                        className="flex items-center justify-center rounded-full hover:bg-[rgba(255,255,255,0.2)]"
                        style={{
                          width: cfg.iconSize + 4,
                          height: cfg.iconSize + 4,
                          color: 'inherit',
                        }}
                      >
                        <X size={cfg.iconSize * 0.7} />
                      </span>
                    </span>
                  ))}
                </span>
              ) : (
                <span style={{ color: 'var(--text-tertiary)' }}>
                  {placeholder}
                </span>
              )}
            </span>

            <span
              className="flex items-center flex-shrink-0"
              style={{ gap: '2px' }}
            >
              {clearable && value.length > 0 && (
                <span
                  role="button"
                  tabIndex={-1}
                  aria-label={t('清除')}
                  onClick={handleClearAll}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="flex items-center justify-center rounded-full transition-colors duration-150 hover:bg-[rgba(255,255,255,0.1)]"
                  style={{
                    width: cfg.iconSize + 4,
                    height: cfg.iconSize + 4,
                    color: 'var(--text-muted)',
                  }}
                >
                  <X size={cfg.iconSize * 0.75} />
                </span>
              )}
              <ChevronDown
                size={cfg.iconSize}
                style={{
                  color: 'var(--text-muted)',
                  flexShrink: 0,
                  transition: 'transform 0.2s',
                  transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                }}
              />
            </span>
          </button>
        </SelectPrimitive.Trigger>

        <SelectPrimitive.Portal>
          <SelectPrimitive.Content
            className="min-w-[var(--radix-select-trigger-width)] rounded-xl p-1 shadow-xl overflow-hidden"
            style={{
              background: 'var(--menu-bg)',
              border: '1px solid var(--border-default)',
              zIndex: Z_LAYERS.POPUP,
            }}
            position="popper"
            sideOffset={4}
            align="start"
          >
            {loading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2
                  size={16}
                  className="animate-spin"
                  style={{ color: 'var(--text-muted)' }}
                />
              </div>
            ) : options.length === 0 ? (
              <div
                className="text-xs py-2 text-center"
                style={{ color: 'var(--text-muted)' }}
              >
                {t('暂无数据')}
              </div>
            ) : (
              <SelectPrimitive.Viewport className="max-h-60">
                {options.map((option) => {
                  const isSelected = value.includes(String(option.value));
                  return (
                    <div
                      key={option.value}
                      role="option"
                      aria-selected={isSelected}
                      className={`relative flex items-center w-full rounded-md outline-none cursor-pointer select-none transition-colors duration-150 ${cfg.itemCls} ${cfg.itemGap} ${
                        option.disabled ? 'opacity-50 cursor-not-allowed' : ''
                      }`}
                      style={{
                        color: isSelected
                          ? 'var(--info)'
                          : 'var(--text-secondary)',
                        background: isSelected
                          ? 'rgba(0,156,255,0.1)'
                          : 'transparent',
                      }}
                      onClick={() => {
                        if (!option.disabled) {
                          toggleOption(option.value);
                        }
                      }}
                      onMouseEnter={(e) => {
                        if (!isSelected && !option.disabled) {
                          e.currentTarget.style.background =
                            'var(--menu-highlight)';
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
                      {option.icon && (
                        <option.icon size={14} style={{ flexShrink: 0 }} />
                      )}
                      <span className="flex-1 truncate">{option.label}</span>
                      {isSelected && (
                        <Check
                          size={14}
                          style={{ color: 'var(--info)', flexShrink: 0 }}
                        />
                      )}
                    </div>
                  );
                })}
              </SelectPrimitive.Viewport>
            )}
          </SelectPrimitive.Content>
        </SelectPrimitive.Portal>
      </div>
    </SelectPrimitive.Root>
  );
};

MultiSelect.displayName = 'MultiSelect';

export const Select: React.FC<SelectProps> = (props) => {
  if (props.searchable) {
    return <SearchableSelect {...props} />;
  }
  return <SimpleSelect {...props} />;
};

Select.displayName = 'Select';

export default Select;
