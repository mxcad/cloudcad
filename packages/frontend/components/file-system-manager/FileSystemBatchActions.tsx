import React, { memo, useCallback } from 'react';

interface FileSystemBatchActionsProps {
  selectedCount: number;
  onMove: () => void;
  onCopy: () => void;
  onDelete: () => void;
  onCancel: () => void;
}

export const FileSystemBatchActions: React.FC<FileSystemBatchActionsProps> =
  memo(({ selectedCount, onMove, onCopy, onDelete, onCancel }) => {
    if (selectedCount === 0) return null;

    const handleMove = useCallback(() => {
      onMove();
    }, [onMove]);

    const handleCopy = useCallback(() => {
      onCopy();
    }, [onCopy]);

    const handleDelete = useCallback(() => {
      onDelete();
    }, [onDelete]);

    const handleCancel = useCallback(() => {
      onCancel();
    }, [onCancel]);

    return (
      <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 bg-slate-900/95 backdrop-blur-xl text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-4 animate-slide-up">
        <span className="text-sm font-semibold">已选中 {selectedCount} 项</span>
        <div className="w-px h-4 bg-slate-700" />
        <button
          onClick={handleMove}
          className="text-slate-300 hover:text-white text-sm font-medium transition-colors"
        >
          移动
        </button>
        <button
          onClick={handleCopy}
          className="text-slate-300 hover:text-white text-sm font-medium transition-colors"
        >
          复制
        </button>
        <button
          onClick={handleDelete}
          className="text-error-400 hover:text-white text-sm font-medium transition-colors"
        >
          删除
        </button>
        <button
          onClick={handleCancel}
          className="text-slate-400 hover:text-white text-sm font-medium transition-colors"
        >
          取消
        </button>
      </div>
    );
  });
