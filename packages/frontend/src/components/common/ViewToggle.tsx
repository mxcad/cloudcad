import React from 'react';
import { Grid3x3, List } from 'lucide-react';

export type ViewMode = 'grid' | 'list';

interface ViewToggleProps {
  viewMode: ViewMode;
  onChange: (mode: ViewMode) => void;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const ViewToggle: React.FC<ViewToggleProps> = ({
  viewMode,
  onChange,
  size = 'md',
  className = '',
}) => {
  const sizeConfig = {
    sm: { iconSize: 14, buttonPadding: 'p-1.5' },
    md: { iconSize: 16, buttonPadding: 'p-2' },
    lg: { iconSize: 18, buttonPadding: 'p-2.5' },
  };

  const config = sizeConfig[size];

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
        className={`${config.buttonPadding} transition-colors duration-150`}
        style={{
          background: viewMode === 'grid' ? 'var(--primary-50)' : 'transparent',
          color: viewMode === 'grid' ? 'var(--primary-600)' : 'var(--text-tertiary)',
        }}
        aria-label="网格视图"
        aria-pressed={viewMode === 'grid'}
      >
        <Grid3x3 size={config.iconSize} />
      </button>
      <div
        className="w-px h-4"
        style={{ background: 'var(--border-default)' }}
      />
      <button
        type="button"
        onClick={() => onChange('list')}
        className={`${config.buttonPadding} transition-colors duration-150`}
        style={{
          background: viewMode === 'list' ? 'var(--primary-50)' : 'transparent',
          color: viewMode === 'list' ? 'var(--primary-600)' : 'var(--text-tertiary)',
        }}
        aria-label="列表视图"
        aria-pressed={viewMode === 'list'}
      >
        <List size={config.iconSize} />
      </button>
    </div>
  );
};
