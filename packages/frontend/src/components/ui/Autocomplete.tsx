import type React from 'react';
import { useLayoutEffect, useRef, useState } from 'react';
import { Search, Loader2, X } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { Z_LAYERS } from '@/constants/layers';
import { Tooltip } from '@/components/ui/Tooltip';
import { t } from '@/languages';

const POPUP_MAX_HEIGHT = 280;
const POPUP_EDGE_GAP = 8;

export interface PopupPlacement {
  /** bottom = 输入框下方展开；top = 上方展开 */
  side: 'bottom' | 'top';
  /** 收到可用空间内的实际最大高度 */
  maxHeight: number;
}

/**
 * 展开朝向与高度决策：下方放得下就向下；放不下时改向上，两侧都放不下时
 * 取空间更大的一侧，并把高度收到可用空间内——始终向下撑开会让滚动容器里的
 * 整页被拉高
 */
export function resolvePopupPlacement(
  rect: { top: number; bottom: number },
  areaBottom: number
): PopupPlacement {
  const below = areaBottom - rect.bottom - POPUP_EDGE_GAP;
  const above = rect.top - POPUP_EDGE_GAP;
  if (below >= POPUP_MAX_HEIGHT) {
    return { side: 'bottom', maxHeight: POPUP_MAX_HEIGHT };
  }
  return {
    side: above > below ? 'top' : 'bottom',
    maxHeight: Math.min(POPUP_MAX_HEIGHT, Math.max(above, below, 0)),
  };
}

// 可用空间由「最近的滚动容器」决定而不是整个视口：拿 window.innerHeight 会把
// 应用顶部导航的高度误算成剩余空间，判断为放得下、实际仍向下溢出
function scrollAreaBottom(el: HTMLElement): number {
  for (
    let node = el.parentElement;
    node && node !== document.body;
    node = node.parentElement
  ) {
    const overflowY = getComputedStyle(node).overflowY;
    if (overflowY === 'auto' || overflowY === 'scroll') {
      return node.getBoundingClientRect().bottom;
    }
  }
  return window.innerHeight;
}

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
  onFocus?: React.FocusEventHandler<HTMLInputElement>;
  onBlur?: React.FocusEventHandler<HTMLInputElement>;
  className?: string;
  wrapperClassName?: string;
  dataTour?: string;
}

export const Autocomplete: React.FC<AutocompleteProps> = ({
  value = '',
  onChange,
  onSearch,
  loading = false,
  items,
  onSelectItem,
  placeholder = t('搜索...'),
  renderItem,
  getItemKey,
  open,
  onOpenChange,
  onFocus,
  onBlur,
  className = '',
  wrapperClassName = '',
  dataTour,
}) => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<PopupPlacement>(() => ({
    side: 'bottom',
    maxHeight: POPUP_MAX_HEIGHT,
  }));

  // 展开时按当时的位置算一次朝向；useLayoutEffect 在绘制前完成，
  // 避免先向下撑开再翻上去的闪动
  useLayoutEffect(() => {
    if (!open || !wrapperRef.current) return;
    const rect = wrapperRef.current.getBoundingClientRect();
    const next = resolvePopupPlacement(
      rect,
      scrollAreaBottom(wrapperRef.current)
    );
    setPlacement((cur) =>
      cur.side === next.side && cur.maxHeight === next.maxHeight ? cur : next
    );
  }, [open]);

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

  const showClear = (value ?? '').length > 0 && !loading;

  return (
    <div ref={wrapperRef} className={`relative ${wrapperClassName}`}>
      <Input
        data-tour={dataTour}
        leftIcon={Search}
        value={value}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onFocus={onFocus}
        onBlur={onBlur}
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
              <Tooltip content={t('清除')}>
                <button
                  type="button"
                  onClick={handleClear}
                  className="flex items-center justify-center rounded-full transition-colors duration-150 hover:bg-[rgba(255,255,255,0.1)]"
                  style={{ color: 'var(--text-muted)', width: 18, height: 18 }}
                >
                  <X size={12} />
                </button>
              </Tooltip>
            )}
          </>
        }
      />
      {open && (
        <div
          className="absolute w-full rounded-xl p-1 shadow-xl overflow-hidden"
          style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-default)',
            zIndex: Z_LAYERS.POPUP,
            maxHeight: placement.maxHeight,
            overflowY: 'auto',
            ...(placement.side === 'top'
              ? { bottom: '100%', marginBottom: 4 }
              : { marginTop: 4 }),
          }}
        >
          {loading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2
                size={16}
                className="animate-spin"
                style={{ color: 'var(--text-muted)' }}
              />
            </div>
          ) : items.length === 0 ? (
            <div
              className="text-xs py-2 text-center"
              style={{ color: 'var(--text-muted)' }}
            >
              {t('暂无数据')}
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
                  e.currentTarget.style.background =
                    'rgba(255, 255, 255, 0.05)';
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
