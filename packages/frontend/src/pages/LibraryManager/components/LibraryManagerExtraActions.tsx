import React from 'react';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { t } from '@/languages';

interface LibraryManagerExtraActionsProps {
  libraryType: 'drawing' | 'block';
  canManage: boolean;
  handleSwitchLibrary: (type: 'drawing' | 'block') => void;
  openDirectoryImport: () => void;
}

export const LibraryManagerExtraActions: React.FC<
  LibraryManagerExtraActionsProps
> = ({ libraryType, canManage, handleSwitchLibrary, openDirectoryImport }) => (
  <>
    <Select
      value={libraryType}
      onChange={(val) => handleSwitchLibrary(val as 'drawing' | 'block')}
      options={[
        { value: 'drawing', label: t('图纸库') },
        { value: 'block', label: t('图块库') },
      ]}
      size="sm"
    />
    {canManage && (
      <Button
        onClick={openDirectoryImport}
        variant="secondary"
        size="sm"
        className="hover:bg-[var(--bg-tertiary)]"
        style={{ color: 'var(--text-tertiary)' }}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
        <span className="hidden sm:inline">{t('批量导入')}</span>
      </Button>
    )}
  </>
);
