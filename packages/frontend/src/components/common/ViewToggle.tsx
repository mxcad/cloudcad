import React from 'react';
import { Grid3x3, List } from 'lucide-react';
import { Tooltip } from '@/components/ui/Tooltip';
import { t } from '@/languages';

export type ViewMode = 'grid' | 'list';

interface ViewToggleProps {
  viewMode: ViewMode;
  onChange: (mode: ViewMode) => void;
  className?: string;
  dataTour?: string;
}

const iconSize = 14;
const buttonPadding = 'p-1.5';

export const ViewToggle: React.FC<ViewToggleProps> = ({
  viewMode,
  onChange,
  className = '',
  dataTour,
}) => {
  return (
    <div
      className={`flex items-center rounded-xl overflow-hidden ${className}`}
      style={{
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-default)',
      }}
    >
      <Tooltip content={t('网格视图')}>
        <button
          type="button"
          onClick={() => onChange('grid')}
          className={`${buttonPadding} transition-colors duration-150`}
          style={{
            background: viewMode === 'grid' ? 'var(--primary-50)' : 'transparent',
            color: viewMode === 'grid' ? 'var(--primary-600)' : 'var(--text-tertiary)',
          }}
          aria-label={t('网格视图')}
          aria-pressed={viewMode === 'grid'}
        >
          <Grid3x3 size={iconSize} />
        </button>
      </Tooltip>
      <div
        className="w-px h-4"
        style={{ background: 'var(--border-default)' }}
      />
      <Tooltip content={t('列表视图')}>
        <button
          type="button"
          data-tour={dataTour}
          onClick={() => onChange('list')}
          className={`${buttonPadding} transition-colors duration-150`}
          style={{
            background: viewMode === 'list' ? 'var(--primary-50)' : 'transparent',
            color: viewMode === 'list' ? 'var(--primary-600)' : 'var(--text-tertiary)',
          }}
          aria-label={t('列表视图')}
          aria-pressed={viewMode === 'list'}
        >
          <List size={iconSize} />
        </button>
      </Tooltip>
    </div>
  );
};
