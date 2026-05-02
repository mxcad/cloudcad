import React from 'react';

interface BatchActionsBarProps {
  selectedCount: number;
  onMove: () => void;
  onCopy: () => void;
  onDelete: () => void;
  onClear: () => void;
  showRestore?: boolean;
  onRestore?: () => void;
  showPermanentDelete?: boolean;
}

export const BatchActionsBar: React.FC<BatchActionsBarProps> = ({
  selectedCount,
  onMove,
  onCopy,
  onDelete,
  onClear,
  showRestore = false,
  onRestore,
  showPermanentDelete = false,
}) => {
  return (
    <div
      className="fixed bottom-6 left-1/2 transform -translate-x-1/2 px-6 py-3 rounded-full shadow-2xl flex items-center gap-4 animate-slide-up"
      style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-default)',
        color: 'var(--text-primary)',
      }}
    >
      <span className="text-sm font-semibold">
        已选中 {selectedCount} 项
      </span>
      <div className="w-px h-4" style={{ background: 'var(--border-default)' }} />

      {showRestore && onRestore && (
        <button
          onClick={onRestore}
          className="text-emerald-400 hover:text-white text-sm font-medium transition-colors"
        >
          恢复
        </button>
      )}

      {!showRestore && (
        <>
          <button
            onClick={onMove}
            className="text-sm font-medium transition-colors"
            style={{ color: 'var(--text-secondary)' }}
          >
            移动
          </button>
          <button
            onClick={onCopy}
            className="text-sm font-medium transition-colors"
            style={{ color: 'var(--text-secondary)' }}
          >
            复制
          </button>
        </>
      )}

      {showPermanentDelete && (
        <button
          onClick={onDelete}
          className="text-sm font-medium transition-colors"
          style={{ color: 'var(--error)' }}
        >
          彻底删除
        </button>
      )}

      {!showPermanentDelete && (
        <button
          onClick={onDelete}
          className="text-sm font-medium transition-colors"
          style={{ color: 'var(--error)' }}
        >
          删除
        </button>
      )}

      <button
        onClick={onClear}
        className="text-sm font-medium transition-colors"
        style={{ color: 'var(--text-muted)' }}
      >
        取消
      </button>
    </div>
  );
};
