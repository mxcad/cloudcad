import React, { memo, useMemo } from 'react';
import { FileSystemNode } from '../../types/filesystem';

interface FileItemTypeTagProps {
  node: FileSystemNode;
}

export const FileItemTypeTag: React.FC<FileItemTypeTagProps> = memo(({ node }) => {
  const isRoot = node.isRoot;

  const tagClass = useMemo(() => {
    if (isRoot) return 'bg-indigo-100 text-indigo-700';
    if (node.isFolder) return 'bg-amber-100 text-amber-700';
    if (node.extension === '.dwg') return 'bg-blue-100 text-blue-700';
    if (node.extension === '.dxf') return 'bg-green-100 text-green-700';
    if (node.extension === '.pdf') return 'bg-red-100 text-red-700';
    return 'bg-slate-100 text-slate-700';
  }, [isRoot, node.isFolder, node.extension]);

  const tagText = useMemo(() => {
    if (isRoot) return '项目';
    if (node.isFolder) return '文件夹';
    return node.extension?.toUpperCase().replace('.', '') || '';
  }, [isRoot, node.isFolder, node.extension]);

  return (
    <div className="hidden sm:flex w-16 justify-end">
      <span className={`px-2 py-0.5 text-xs rounded-full whitespace-nowrap ${tagClass}`}>
        {tagText}
      </span>
    </div>
  );
});