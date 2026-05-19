import React, { memo, useCallback } from 'react';
import { Button } from '../ui/Button';

interface FileSystemBatchActionsProps {
  selectedCount: number;
  onMove: () => void;
  onCopy: () => void;
  onDelete: () => void;
  onCancel: () => void;
}

export const FileSystemBatchActions: React.FC<FileSystemBatchActionsProps> =
  memo(({ selectedCount, onMove, onCopy, onDelete, onCancel }) => {
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

    if (selectedCount === 0) return null;

    return (
      <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 bg-slate-900/95 backdrop-blur-xl text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-4 animate-slide-up">
        <span className="text-sm font-semibold">已选中 {selectedCount} 项</span>
        <div className="w-px h-4 bg-slate-700" />
        <Button variant="ghost" size="xs" className="text-slate-300 hover:text-white" onClick={handleMove}>
          移动
        </Button>
        <Button variant="ghost" size="xs" className="text-slate-300 hover:text-white" onClick={handleCopy}>
          复制
        </Button>
        <Button variant="danger" size="xs" onClick={handleDelete}>
          删除
        </Button>
        <Button variant="ghost" size="xs" className="text-slate-400 hover:text-white" onClick={handleCancel}>
          取消
        </Button>
      </div>
    );
  });
