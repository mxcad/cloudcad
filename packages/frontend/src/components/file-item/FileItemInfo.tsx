import React, { memo, useMemo } from 'react';
import { FileSystemNode } from '../../types/filesystem';
import { formatDate, formatFileSize } from '../../utils/fileUtils';
import { FileNameText, DescriptionText } from '../ui/TruncateText';

interface FileItemInfoProps {
  node: FileSystemNode;
  isGrid?: boolean;
  galleryMode?: boolean;
  fontSize?: number | string;
}

export const FileItemInfo: React.FC<FileItemInfoProps> = memo(
  ({ node, isGrid = false, galleryMode = false, fontSize }) => {
    const isRoot = node.isRoot;

    const descriptionText = useMemo(
      () => {
        if (isRoot) {
          return node.description || '暂无描述';
        }
        if (node.isFolder) {
          return `${node._count?.children || 0} 个项目`;
        }
        if (galleryMode) {
          return formatDate(node.updatedAt);
        }
        return formatFileSize(node.size);
      },
      [
        isRoot,
        node.description,
        node.isFolder,
        node._count?.children,
        node.size,
        node.updatedAt,
        galleryMode,
      ]
    );

    if (isGrid) {
      return (
        <>
          <h3 className="font-medium text-slate-900 overflow-hidden w-full" style={{ minWidth: 0, display: 'flex', justifyContent: 'center', fontSize }}>
            <FileNameText showTooltip={true} style={{ minWidth: 0, width: '100%', fontSize }}>
              {node.name}
            </FileNameText>
          </h3>
          {!galleryMode && (
            <p className="text-xs text-slate-500 text-center mt-1 overflow-hidden w-full" style={{ minWidth: 0 }}>
              <DescriptionText showTooltip={true}>{descriptionText}</DescriptionText>
            </p>
          )}
        </>
      );
    }

    return (
      <div className="flex-1 min-w-0">
        <h3 className="font-medium text-slate-900 overflow-hidden w-full" style={{ minWidth: 0, fontSize }}>
          <FileNameText showTooltip={true} style={{ fontSize }}>
            {node.name}
          </FileNameText>
        </h3>
        <div className="flex items-center gap-2">
          <p className="text-xs text-slate-500">
            {formatDate(node.updatedAt)}
            {!node.isFolder && !galleryMode && ` • ${formatFileSize(node.size)}`}
          </p>
        </div>
      </div>
    );
  }
);
