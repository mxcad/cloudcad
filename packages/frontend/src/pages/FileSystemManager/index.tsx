import React from 'react';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { t } from '@/languages';

import { useFileSystemManagerData } from './hooks/useFileSystemManagerData';
import { useFileSystemManagerActions } from './hooks/useFileSystemManagerActions';
import { buildFileSystemManagerViewProps } from './buildFileSystemManagerViewProps';
import { FileSystemManagerView } from './FileSystemManagerView';

interface FileSystemManagerProps {
  mode?: 'project' | 'personal-space';
}

export const FileSystemManager: React.FC<FileSystemManagerProps> = ({
  mode = 'project',
}) => {
  useDocumentTitle(mode === 'personal-space' ? t('我的图纸') : t('项目管理'));

  const data = useFileSystemManagerData({ mode });
  const actions = useFileSystemManagerActions({ data });
  const viewProps = buildFileSystemManagerViewProps(actions);

  return <FileSystemManagerView {...viewProps} />;
};

export default FileSystemManager;
