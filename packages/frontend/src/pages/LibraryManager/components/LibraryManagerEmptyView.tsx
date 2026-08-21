import React from 'react';
import { Button } from '@/components/ui/Button';
import { EmptyFolderIcon } from '../../../components/FileIcons';
import { t } from '@/languages';

interface LibraryManagerEmptyViewProps {
  isFolderMode: boolean;
  canManage: boolean;
  openCreateFolderModal: () => void;
}

export const LibraryManagerEmptyView: React.FC<
  LibraryManagerEmptyViewProps
> = ({ isFolderMode, canManage, openCreateFolderModal }) => (
  <div className="flex flex-col items-center justify-center h-full">
    <EmptyFolderIcon size={80} className="text-slate-300 mb-6 animate-float" />
    <h3
      className="text-xl font-bold text-slate-900 mb-2"
      style={{ color: 'var(--text-primary)' }}
    >
      {isFolderMode ? t('文件夹是空的') : t('资源库暂无内容')}
    </h3>
    <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
      {canManage
        ? t('上传文件或创建文件夹开始使用')
        : t('资源库暂无内容，请稍后再来')}
    </p>
    {canManage && (
      <div className="flex gap-2">
        <Button onClick={openCreateFolderModal} variant="outline">
          {t('创建文件夹')}
        </Button>
      </div>
    )}
  </div>
);
