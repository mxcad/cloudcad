import React from 'react';
import { t } from '@/languages';
import { CheckSquare, X } from 'lucide-react';

interface MultiSelectBarProps {
  selectedCount: number;
  onClearSelection: () => void;
  children?: React.ReactNode;
}

export const MultiSelectBar: React.FC<MultiSelectBarProps> = ({
  selectedCount,
  onClearSelection,
  children,
}) => {
  if (selectedCount === 0) return null;

  return (
    <div
      className="flex-shrink-0 flex justify-center py-3"
      style={{ borderTop: '1px solid var(--border-subtle)' }}
    >
      <div
        className="inline-flex items-center gap-2 sm:gap-4 px-3 sm:px-6 py-2 sm:py-3 rounded-full shadow-2xl"
        style={{
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-default)',
        }}
      >
        <div className="relative flex items-center justify-center min-w-[44px] min-h-[44px]">
          <CheckSquare
            size={20}
            style={{ color: 'var(--primary-500)' }}
          />
          <span
            className="absolute -top-1 -right-1 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold rounded-full"
            style={{
              background: 'var(--primary-500)',
              color: 'var(--text-inverse)',
            }}
          >
            {selectedCount > 99 ? '99+' : selectedCount}
          </span>
        </div>
        <span
          className="hidden sm:inline text-sm font-semibold whitespace-nowrap"
          style={{ color: 'var(--text-primary)' }}
        >
          {t('已选中 {count} 项', { count: selectedCount })}
        </span>
        <div
          className="hidden sm:block w-px h-4"
          style={{ background: 'var(--border-default)' }}
        />
        {children}
        <div
          className="hidden sm:block w-px h-4"
          style={{ background: 'var(--border-default)' }}
        />
        <button
          onClick={onClearSelection}
          className="flex items-center justify-center min-w-[44px] min-h-[44px] sm:min-w-0 sm:min-h-0 sm:w-auto sm:h-auto sm:p-0 hover:opacity-70 transition-opacity"
          style={{ color: 'var(--text-secondary)', background: 'none', border: 'none', cursor: 'pointer' }}
          aria-label={t('取消选择')}
        >
          <X size={18} className="sm:hidden" />
          <span className="hidden sm:inline text-sm font-medium">{t('取消选择')}</span>
        </button>
      </div>
    </div>
  );
};
