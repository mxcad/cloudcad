import React from 'react';

interface FileItemSelectionProps {
  isSelected: boolean;
  isMultiSelectMode: boolean;
  onSelect: (isShift: boolean) => void;
  isGrid?: boolean;
}

export const FileItemSelection: React.FC<FileItemSelectionProps> = ({
  isSelected,
  isMultiSelectMode,
  onSelect,
  isGrid = false,
}) => {
  if (!isMultiSelectMode) return null;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const isShift = e.shiftKey;
    onSelect(isShift);
  };

  return (
    <div
      className={`${
        isGrid ? 'absolute top-3 left-3' : ''
      } w-5 h-5 rounded-full border-2 flex-shrink-0 transition-all duration-200 cursor-pointer z-10 ${
        isSelected ? 'bg-indigo-500 border-indigo-500' : isGrid ? 'bg-white/80 border-slate-300 group-hover:border-indigo-400' : 'border-slate-300 group-hover:border-indigo-400'
      }`}
      onClick={handleClick}
      title={isSelected ? '单击取消选择' : '单击选择'}
    >
      {isSelected && (
        <svg className="w-full h-full text-white p-0.5" viewBox="0 0 20 20" fill="currentColor">
          <path
            fillRule="evenodd"
            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
            clipRule="evenodd"
          />
        </svg>
      )}
    </div>
  );
};