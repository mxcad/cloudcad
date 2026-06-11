import React from 'react';

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
        className="inline-flex items-center gap-4 px-6 py-3 rounded-full shadow-2xl"
        style={{
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-default)',
        }}
      >
        <span
          className="text-sm font-semibold whitespace-nowrap"
          style={{ color: 'var(--text-primary)' }}
        >
          已选中 {selectedCount} 项
        </span>
        <div
          className="w-px h-4"
          style={{ background: 'var(--border-default)' }}
        />
        {children}
        <div
          className="w-px h-4"
          style={{ background: 'var(--border-default)' }}
        />
        <button
          onClick={onClearSelection}
          className="text-sm font-medium hover:opacity-70 transition-opacity"
          style={{ color: 'var(--text-secondary)', background: 'none', border: 'none', cursor: 'pointer' }}
        >
          取消选择
        </button>
      </div>
    </div>
  );
};
