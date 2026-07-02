import React, { memo, useCallback } from 'react';
import { t } from '@/languages';

interface FileItemSelectionProps {
  isSelected: boolean;
  onSelect: (isShift: boolean) => void;
  isGrid?: boolean;
  isDraggable?: boolean;
}

export const FileItemSelection: React.FC<FileItemSelectionProps> = memo(
  ({ isSelected, onSelect, isGrid = false, isDraggable = false }) => {
    const handleClick = useCallback(
      (e: React.MouseEvent) => {
        e.stopPropagation();
        const isShift = e.shiftKey;
        onSelect(isShift);
      },
      [onSelect]
    );

    return (
      <div
        data-drag-handle
        className={`${
          isGrid ? 'absolute top-3 left-3' : ''
        } w-5 h-5 rounded-full border-2 flex-shrink-0 transition-all duration-200 cursor-pointer z-10 ${
          isSelected
            ? 'border-transparent'
            : isGrid
              ? 'opacity-0 group-hover:opacity-100'
              : 'opacity-0 group-hover:opacity-100'
        } ${isDraggable ? 'cursor-grab active:cursor-grabbing' : ''}`}
        style={{
          background: isSelected ? 'var(--primary-500)' : 'var(--bg-secondary)',
          borderColor: isSelected ? 'var(--primary-500)' : 'var(--border-default)',
        }}
        draggable={isDraggable}
        onClick={handleClick}
        onMouseDown={(e) => { e.stopPropagation(); }}
        title={isSelected ? t('单击取消选择') : isDraggable ? t('点击选择，拖拽移动') : t('单击选择')}
      >
        {isSelected && (
          <svg
            className="w-full h-full text-white p-0.5"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
              clipRule="evenodd"
            />
          </svg>
        )}
      </div>
    );
  }
);
