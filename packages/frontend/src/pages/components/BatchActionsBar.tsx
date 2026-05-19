import React from 'react';
import { Button } from '@/components/ui/Button';

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
        <Button
          variant="ghost"
          size="sm"
          onClick={onRestore}
          className="text-emerald-400 hover:text-white"
        >
          恢复
        </Button>
      )}

      {!showRestore && (
        <>
          <Button
            variant="ghost"
            size="sm"
            onClick={onMove}
            style={{ color: 'var(--text-secondary)' }}
          >
            移动
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onCopy}
            style={{ color: 'var(--text-secondary)' }}
          >
            复制
          </Button>
        </>
      )}

      {showPermanentDelete && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onDelete}
          style={{ color: 'var(--error)' }}
        >
          彻底删除
        </Button>
      )}

      {!showPermanentDelete && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onDelete}
          style={{ color: 'var(--error)' }}
        >
          删除
        </Button>
      )}

      <Button
        variant="ghost"
        size="sm"
        onClick={onClear}
        style={{ color: 'var(--text-muted)' }}
      >
        取消
      </Button>
    </div>
  );
};
