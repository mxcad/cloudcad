import React, { memo, useMemo } from 'react';
import { FileSystemNode } from '../../types/filesystem';
import { formatDate, formatFileSize } from '../../utils/fileUtils';

interface FileItemInfoProps {
  node: FileSystemNode;
  isGrid?: boolean;
}

export const FileItemInfo: React.FC<FileItemInfoProps> = memo(({ node, isGrid = false }) => {
  const isRoot = node.isRoot;

  const descriptionText = useMemo(
    () =>
      isRoot
        ? node.description || '暂无描述'
        : node.isFolder
          ? `${node._count?.children || 0} 个项目`
          : formatFileSize(node.size),
    [isRoot, node.description, node.isFolder, node._count?.children, node.size]
  );

  if (isGrid) {
    return (
      <>
        <h3 className="font-medium text-slate-900 text-center truncate px-2" title={node.name}>
          {node.name}
        </h3>
        <p className="text-xs text-slate-500 text-center mt-1 truncate px-2" title={node.description || undefined}>
          {descriptionText}
        </p>
      </>
    );
  }

  return (
    <div className="flex-1 min-w-0">
      <h3
        className="font-medium text-slate-900 truncate"
        style={{
          direction: 'rtl',
          textAlign: 'left',
        }}
        title={node.name}
      >
        <span style={{ direction: 'ltr', unicodeBidi: 'embed' }}>{node.name}</span>
      </h3>
      <div className="flex items-center gap-2">
        <p className="text-xs text-slate-500">
          {formatDate(node.updatedAt)}
          {!node.isFolder && ` • ${formatFileSize(node.size)}`}
        </p>
      </div>
    </div>
  );
});