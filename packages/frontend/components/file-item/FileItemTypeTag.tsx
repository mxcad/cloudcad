import React from 'react';
import { FileSystemNode } from '../../types/filesystem';

interface FileItemTypeTagProps {
  node: FileSystemNode;
}

export const FileItemTypeTag: React.FC<FileItemTypeTagProps> = ({ node }) => {
  const isRoot = node.isRoot;

  return (
    <div className="hidden sm:flex w-16 justify-end">
      <span
        className={`px-2 py-0.5 text-xs rounded-full whitespace-nowrap ${
          isRoot
            ? 'bg-indigo-100 text-indigo-700'
            : node.isFolder
              ? 'bg-amber-100 text-amber-700'
              : node.extension === '.dwg'
                ? 'bg-blue-100 text-blue-700'
                : node.extension === '.dxf'
                  ? 'bg-green-100 text-green-700'
                  : node.extension === '.pdf'
                    ? 'bg-red-100 text-red-700'
                    : 'bg-slate-100 text-slate-700'
        }`}
      >
        {isRoot
          ? '项目'
          : node.isFolder
            ? '文件夹'
            : node.extension?.toUpperCase().replace('.', '')}
      </span>
    </div>
  );
};