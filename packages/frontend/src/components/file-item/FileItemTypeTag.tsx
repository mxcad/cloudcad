import React, { memo, useMemo } from 'react';
import { Tag } from '../ui/Tag';
import type { TagVariant } from '../ui/Tag';
import { FileSystemNode } from '../../types/filesystem';
import { t } from '@/languages';

interface FileItemTypeTagProps {
  node: FileSystemNode;
}

const variantMap: Record<string, TagVariant> = {
  root: 'primary',
  folder: 'warning',
  '.dwg': 'info',
  '.dxf': 'success',
  '.pdf': 'error',
};

export const FileItemTypeTag: React.FC<FileItemTypeTagProps> = memo(
  ({ node }) => {
    const isRoot = node.isRoot;

    const tagVariant: TagVariant = useMemo(() => {
      if (isRoot) return variantMap.root ?? 'neutral';
      if (node.isFolder) return variantMap.folder ?? 'neutral';
      if (node.extension) return variantMap[node.extension] ?? 'neutral';
      return 'neutral';
    }, [isRoot, node.isFolder, node.extension]);

    const tagText = useMemo(() => {
      if (isRoot) return t('项目');
      if (node.isFolder) return t('文件夹');
      return node.extension?.toUpperCase().replace('.', '') || '';
    }, [isRoot, node.isFolder, node.extension]);

    return (
      <div className="hidden sm:flex w-16 justify-end">
        <Tag variant={tagVariant}>{tagText}</Tag>
      </div>
    );
  }
);
