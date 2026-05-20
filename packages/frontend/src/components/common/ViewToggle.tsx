import React from 'react';
import { Grid3x3, List } from 'lucide-react';

export type ViewMode = 'grid' | 'list';

interface ViewToggleProps {
  viewMode: ViewMode;
  onChange: (mode: ViewMode) => void;
  className?: string;
}

const iconSize = 14;
const buttonPadding = 'p-1.5';

export const ViewToggle: React.FC<ViewToggleProps> = ({
  viewMode,
  onChange,
  className = '',
}) => {
  return (
    <div
      className={`flex items-center rounded-xl overflow-hidden ${className}`}
      style={{
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-default)',
      }}
    >
      <button
        type="button"
        onClick={() => onChange('grid')}
        className={`${buttonPadding} transition-colors duration-150`}
        style={{
          background: viewMode === 'grid' ? 'var(--primary-50)' : 'transparent',
          color: viewMode === 'grid' ? 'var(--primary-600)' : 'var(--text-tertiary)',
        }}
        aria-label="网格视图"
        aria-pressed={viewMode === 'grid'}
      >
        <Grid3x3 size={iconSize} />
      </button>
      <div
        className="w-px h-4"
        style={{ background: 'var(--border-default)' }}
      />
      <button
        type="button"
        onClick={() => onChange('list')}
        className={`${buttonPadding} transition-colors duration-150`}
        style={{
          background: viewMode === 'list' ? 'var(--primary-50)' : 'transparent',
          color: viewMode === 'list' ? 'var(--primary-600)' : 'var(--text-tertiary)',
        }}
        aria-label="列表视图"
        aria-pressed={viewMode === 'list'}
      >
        <List size={iconSize} />
      </button>
    </div>
  );
};
