import React from 'react';
import { FileSystemNode } from '@/types/filesystem';
import { ProjectIcon } from './folderIcons';
import { FolderIcon } from './folderIcons';
import { DwgIcon, DxfIcon } from './cadFileIcons';
import { PdfIcon, ImageIcon, FileIcon } from './docFileIcons';

// 获取文件图标组件
export const getFileIconComponent = (
  node: FileSystemNode,
  size: number = 48
): React.ReactNode => {
  // 项目根节点使用专门的图标
  if (node.isRoot) {
    return <ProjectIcon size={size} className="flex-shrink-0" />;
  }

  if (node.isFolder) {
    return <FolderIcon size={size} className="flex-shrink-0" />;
  }

  const extension = node.extension?.toLowerCase() || '';

  switch (extension) {
    case '.dwg':
      return <DwgIcon size={size} className="flex-shrink-0" />;
    case '.dxf':
      return <DxfIcon size={size} className="flex-shrink-0" />;
    case '.pdf':
      return <PdfIcon size={size} className="flex-shrink-0" />;
    case '.png':
    case '.jpg':
    case '.jpeg':
    case '.gif':
    case '.webp':
      return <ImageIcon size={size} className="flex-shrink-0" />;
    default:
      return <FileIcon size={size} className="flex-shrink-0" />;
  }
};
