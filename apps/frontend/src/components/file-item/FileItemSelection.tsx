import React, { memo, useCallback } from 'react';

interface FileItemSelectionProps {
  isSelected: boolean;
  isMultiSelectMode: boolean;
  onSelect: (isShift: boolean) => void;
  isGrid?: boolean;
}

export const FileItemSelection: React.FC<FileItemSelectionProps> = memo(
  ({ isSelected, isMultiSelectMode, onSelect, isGrid = false }) => {
    const handleClick = useCallback(
      (e: React.MouseEvent) => {
        e.stopPropagation();
        const isShift = e.shiftKey;
        onSelect(isShift);
      },
      [onSelect]
    );

    if (!isMultiSelectMode) return null;

    return (
      <div
        className={`${
          isGrid ? 'absolute top-3 left-3' : ''
        } w-5 h-5 rounded-full border-2 flex-shrink-0 transition-all duration-200 cursor-pointer z-10 ${
          isSelected
            ? 'border-transparent'
            : isGrid
              ? 'group-hover:border-[var(--primary-500)]'
              : 'group-hover:border-[var(--primary-500)]'
        }`}
        style={{
          background: isSelected ? 'var(--primary-500)' : isGrid ? 'var(--bg-secondary)' : 'transparent',
          borderColor: isSelected ? 'var(--primary-500)' : 'var(--border-default)',
        }}
        onClick={handleClick}
        title={isSelected ? '单击取消选择' : '单击选择'}
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
