import React, { memo, useMemo } from 'react';
import { AlertTriangle } from 'lucide-react';
import { FileSystemNode } from '../../types/filesystem';

interface FileItemExternalReferenceWarningProps {
  node: FileSystemNode;
  isGrid?: boolean;
}

export const FileItemExternalReferenceWarning: React.FC<FileItemExternalReferenceWarningProps> =
  memo(({ node, isGrid = false }) => {
    const missingCount = useMemo(
      () => node.missingExternalReferencesCount || 0,
      [node.missingExternalReferencesCount]
    );

    if (!node.hasMissingExternalReferences) return null;

    if (isGrid) {
      return (
        <div className="flex items-center justify-center gap-1 mt-1 px-2">
          <AlertTriangle size={12} className="text-amber-500 flex-shrink-0" />
          <span className="text-xs text-amber-600 whitespace-nowrap">
            缺失 {missingCount} 个外部参照
          </span>
        </div>
      );
    }

    return (
      <span className="flex items-center gap-1 text-xs text-amber-600">
        <AlertTriangle size={10} />
        缺失 {missingCount} 个外部参照
      </span>
    );
  });
